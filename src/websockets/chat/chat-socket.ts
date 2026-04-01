import { SocketBase } from '../socket-base';
import { ServiceContainer } from '@/services/service-container';
import { v4 as uuidv4 } from 'uuid';
import { NewtonAgent } from '@/services/llm/agents/newton/newton.agent';
import { LLMService } from '@/services/llm/llm.service';
import { WebSocketMessage } from './models/message';
import { ClientMessageType, ServerMessageType } from './models/message-type';
import { MessageStatus } from './models/message-status';
import { ChatMessageRole } from '@/models/chat/chat-message';
import { logger } from '../../logging/logger';

export class ChatSocket extends SocketBase {
  static path = '/chat';
  private readonly agent: NewtonAgent;
  private readonly llm: LLMService;
  private readonly activeRequests = new Map<string, AbortController>();

  constructor(socket: any, container: ServiceContainer) {
    super(socket, container);

    const agent = container.get(NewtonAgent);
    const llm = container.get(LLMService);
    if (!agent || !llm) {
      throw new Error(
        'Required services (NewtonAgent, LLMService) must be registered in ServiceContainer'
      );
    }
    this.agent = agent as NewtonAgent;
    this.llm = llm as LLMService;
  }

  register(): void {
    try {
      this.socket.emit('session', { sessionId: this.sessionId });
      logger.log(`New socket.io connection assigned session=${this.sessionId}`);
    } catch (e) {
      logger.debug('Failed to send session id to client');
    }

    // Raw fallback for plain JSON frames
    this.addSocketListener('message', (raw: unknown) => {
      try {
        const txt = typeof raw === 'string' ? raw : ((raw as Buffer).toString?.() ?? '');
        if (!txt) return;
        let parsed: any = JSON.parse(txt);
        if (parsed && typeof parsed === 'object' && 'data' in parsed) parsed = parsed.data;

        const type = parsed?.type;
        if (type === ClientMessageType.ChatMessage) {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.handleMessage(parsed as WebSocketMessage);
          return;
        }

        if (type === ClientMessageType.Cancel || type === 'cancel') {
          const sessionId = parsed.sessionId ?? this.sessionId;
          this.abort(sessionId);
          this.socket.emit('message', { type: ServerMessageType.Canceled, sessionId });
          return;
        }

        if (type === ClientMessageType.Clear || type === 'clear') {
          const sessionId = parsed.sessionId ?? this.sessionId;
          this.abort(sessionId);
          this.sessions.clearSession(sessionId);
          return;
        }
      } catch (err) {
        logger.debug(`Failed to parse raw socket message: ${err}`);
      }
    });

    // Event-based handlers for convenience
    this.socket.on(ClientMessageType.ChatMessage, (data: WebSocketMessage) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.handleMessage(data);
    });

    this.socket.on(ClientMessageType.Cancel, (data: WebSocketMessage) => {
      const sessionId = data?.sessionId ?? this.sessionId;
      if (!sessionId) return;
      this.abort(sessionId);
      this.socket.emit('message', { type: ServerMessageType.Canceled, sessionId });
    });

    this.socket.on(ClientMessageType.Clear, (data: WebSocketMessage) => {
      const sessionId = data?.sessionId ?? this.sessionId;
      if (!sessionId) return;
      this.abort(sessionId);
      this.sessions.clearSession(sessionId);
    });
  }

  private async handleMessage(data: WebSocketMessage) {
    if (data?.type !== ClientMessageType.ChatMessage) return;

    const { sessionId: payloadSessionId, payload } = data;
    if (payloadSessionId && payloadSessionId !== this.sessionId) {
      logger.warn(
        `Client attempted to use sessionId ${payloadSessionId} but connection owns ${this.sessionId}`
      );
      return;
    }
    const sessionId = this.sessionId;

    logger.log(`Received message for session=${sessionId}`);
    this.abort(sessionId);

    const controller = new AbortController();
    this.activeRequests.set(sessionId, controller);
    const { signal } = controller;

    const send = (msg: WebSocketMessage) => {
      this.socket.emit('message', msg);
    };

    try {
      logger.log(`Session ${sessionId}: retrieving history`);
      const history = this.sessions.getMessageHistory(sessionId);
      logger.log(`Session ${sessionId}: history length=${history.length}`);

      logger.log(`Session ${sessionId}: starting agent.run()`);
      const agentResult = await this.agent.run(payload ?? '', history, {
        sessionId,
        signal,
        onToolStart: (tool: string) =>
          send({ type: ServerMessageType.ToolStatus, tool, status: MessageStatus.Started } as any),
        onToolEnd: (tool: string) =>
          send({ type: ServerMessageType.ToolStatus, tool, status: MessageStatus.Done } as any),
      });

      logger.log(`Session ${sessionId}: agent.run completed`);

      if (signal.aborted) {
        send({ type: ServerMessageType.Canceled, sessionId } as any);
        return;
      }

      let fullResponse = '';
      const last = agentResult.finalMessages[agentResult.finalMessages.length - 1];
      if (last && (last as any).role === ChatMessageRole.Assistant && (last as any).content) {
        const text = (last as any).content as string;
        fullResponse = text;
        logger.log(
          `Session ${sessionId}: agent produced assistant content, streaming locally length=${text.length}`
        );
        const CHUNK_SIZE = 256;
        for (let i = 0; i < text.length; i += CHUNK_SIZE) {
          if (signal.aborted) {
            logger.log(`Session ${sessionId}: local stream aborted`);
            break;
          }
          const chunk = text.slice(i, i + CHUNK_SIZE);
          logger.debug(`Session ${sessionId}: local token chunk length=${chunk.length}`);
          send({ type: ServerMessageType.Token, payload: chunk } as any);
        }
        logger.log(`Session ${sessionId}: local stream ended, total length=${fullResponse.length}`);
      } else {
        logger.log(`Session ${sessionId}: starting LLM stream`);
        for await (const chunk of this.llm.stream(agentResult.finalMessages, {}, signal)) {
          if (signal.aborted) {
            logger.log(`Session ${sessionId}: stream aborted`);
            break;
          }
          fullResponse += chunk;
          logger.debug(`Session ${sessionId}: streamed token chunk length=${chunk.length}`);
          send({ type: ServerMessageType.Token, payload: chunk } as any);
        }
        logger.log(`Session ${sessionId}: LLM stream ended, total length=${fullResponse.length}`);
      }

      if (!signal.aborted) {
        logger.log(`Session ${sessionId}: persisting conversation`);
        this.sessions.storeMessages(sessionId, [
          { role: ChatMessageRole.User, content: payload ?? '' },
          { role: ChatMessageRole.Assistant, content: fullResponse },
        ]);
        send({ type: ServerMessageType.Done, sessionId } as any);
        logger.log(`Session ${sessionId}: Done sent`);
      } else {
        send({ type: ServerMessageType.Canceled, sessionId } as any);
      }
    } catch (err: any) {
      if (!signal.aborted) {
        logger.error(`Session ${sessionId}: ${err?.message ?? err}`);
        send({
          type: ServerMessageType.Error,
          payload: 'An error occurred processing your message.',
        } as any);
      }
    } finally {
      this.activeRequests.delete(sessionId);
    }
  }

  private abort(sessionId?: string) {
    if (!sessionId) return;
    const controller = this.activeRequests.get(sessionId);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(sessionId);
    }
  }
}
