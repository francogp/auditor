import { BaseEntityRegistry } from "./baseRegistry.js";
// src/core/gitIgnoreRegistry.ts
const CORE_GITIGNORE_REQUIREMENTS = [
	{
		id: "node_modules",
		pattern: "node_modules/",
		samplePath: "node_modules/package/index.js",
		reason: "Installed npm dependencies directory",
		isApplicable: () => true
	},
	{
		id: "scratch",
		pattern: "scratch/",
		samplePath: "scratch/latest_audit.json",
		reason: "Universal directory for auditor scratch reports, caches, and ephemeral artifacts",
		isApplicable: () => true
	},
	{
		id: "*.log",
		pattern: "*.log",
		samplePath: "npm-debug.log",
		reason: "Execution logs and debug dump files from CLI and Node.js",
		isApplicable: () => true
	}
];
var GitIgnoreRegistryImpl = class extends BaseEntityRegistry {
	constructor() {
		super((req) => req?.id, (reg) => {
			for (const req of CORE_GITIGNORE_REQUIREMENTS) reg.register(req);
		});
	}
	/**
	* Registers a single gitignore requirement with validation.
	*/
	register(requirement) {
		if (!requirement || !requirement.id || !requirement.pattern) return;
		super.register(requirement);
	}
};
/**
* Universal singleton instance for GitIgnoreRegistry.
* Inherits directly from BaseEntityRegistry to eliminate Middle Man delegation.
*/
const GitIgnoreRegistry = new GitIgnoreRegistryImpl();
export { CORE_GITIGNORE_REQUIREMENTS, GitIgnoreRegistry, GitIgnoreRegistryImpl };
