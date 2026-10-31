// src/core/baseRegistry.ts
var BaseEntityRegistry = class BaseEntityRegistry {
	static allRegistries = /* @__PURE__ */ new Set();
	items = /* @__PURE__ */ new Map();
	getKey;
	onReset;
	constructor(getKey, onReset) {
		this.getKey = getKey;
		this.onReset = onReset;
		BaseEntityRegistry.allRegistries.add(this);
		if (this.onReset) this.onReset(this);
	}
	register(item) {
		if (!item) return;
		const key = this.getKey(item);
		if (!key) return;
		this.items.set(key, item);
	}
	registerMany(items) {
		for (const item of items) this.register(item);
	}
	get(key) {
		return this.items.get(key);
	}
	has(key) {
		return this.items.has(key);
	}
	delete(key) {
		return this.items.delete(key);
	}
	get size() {
		return this.items.size;
	}
	getAll() {
		return Array.from(this.items.values());
	}
	reset() {
		this.items.clear();
		if (this.onReset) this.onReset(this);
	}
	/**
	* Disposes of this registry instance, releasing all stored items and removing it
	* from the global registry coordinator to prevent memory leaks in ephemeral tests.
	*/
	dispose() {
		this.items.clear();
		BaseEntityRegistry.unregister(this);
	}
	static unregister(registry) {
		this.allRegistries.delete(registry);
	}
	static resetAll() {
		for (const reg of this.allRegistries) reg.reset();
	}
};
/**
* Universally resets all in-memory entity registries to their canonical baseline defaults.
* Provides complete test isolation and deterministic cross-suite test execution.
*/
function resetAllEntityRegistries() {
	BaseEntityRegistry.resetAll();
}
export { BaseEntityRegistry, resetAllEntityRegistries };
