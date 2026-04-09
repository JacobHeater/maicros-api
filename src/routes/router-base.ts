import { Application, Router } from 'express';

export interface IRouter {
  path: string;
  register(): void;
}

export interface IRoute {
  define(): void;
}

export abstract class RouterBase implements IRouter {
  constructor(protected app: Application) {}

  routes: IRoute[] = [];
  abstract readonly path: string;

  protected readonly router: Router = Router();

  register(): void {
    this.routes.forEach(route => route.define());
    this.app.use(this.path, this.router);
  }
}

export abstract class RouteBase implements IRoute {
  constructor(protected router: Router) {}
  abstract define(): void;
}
