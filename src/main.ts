import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Enable global validation using class-validator/class-transformer
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useWebSocketAdapter(new WsAdapter(app));
  const port = Number(process.env.PORT) || 3001;

  // Graceful shutdown handlers so hot-reload tools (ts-node-dev) can
  // restart the process without leaving the port bound and causing
  // EADDRINUSE errors.
  const shutdown = async (signal?: string) => {
    try {
      console.log(`Received ${signal ?? 'shutdown'} signal - closing Nest app`);
      await app.close();
    } catch (err) {
      console.error('Error during shutdown', err);
    }
  };

  process.once('SIGUSR2', async () => {
    await shutdown('SIGUSR2');
    // re-signal so tools like nodemon/ts-node-dev know to restart
    process.kill(process.pid, 'SIGUSR2');
  });
  process.on('SIGINT', async () => {
    await shutdown('SIGINT');
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await shutdown('SIGTERM');
    process.exit(0);
  });

  try {
    await app.listen(port);
    console.log(`Application is running on: http://localhost:${port}`);
  } catch (err: any) {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Ensure previous process exited.`);
      process.exit(1);
    }
    throw err;
  }
}
bootstrap();
