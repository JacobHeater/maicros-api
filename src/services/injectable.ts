/* eslint-disable @typescript-eslint/no-explicit-any */
type Constructor<T = any> = new (...args: any[]) => T;

const _registry = new Set<Constructor>();

export function getInjectableRegistry(): ReadonlySet<Constructor> {
  return _registry;
}

export function Injectable(): (target: Constructor) => void {
  return (target: Constructor): void => {
    _registry.add(target);
  };
}
