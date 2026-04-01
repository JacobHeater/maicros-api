import { logger } from '@/logging/logger';
import { ILogger } from '@/logging/logger-base';
import { ChatMessage, ChatMessageRole } from '@/models/chat/chat-message';
import { AgentRunOptions, AgentRunResult } from '@/models/llm/agent/agent-data';
import { LLMService } from '../llm.service';
import { ToolRegistryService } from '../tools/tool-registry.service';

export abstract class AgentBase {
  constructor(
    protected readonly llm: LLMService,
    protected readonly toolRegistry: ToolRegistryService
  ) {}

  protected readonly logger: ILogger = logger;
  protected readonly TOOL_CALL_REGEX = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  protected MAX_ITERATIONS = 5;

  public abstract run(
    userMessage: string,
    history: ChatMessage[],
    options: AgentRunOptions
  ): Promise<AgentRunResult>;

  protected abstract buildSystemPrompt(): string;

  /**
   * Builds the final message array for the LLM.
   * Prepends the system prompt, appends the history, and safely appends the
   * userMessage as the final turn if it exists.
   */
  protected buildMessages(history: ChatMessage[], userMessage?: string): ChatMessage[] {
    const msgs: ChatMessage[] = [
      { role: ChatMessageRole.System, content: this.buildSystemPrompt() },
    ];

    for (const msg of history) {
      if (msg.role === ChatMessageRole.System) continue;
      msgs.push(msg);
    }

    // Safely append the current user message if one was provided
    if (userMessage && userMessage.trim().length > 0) {
      msgs.push({ role: ChatMessageRole.User, content: userMessage });
    }

    return msgs;
  }
}
