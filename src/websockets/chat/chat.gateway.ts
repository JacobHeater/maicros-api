// chat/chat.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SessionService } from '@/services/chat/session.service';
import { AgentService } from '@/services/llm/agent/agent.service';
import { LLMService } from '@/services/llm/llm.service';
import { WebSocketMessage } from './models/message';
import { ClientMessageType, ServerMessageType } from './models/message-type';
import { MessageStatus } from './models/message-status';
import { ChatMessageRole } from '@/services/common/models/chat-message';

@WebSocketGateway({ path: '/chat' })
export class ChatGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  // AbortControllers keyed by sessionId.
  // A new message on an existing session cancels the prior in-flight request first.
  private activeRequests = new Map<string, AbortController>();

  constructor(
    private readonly agent: AgentService,
    private readonly sessions: SessionService,
    private readonly llm: LLMService
  ) {}

  handleDisconnect(client: WebSocket) {
    const sessionId = (client as any).__sessionId as string | undefined;
    if (sessionId) this.abort(sessionId);
  }

  handleConnection(client: WebSocket) {
    // assign a server-side session id (channel id) tied to this connection
    const id = uuidv4();
    (client as any).__sessionId = id;
    try {
      client.send(JSON.stringify({ type: 'session', sessionId: id }));
      this.logger.log(`New WS connection assigned session=${id}`);
    } catch (e) {
      this.logger.debug('Failed to send session id to client');
    }

    // Keep Nest @SubscribeMessage handlers as the primary flow, but also
    // add a raw 'message' listener as a compatibility/fallback layer so
    // plain JSON frames from clients (no envelope/event) are handled.
    this.logger.log(
      `Socket event handlers are handled by @SubscribeMessage methods; adding raw fallback`
    );

    try {
      (client as any).on('message', (raw: unknown) => {
        try {
          const txt = typeof raw === 'string' ? raw : ((raw as Buffer).toString?.() ?? '');
          if (!txt) return;
          let parsed = JSON.parse(txt);
          // Support socket.io-style envelopes: { event, data }
          if (parsed && typeof parsed === 'object' && 'data' in parsed) {
            parsed = parsed.data;
          }

          // If it's a chat message, delegate to the same handler for consistency.
          const type = parsed?.type;
          if (type === ClientMessageType.ChatMessage) {
            // call handler directly; it's safe to call the method on this instance
            // (it returns a Promise but we don't need to await here)
            // Ensure session ownership is respected inside handler.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.handleMessage(client, parsed as WebSocketMessage);
            return;
          }

          if (type === ClientMessageType.Cancel || type === 'cancel') {
            const sessionId = parsed.sessionId ?? (client as any).__sessionId;
            this.abort(sessionId);
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: ServerMessageType.Canceled, sessionId }));
            }
            return;
          }

          if (type === ClientMessageType.Clear || type === 'clear') {
            const sessionId = parsed.sessionId ?? (client as any).__sessionId;
            this.abort(sessionId);
            this.sessions.clearSession(sessionId);
            return;
          }
        } catch (err) {
          this.logger.debug(`Failed to parse raw WS message: ${err}`);
        }
      });
    } catch (e) {
      this.logger.debug('Could not attach raw message fallback listener');
    }
  }

  @SubscribeMessage('message')
  async handleMessage(@ConnectedSocket() client: WebSocket, @MessageBody() data: WebSocketMessage) {
    if (data.type !== ClientMessageType.ChatMessage) {
      return;
    }

    // Prefer the server-assigned session id on the connection for ownership
    const connSessionId = (client as any).__sessionId as string | undefined;
    const { sessionId: payloadSessionId, payload } = data;
    // Validate client-provided sessionId if present
    if (payloadSessionId && connSessionId && payloadSessionId !== connSessionId) {
      this.logger.warn(
        `Client attempted to use sessionId ${payloadSessionId} but connection owns ${connSessionId}`
      );
      return;
    }
    const sessionId = connSessionId ?? payloadSessionId;

    this.logger.log(`Received message for session=${sessionId}`);
    // Cancel any existing in-flight request for this session before starting a new one
    this.abort(sessionId);

    const controller = new AbortController();
    this.activeRequests.set(sessionId, controller);
    const { signal } = controller;

    const send = (msg: WebSocketMessage) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(msg));
      }
    };

    try {
      this.logger.log(`Session ${sessionId}: retrieving history`);
      const history = this.sessions.getHistory(sessionId);
      this.logger.log(`Session ${sessionId}: history length=${history.length}`);

      // Phase 1: Agentic loop — tool calls complete before streaming starts.
      // tool_status events give the client real-time feedback during this phase.
      this.logger.log(`Session ${sessionId}: starting agent.run()`);
      const agentResult = await this.agent.run(payload, history, {
        signal,
        onToolStart: tool =>
          send({ type: ServerMessageType.ToolStatus, tool, status: MessageStatus.Started }),
        onToolEnd: tool =>
          send({ type: ServerMessageType.ToolStatus, tool, status: MessageStatus.Done }),
      });

      this.logger.log(`Session ${sessionId}: agent.run completed`);

      if (signal.aborted) {
        send({ type: ServerMessageType.Canceled, sessionId });
        return;
      }

      // Phase 2: If the agent already produced a final assistant turn,
      // stream that content directly to the client instead of calling
      // the LLM again (some agent runs embed the final answer already).
      let fullResponse = '';
      const last = agentResult.finalMessages[agentResult.finalMessages.length - 1];
      if (last && (last as any).role === ChatMessageRole.Assistant && (last as any).content) {
        const text = (last as any).content as string;
        fullResponse = text;
        this.logger.log(
          `Session ${sessionId}: agent produced assistant content, streaming locally length=${text.length}`
        );
        // send in reasonable chunks so client can incrementally render
        const CHUNK_SIZE = 256;
        for (let i = 0; i < text.length; i += CHUNK_SIZE) {
          if (signal.aborted) {
            this.logger.log(`Session ${sessionId}: local stream aborted`);
            break;
          }
          const chunk = text.slice(i, i + CHUNK_SIZE);
          this.logger.debug(`Session ${sessionId}: local token chunk length=${chunk.length}`);
          send({ type: ServerMessageType.Token, payload: chunk });
        }
        this.logger.log(
          `Session ${sessionId}: local stream ended, total length=${fullResponse.length}`
        );
      } else {
        // Phase 2: Stream the final answer token by token from the LLM.
        this.logger.log(`Session ${sessionId}: starting LLM stream`);
        for await (const chunk of this.llm.stream(agentResult.finalMessages, {}, signal)) {
          if (signal.aborted) {
            this.logger.log(`Session ${sessionId}: stream aborted`);
            break;
          }
          fullResponse += chunk;
          this.logger.debug(`Session ${sessionId}: streamed token chunk length=${chunk.length}`);
          send({ type: ServerMessageType.Token, payload: chunk });
        }
        this.logger.log(
          `Session ${sessionId}: LLM stream ended, total length=${fullResponse.length}`
        );
      }

      if (!signal.aborted) {
        // Persist only user + assistant turns — tool turns are internal agentic state
        this.logger.log(`Session ${sessionId}: persisting conversation`);
        this.sessions.append(sessionId, [
          { role: ChatMessageRole.User, content: payload },
          { role: ChatMessageRole.Assistant, content: fullResponse },
        ]);
        send({ type: ServerMessageType.Done, sessionId });
        this.logger.log(`Session ${sessionId}: Done sent`);
      } else {
        send({ type: ServerMessageType.Canceled, sessionId });
      }
    } catch (err) {
      if (!signal.aborted) {
        this.logger.error(`Session ${sessionId}: ${err?.message ?? err}`);
        send({
          type: ServerMessageType.Error,
          payload: 'An error occurred processing your message.',
        });
      }
    } finally {
      this.activeRequests.delete(sessionId);
    }
  }

  @SubscribeMessage('cancel')
  handleCancel(@ConnectedSocket() client: WebSocket, @MessageBody() data: WebSocketMessage) {
    if (data.type !== 'cancel') return;
    const connSessionId = (client as any).__sessionId as string | undefined;
    const sessionId = data.sessionId ?? connSessionId;
    if (!sessionId) return;
    this.abort(sessionId);
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: ServerMessageType.Canceled, sessionId }));
    }
  }

  @SubscribeMessage('clear')
  handleClear(@ConnectedSocket() _client: WebSocket, @MessageBody() data: WebSocketMessage) {
    if (data.type !== 'clear') return;
    const connSessionId = (_client as any).__sessionId as string | undefined;
    const sessionId = data.sessionId ?? connSessionId;
    if (!sessionId) return;
    this.abort(sessionId);
    this.sessions.clearSession(sessionId);
  }

  private abort(sessionId: string) {
    const controller = this.activeRequests.get(sessionId);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(sessionId);
    }
  }
}
