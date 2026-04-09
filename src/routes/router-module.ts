import { IModule } from '@/module';
import { HealthRouter } from './health/router';
import { Application } from 'express';

export class RouterModule implements IModule {
  constructor(private app: Application) {}

  initialize() {
    const routes = [new HealthRouter(this.app)];
    routes.forEach(route => route.register());
  }
}
