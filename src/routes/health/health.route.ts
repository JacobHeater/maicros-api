import { RouteBase } from '../router-base';
import { Router, Response } from 'express';

export class HealthRoute extends RouteBase {
  define(): void {
    this.router.get('/', this.getHealthStatus);
  }

  public getHealthStatus(_, res: Response): void {
    res.status(200).json({ status: 'healthy' });
  }
}
