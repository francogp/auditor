/**
 * src/core/baseRegistry.ts
 *
 * CANONICAL IN-MEMORY ENTITY REGISTRY (Node.js 26+ Native)
 * Provides a reusable, strongly-typed registry pattern to eliminate duplication
 * and coordinate in-memory requirements across all framework subsystems.
 */

export interface IBaseEntityRegistry<TItem> {
  register(item: TItem): void;
  registerMany(items: readonly TItem[]): void;
  get(key: string): TItem | undefined;
  has(key: string): boolean;
  delete(key: string): boolean;
  readonly size: number;
  getAll(): readonly TItem[];
  reset(): void;
  dispose(): void;
}

export class BaseEntityRegistry<TItem> implements IBaseEntityRegistry<TItem> {
  private static readonly allRegistries = new Set<BaseEntityRegistry<unknown>>();
  private readonly items = new Map<string, TItem>();
  private readonly getKey: (item: TItem) => string;
  private readonly onReset?: (registry: BaseEntityRegistry<TItem>) => void;

  public constructor(
    getKey: (item: TItem) => string,
    onReset?: (registry: BaseEntityRegistry<TItem>) => void
  ) {
    this.getKey = getKey;
    this.onReset = onReset;
    BaseEntityRegistry.allRegistries.add(this as BaseEntityRegistry<unknown>);
    if (this.onReset) {
      this.onReset(this);
    }
  }

  public register(item: TItem): void {
    if (!item) return;
    const key = this.getKey(item);
    if (!key) return;
    this.items.set(key, item);
  }

  public registerMany(items: readonly TItem[]): void {
    for (const item of items) {
      this.register(item);
    }
  }

  public get(key: string): TItem | undefined {
    return this.items.get(key);
  }

  public has(key: string): boolean {
    return this.items.has(key);
  }

  public delete(key: string): boolean {
    return this.items.delete(key);
  }

  public get size(): number {
    return this.items.size;
  }

  public getAll(): readonly TItem[] {
    return Array.from(this.items.values());
  }

  public reset(): void {
    this.items.clear();
    if (this.onReset) {
      this.onReset(this);
    }
  }

  /**
   * Disposes of this registry instance, releasing all stored items and removing it
   * from the global registry coordinator to prevent memory leaks in ephemeral tests.
   */
  public dispose(): void {
    this.items.clear();
    BaseEntityRegistry.unregister(this as BaseEntityRegistry<unknown>);
  }

  public static unregister(registry: BaseEntityRegistry<unknown>): void {
    this.allRegistries.delete(registry);
  }

  public static resetAll(): void {
    for (const reg of this.allRegistries) {
      reg.reset();
    }
  }
}

/**
 * Universally resets all in-memory entity registries to their canonical baseline defaults.
 * Provides complete test isolation and deterministic cross-suite test execution.
 */
export function resetAllEntityRegistries(): void {
  BaseEntityRegistry.resetAll();
}
