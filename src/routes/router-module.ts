import { IModule } from '@/module';
import { HealthRouter } from './health/router';

export class RouterModule implements IModule {
  constructor(private app: any) {}

  initialize() {
    const routes = [new HealthRouter(this.app)];
    routes.forEach(route => route.register());
  }
}
