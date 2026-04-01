import { ChatMessage } from '@//models/chat/chat-message';
import { Injectable } from '../injectable';
import { SessionStore } from './session-store';
import { DecomposedFood } from '@/models/llm/nutrition/meal-item';

@Injectable()
export class SessionService {
  // In production: replace with Redis + TTL (see Section 13)
  private sessions = new SessionStore();

  getMessageHistory(sessionId: string): ChatMessage[] {
    const vault = this.sessions.getSessionVault(sessionId);
    return vault ? (vault.get<ChatMessage[]>('history') ?? []) : [];
  }

  storeMessages(sessionId: string, messages: ChatMessage[]): void {
    const history = this.getMessageHistory(sessionId);
    history.push(...messages);
    const vault = this.sessions.getSessionVault(sessionId);

    if (vault) {
      vault.set('history', this.trim(history));
    } else {
      // NOTE: If this path hits, you create a `newSessionId` but the caller
      // who passed in `sessionId` won't know about it. You might want to
      // ensure your store can explicitly initialize the passed `sessionId`.
      const newSessionId = this.sessions.createSession();
      this.sessions.getSessionVault(newSessionId)?.set('history', this.trim(messages));
    }
  }

  getMealState(sessionId: string): DecomposedFood[] {
    const vault = this.sessions.getSessionVault(sessionId);
    return vault ? (vault.get<DecomposedFood[]>('mealState') ?? []) : [];
  }

  setMealState(sessionId: string, mealState: DecomposedFood[]): void {
    const vault = this.sessions.getSessionVault(sessionId);

    if (vault) {
      vault.set('mealState', mealState);
    } else {
      // Depending on your auth flow, you might want to initialize the
      // session here if it somehow doesn't exist yet.
      console.warn(`Attempted to set meal state for non-existent session: ${sessionId}`);
    }
  }

  createSession(): string {
    return this.sessions.createSession();
  }

  clearSession(sessionId: string): void {
    this.sessions.destroySession(sessionId);
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
