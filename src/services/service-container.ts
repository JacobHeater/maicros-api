import { OnServiceInit } from './service-base';

type Constructor<T> = new (...args: any[]) => T;
type ServiceFactory = (
  resolved: Map<Constructor<any>, unknown>,
  container: ServiceContainer
) => any;

interface ServiceDescriptor {
  ctor: Constructor<any>;
  deps: Constructor<any>[];
  factory: ServiceFactory;
}

export class ServiceContainer {
  private readonly instances = new Map<Constructor<any>, unknown>();
  private readonly descriptors = new Map<Constructor<any>, ServiceDescriptor>();

  // Register an already-constructed singleton keyed by its constructor
  registerInstance<T>(ctor: Constructor<T>, instance: T) {
    this.instances.set(ctor, instance);
  }

  // Register a factory with explicit dependency constructors.
  registerFactory(ctor: Constructor<any>, deps: Constructor<any>[], factory: ServiceFactory) {
    if (this.descriptors.has(ctor) || this.instances.has(ctor)) {
      throw new Error(`Service already registered: ${ctor.name}`);
    }
    this.descriptors.set(ctor, { ctor, deps, factory });
  }

  /**
   * Automatically resolve dependencies from @Injectable metadata
   * and instantiate the class with its dependencies in the constructor.
   */
  registerClass<T>(ctor: Constructor<T>, manualDeps?: Constructor<any>[]) {
    const reflectedDeps = Reflect.getMetadata('design:paramtypes', ctor);
    if (manualDeps === undefined && reflectedDeps === undefined && ctor.length > 0) {
      throw new Error(
        `Could not resolve dependencies for '${ctor.name}'. This is often caused by a circular dependency. Try breaking the cycle or providing dependencies manually.`
      );
    }

    const deps = manualDeps ?? reflectedDeps ?? [];
    this.registerFactory(ctor, deps, resolvedMap => {
      // Create args array in the same order as deps
      const args = deps.map(d => {
        const inst = resolvedMap.get(d);
        if (inst === undefined) {
          throw new Error(`Failed to resolve dependency ${d.name} for ${ctor.name}`);
        }
        return inst;
      });
      return new ctor(...args);
    });
  }

  // Auto-register every class in an injectable registry using reflected metadata.
  autoRegisterAll(registry: Iterable<Constructor<any>>) {
    for (const ctor of registry) {
      if (!this.descriptors.has(ctor) && !this.instances.has(ctor)) {
        this.registerClass(ctor);
      }
    }
  }

  get<T>(ctor: Constructor<T>): T | undefined {
    return this.instances.get(ctor) as T | undefined;
  }

  // Return all resolved instances that are instances of the given base class/abstract class.
  getAll<T>(base: abstract new (...args: any[]) => T): T[] {
    const results: T[] = [];
    for (const inst of this.instances.values()) {
      if (inst instanceof (base as unknown as new (...args: any[]) => T)) {
        results.push(inst as T);
      }
    }
    return results;
  }

  // Resolve descriptor graph, instantiate in dependency order, and call
  // onServiceInit() hooks where present.
  async initAll(): Promise<void> {
    const visiting = new Set<Constructor<any>>();
    const resolved = new Set<Constructor<any>>();

    const resolveCtor = async (ctor: Constructor<any>) => {
      if (this.instances.has(ctor)) return; // already instantiated
      if (resolved.has(ctor)) return;
      if (visiting.has(ctor)) throw new Error(`Circular dependency detected: ${ctor.name}`);

      const desc = this.descriptors.get(ctor);
      if (!desc) throw new Error(`No service descriptor or instance registered for: ${ctor.name}`);

      visiting.add(ctor);
      const depsResolved = new Map<Constructor<any>, unknown>();
      for (const d of desc.deps) {
        await resolveCtor(d);
        depsResolved.set(d, this.instances.get(d));
      }

      const inst = desc.factory(depsResolved, this);
      this.instances.set(ctor, inst);
      visiting.delete(ctor);
      resolved.add(ctor);

      // call onServiceInit if implemented
      const maybeInit = inst as unknown as OnServiceInit;
      if (maybeInit && typeof maybeInit.onServiceInit === 'function') {
        // eslint-disable-next-line no-console
        console.log(`Initializing service: ${ctor.name}`);
        // await in case it's async
        // @ts-ignore
        await maybeInit.onServiceInit();
      }
    };

    for (const ctor of this.descriptors.keys()) {
      await resolveCtor(ctor);
    }
  }
}

export type ServiceKey = Constructor<any>;
