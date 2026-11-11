/**
 * src/modals/modalInternalUtils.ts
 *
 * Internal browser-safe collection utilities shared across modal stack modules.
 */
export declare function addToSetMap<TKey, TValue>(map: Map<TKey, Set<TValue>>, key: TKey, value: TValue): Set<TValue>;