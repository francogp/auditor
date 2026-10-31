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

class CanonicalDomainSet<T extends string> extends Set<T> implements DomainSet<T> {
  public override has(value: unknown): value is T {
    return super.has(value as T);
  }
}

/**
 * Creates an immutable ReadonlySet from a const tuple or array of domain literals.
 * Enforces compile-time type deduction of domain elements and provides a type-guard has() method.
 */
export function createDomainSet<const T extends readonly string[]>(items: T): DomainSet<T[number]> {
  return new CanonicalDomainSet<T[number]>(items);
}

/**
 * Creates an immutable ReadonlyMap from an array of typed key-value pairs.
 */
export function createDomainMap<const T extends readonly (readonly [string, unknown])[]>(
  entries: T
): ReadonlyMap<T[number][0], T[number][1]> {
  return new Map(entries as readonly (readonly [T[number][0], T[number][1]])[]);
}
