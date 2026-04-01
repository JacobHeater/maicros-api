import { ChatMessage } from '../../chat/chat-message';

export interface AgentRunOptions {
  sessionId?: string;
  signal?: AbortSignal;
  onToolStart?: (toolName: string) => void;
  onToolEnd?: (toolName: string) => void;
}

export interface AgentRunResult {
  /**
   * Fully assembled LlmMessage array ready to pass directly to
   * LLMService.complete() / LLMService.stream() for final answer.
   * The gateway should pass this straight through.
   */
  finalMessages: ChatMessage[];
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>;
  iterations: number;
}
