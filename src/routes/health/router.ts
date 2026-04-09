import { IRoute, RouterBase } from '../router-base';
import { HealthRoute } from './health.route';

export class HealthRouter extends RouterBase {
  readonly path = '/health';
  routes: IRoute[] = [new HealthRoute(this.router)];
}
