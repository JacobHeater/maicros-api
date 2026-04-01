import { RouteBase } from '../router-base';
import { Router, Response } from 'express';

export class HealthRoute extends RouteBase {
  define(): void {
    this.getHealthStatus();
  }

  private getHealthStatus(): void {
    this.router.get('/', (_, res: Response) => {
      res.status(200).json({ status: 'healthy' });
    });
  }
}
