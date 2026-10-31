import { BaseEntityRegistry } from "./baseRegistry.js";
// src/core/configFileRegistry.ts
var ConfigFileRegistryImpl = class extends BaseEntityRegistry {
	constructor() {
		super((req) => req?.id);
	}
	/**
	* Registers a single configuration file requirement with validation.
	*/
	register(requirement) {
		if (!requirement?.file) return;
		super.register(requirement);
	}
};
/**
* Universal singleton instance for ConfigFileRegistry.
* Inherits directly from BaseEntityRegistry to eliminate Middle Man delegation.
*/
const ConfigFileRegistry = new ConfigFileRegistryImpl();
export { ConfigFileRegistry, ConfigFileRegistryImpl };
