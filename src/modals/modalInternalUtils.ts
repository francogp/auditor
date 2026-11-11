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
