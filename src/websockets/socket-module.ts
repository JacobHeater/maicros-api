import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server } from 'http';
import { IModule } from '@/module';
import { ChatSocket } from './chat/chat-socket';
import { SocketBase } from './socket-base';
import { ServiceContainer } from '@/services/service-container';

type SocketConstructor = {
  new (socket: Socket, container: ServiceContainer): SocketBase;
  path: string;
};

const socketNamespaces: SocketConstructor[] = [ChatSocket];

export class SocketModule implements IModule {
  constructor(
    private server: Server,
    private container: ServiceContainer,
  ) {}

  initialize() {
    const io = new SocketIOServer(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    socketNamespaces.forEach(SocketHandler => {
      const namespacePath = SocketHandler.path || '/';
      const namespace = io.of(namespacePath);

      namespace.on('connection', socket => {
        const handler = new SocketHandler(socket, this.container);
        // eslint-disable-next-line no-console
        console.log(`Socket connected to ${namespacePath}: ${socket.id}`);

        handler.register();

        socket.on('disconnect', reason => {
          // eslint-disable-next-line no-console
          console.log(`Socket disconnected from ${namespacePath}: ${socket.id} (${reason})`);
        });
      });
    });
  }
}
