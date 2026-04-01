import { LoggerBase, LogTransport } from '../logger-base';

export class ConsoleLogger extends LoggerBase {
  constructor() {
    super(LogTransport.Console);
  }

  log(message: string, ...args: any[]): void {
    this.logger.info(message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.logger.error(message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.logger.warn(message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    this.logger.debug(message, ...args);
  }
}
