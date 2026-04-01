import 'reflect-metadata';
import express from 'express';
import { createServer, Server } from 'http';
import { ServiceModule } from '@/services/service.module';
import { RouterModule } from '@/routes/router-module';
import { SocketModule } from '@/websockets/socket-module';
import { IModule } from '@/module';

class App {
  private app: express.Application;
  public server: Server;
  private modules: IModule[];

  constructor() {
    this.app = express();
    this.server = createServer(this.app);

    // Middleware
    this.app.use(express.json());

    // Initialize modules
    const serviceModule = new ServiceModule();
    const serviceContainer = serviceModule.container;

    this.modules = [
      serviceModule,
      new RouterModule(this.app),
      new SocketModule(this.server, serviceContainer),
    ];
  }

  public async start(): Promise<void> {
    for (const module of this.modules) {
      await module.initialize();
    }

    const port = process.env.PORT || 3001;
    this.server.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Server is running on http://localhost:${port}`);
    });
  }
}

const app = new App();
app.start().catch(error => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', error);
  process.exit(1);
});

export const server = app.server;
