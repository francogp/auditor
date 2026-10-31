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
export declare class BaseEntityRegistry<TItem> implements IBaseEntityRegistry<TItem> {
  private static readonly allRegistries;
  private readonly items;
  private readonly getKey;
  private readonly onReset?;
  constructor(getKey: (item: TItem) => string, onReset?: (registry: BaseEntityRegistry<TItem>) => void);
  register(item: TItem): void;
  registerMany(items: readonly TItem[]): void;
  get(key: string): TItem | undefined;
  has(key: string): boolean;
  delete(key: string): boolean;
  get size(): number;
  getAll(): readonly TItem[];
  reset(): void;
  /**
   * Disposes of this registry instance, releasing all stored items and removing it
   * from the global registry coordinator to prevent memory leaks in ephemeral tests.
   */
  dispose(): void;
  static unregister(registry: BaseEntityRegistry<unknown>): void;
  static resetAll(): void;
}
/**
 * Universally resets all in-memory entity registries to their canonical baseline defaults.
 * Provides complete test isolation and deterministic cross-suite test execution.
 */
export declare function resetAllEntityRegistries(): void;