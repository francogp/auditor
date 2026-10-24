/**
 * packages/auditor/src/core/domainCollections.ts
 *
 * CANONICAL DOMAIN COLLECTION CONSTRUCTORS
 * Enforces strictly typed, immutable ReadonlySet and ReadonlyMap instances
 * derived from const tuples without naked string primitives or runtime bypasses.
 */
export interface DomainSet<T extends string> extends ReadonlySet<T> {
  has(value: unknown): value is T;
}
/**
 * Creates an immutable ReadonlySet from a const tuple or array of domain literals.
 * Enforces compile-time type deduction of domain elements and provides a type-guard has() method.
 */
export declare function createDomainSet<const T extends readonly string[]>(items: T): DomainSet<T[number]>;
/**
 * Creates an immutable ReadonlyMap from an array of typed key-value pairs.
 */
export declare function createDomainMap<const T extends readonly (readonly [string, unknown])[]>(entries: T): ReadonlyMap<T[number][0], T[number][1]>;