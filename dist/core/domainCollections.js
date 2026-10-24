// src/core/domainCollections.ts
var CanonicalDomainSet = class extends Set {
	has(value) {
		return super.has(value);
	}
};
/**
* Creates an immutable ReadonlySet from a const tuple or array of domain literals.
* Enforces compile-time type deduction of domain elements and provides a type-guard has() method.
*/
function createDomainSet(items) {
	return new CanonicalDomainSet(items);
}
/**
* Creates an immutable ReadonlyMap from an array of typed key-value pairs.
*/
function createDomainMap(entries) {
	return new Map(entries);
}
export { createDomainMap, createDomainSet };
