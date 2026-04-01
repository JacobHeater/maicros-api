import { v4 as uuid } from 'uuid';

class SessionRecord<TValue> {
  constructor(
    public key: string,
    public value: TValue
  ) {}
}

class SessionVault {
  private vault: SessionRecord<any>[] = [];

  set<TValue>(key: string, value: TValue): void {
    const idx = this.vault.findIndex(r => r.key === key);
    if (idx === -1) this.vault.push(new SessionRecord(key, value));
    else this.vault[idx].value = value;
  }

  get<TValue>(key: string): TValue | undefined {
    const record = this.vault.find(r => r.key === key);
    return record ? (record.value as TValue) : undefined;
  }

  delete(key: string): void {
    const index = this.vault.findIndex(r => r.key === key);
    if (index !== -1) {
      this.vault.splice(index, 1);
    }
  }
}

export class SessionStore {
  private sessions = new Map<string, { vault: SessionVault; expiresAt: number; ttlMs: number }>();
  private readonly defaultTtlMs: number;
  private readonly cleanupIntervalMs: number;
  private cleanupHandle: ReturnType<typeof setInterval> | undefined;

  constructor(defaultTtlMs = 30 * 60 * 1000, cleanupIntervalMs = 60 * 1000) {
    this.defaultTtlMs = defaultTtlMs;
    this.cleanupIntervalMs = cleanupIntervalMs;
    this.cleanupHandle = setInterval(() => this.cleanupExpired(), this.cleanupIntervalMs);
    if ((this.cleanupHandle as any)?.unref) (this.cleanupHandle as any).unref();
  }

  getSessionVault(sessionId: string): SessionVault | undefined {
    const entry = this.sessions.get(sessionId);
    if (!entry) return undefined;
    // Sliding expiration: extend expiry on access
    entry.expiresAt = Date.now() + entry.ttlMs;
    return entry.vault;
  }

  /**
   * Create a session with optional TTL (milliseconds). If not provided, uses default TTL.
   */
  createSession(ttlMs?: number): string {
    const sessionId = this.createSessionId();
    const ttl = ttlMs ?? this.defaultTtlMs;
    this.sessions.set(sessionId, {
      vault: new SessionVault(),
      expiresAt: Date.now() + ttl,
      ttlMs: ttl,
    });
    return sessionId;
  }

  /** Destroy a session immediately. */
  destroySession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Touch a session to explicitly extend its expiry by its TTL. Returns true if session exists. */
  touchSession(sessionId: string): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    entry.expiresAt = Date.now() + entry.ttlMs;
    return true;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.sessions.entries()) {
      if (entry.expiresAt <= now) this.sessions.delete(id);
    }
  }

  private createSessionId(): string {
    return uuid();
  }

  /** Stop the internal cleanup interval (call on shutdown). */
  stopCleanup(): void {
    if (this.cleanupHandle) {
      clearInterval(this.cleanupHandle);
      this.cleanupHandle = undefined;
    }
  }
}
