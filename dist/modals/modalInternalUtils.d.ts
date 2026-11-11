/**
 * src/modals/modalInternalUtils.ts
 *
 * Internal browser-safe collection utilities shared across modal stack modules.
 */
export declare function addToSetMap<TKey, TValue>(map: Map<TKey, Set<TValue>>, key: TKey, value: TValue): Set<TValue>;
/**
 * Defines a non-enumerable `__v_skip: true` flag so Vue 3 / Pinia `reactive()`
 * never wraps internal `Map`/`Set` fields in proxies, while staying invisible
 * to `Object.keys()` and requiring zero runtime framework dependencies.
 */
export declare function markModalNonReactive<T extends object>(instance: T): T;