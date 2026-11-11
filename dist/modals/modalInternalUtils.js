// src/modals/modalInternalUtils.ts
/**
* src/modals/modalInternalUtils.ts
*
* Internal browser-safe collection utilities shared across modal stack modules.
*/
function addToSetMap(map, key, value) {
	let bucket = map.get(key);
	if (!bucket) {
		bucket = /* @__PURE__ */ new Set();
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
function markModalNonReactive(instance) {
	Object.defineProperty(instance, "__v_skip", {
		value: true,
		enumerable: false,
		configurable: false,
		writable: false
	});
	return instance;
}
export { addToSetMap, markModalNonReactive };
