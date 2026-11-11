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
export { addToSetMap };
