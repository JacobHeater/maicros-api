// chat/session.service.ts
import { Injectable } from '@nestjs/common';
import { ChatMessage } from '../common/models/chat-message';

@Injectable()
export class SessionService {
  // In production: replace with Redis + TTL (see Section 13)
  private sessions = new Map<string, ChatMessage[]>();

  getHistory(sessionId: string): ChatMessage[] {
    return this.sessions.get(sessionId) ?? [];
  }

  append(sessionId: string, messages: ChatMessage[]): void {
    const history = this.getHistory(sessionId);
    history.push(...messages);
    this.sessions.set(sessionId, this.trim(history));
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Trim history to a rough token budget.
   * Approximation: 1 token ≈ 4 characters. Walk backwards to preserve recency.
   * Replace with a proper tokenizer (e.g. @dqbd/tiktoken) if precision matters.
   */
  private trim(history: ChatMessage[], tokenBudget = 3000): ChatMessage[] {
    let chars = 0;
    const trimmed: ChatMessage[] = [];
    for (const msg of [...history].reverse()) {
      chars += msg.content.length;
      if (chars > tokenBudget * 4) break;
      trimmed.unshift(msg);
    }
    return trimmed;
  }
}
