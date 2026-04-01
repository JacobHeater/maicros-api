import { ServiceContainer } from '@/services/service-container';
import { SessionService } from '@/services/session/session.service';
import { Socket } from 'socket.io';

export interface ISocket {
  register(): void;
}

export abstract class SocketBase implements ISocket {
  static path: string = '/';

  constructor(
    protected socket: Socket,
    protected container: ServiceContainer
  ) {
    this.sessions = container.get(SessionService);
    this.socket.data.sessionId = this.sessions.createSession();
  }

  protected readonly sessions: SessionService;

  get sessionId(): string {
    return this.socket.data.sessionId;
  }

  abstract register(): void;

  addSocketListener(event: string, callback: (...args: any[]) => void): void {
    this.socket.on(event, callback);
  }

  emit(event: string, ...args: any[]): void {
    this.socket.emit(event, ...args);
  }

  broadcast(event: string, ...args: any[]): void {
    this.socket.broadcast.emit(event, ...args);
  }
}
