import { createLogger, format, Logger, transports } from 'winston';
import * as Transport from 'winston-transport';

export interface ILogger {
  log(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

export enum LogTransport {
  Console,
  File,
}

export abstract class LoggerBase implements ILogger {
  constructor(transport: LogTransport) {
    this.logger = createLogger({
      level: process.env.LOG_LEVEL || 'debug',
      format: format.combine(
        format.timestamp(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`;
        })
      ),
      transports: [this.mapTransport(transport)],
    });
  }
  protected logger: Logger;
  abstract log(message: string, ...args: any[]): void;
  abstract error(message: string, ...args: any[]): void;
  abstract warn(message: string, ...args: any[]): void;
  abstract debug(message: string, ...args: any[]): void;

  private mapTransport(transport: LogTransport): Transport {
    switch (transport) {
      case LogTransport.Console:
        return new transports.Console();
      case LogTransport.File:
        return new transports.File({ filename: 'app.log' });
      default:
        throw new Error('Invalid transport');
    }
  }
}
