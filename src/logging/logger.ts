import { ConsoleLogger } from './console/console.logger';
import { ILogger } from './logger-base';

class Logger implements ILogger {
  constructor() {}

  private loggers: ILogger[] = [new ConsoleLogger()];

  log(message: string, ...args: any[]): void {
    this.loggers.forEach(logger => logger.log(message, ...args));
  }

  error(message: string, ...args: any[]): void {
    this.loggers.forEach(logger => logger.error(message, ...args));
  }

  warn(message: string, ...args: any[]): void {
    this.loggers.forEach(logger => logger.warn(message, ...args));
  }

  debug(message: string, ...args: any[]): void {
    this.loggers.forEach(logger => logger.debug(message, ...args));
  }
}

export const logger = new Logger();
