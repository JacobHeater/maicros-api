import { Application, Router } from 'express';

export interface IRouter {
  path: string;
  register(): void;
}

export interface IRoute {
  define(app: Router): void;
}

export abstract class RouterBase implements IRouter {
  constructor(protected app: Application) {}

  routes: IRoute[] = [];
  abstract readonly path: string;

  register(): void {
    const router = Router();
    this.routes.forEach(route => route.define(router));
    this.app.use(this.path, router);
  }
}

export abstract class RouteBase implements IRoute {
  constructor(protected router: Router) {}
  abstract define(): void;
}
