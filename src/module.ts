export interface IModule {
  initialize(): Promise<void> | void;
}
