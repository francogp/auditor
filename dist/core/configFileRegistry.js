//#region src/core/configFileRegistry.ts
var ConfigFileRegistry = class {
	static requirements = /* @__PURE__ */ new Map();
	/**
	* Registers a single configuration file requirement.
	*/
	static register(requirement) {
		if (!requirement || !requirement.id || !requirement.file) return;
		this.requirements.set(requirement.id, requirement);
	}
	/**
	* Registers multiple configuration file requirements.
	*/
	static registerMany(requirements) {
		for (const req of requirements) this.register(req);
	}
	/**
	* Retrieves a registered configuration file requirement by its ID.
	*/
	static get(id) {
		return this.requirements.get(id);
	}
	/**
	* Returns all currently registered configuration file requirements.
	*/
	static getAll() {
		return Array.from(this.requirements.values());
	}
	/**
	* Clears all registered configuration requirements (used in test isolation).
	*/
	static reset() {
		this.requirements.clear();
	}
};
//#endregion
export { ConfigFileRegistry };
