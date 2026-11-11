/**
 * src/modals/modalInternalUtils.ts
 *
 * Internal browser-safe collection utilities shared across modal stack modules.
 */

export function addToSetMap<TKey, TValue>(
  map: Map<TKey, Set<TValue>>,
  key: TKey,
  value: TValue
): Set<TValue> {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = new Set<TValue>();
    map.set(key, bucket);
  }
  bucket.add(value);
  return bucket;
}

/**
 * Defines a non-enumerable `__v_skip: true` flag so Vue 3 / Pinia `reactive()`
 * never wraps internal `Map`/`Set` fields in proxies, while staying invisible
 * to `Object.keys()` and requiring zero runtime framework dependencies.
 */
export function markModalNonReactive<T extends object>(instance: T): T {
  Object.defineProperty(instance, '__v_skip', {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  });
  return instance;
}
