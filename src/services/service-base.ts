import { ILogger } from '../logging/logger-base';
import { logger } from '../logging/logger';

export interface OnServiceInit {
  onServiceInit(): void | Promise<void>;
}

export abstract class ServiceBase {
  protected readonly logger: ILogger = logger;

  constructor() {
    // Services now get dependencies via constructor injection.
  }
}
