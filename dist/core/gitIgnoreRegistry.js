import { BaseEntityRegistry } from "./baseRegistry.js";
// src/core/gitIgnoreRegistry.ts
function normalizeSupabaseDir(config) {
	return (config.supabaseDocker?.supabaseDir ?? "").trim().replaceAll("\\", "/").replace(/\/+$/u, "");
}
/**
* Resolves dynamic `resolvePattern` / `resolveSamplePath` hooks on a `GitIgnoreRequirement`.
*/
function resolveGitIgnoreRequirement(requirement, config) {
	const pattern = requirement.resolvePattern ? requirement.resolvePattern(config) : requirement.pattern;
	const samplePath = requirement.resolveSamplePath ? requirement.resolveSamplePath(config) : requirement.samplePath;
	return {
		...requirement,
		pattern,
		samplePath
	};
}
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
	},
	{
		id: "supabase-docker-clone",
		pattern: "",
		reason: "Cloned official Supabase docker template managed by auditor-supabase",
		isApplicable: (config) => Boolean(config.supabaseDocker?.enabled && normalizeSupabaseDir(config).length > 0),
		resolvePattern: (config) => `${normalizeSupabaseDir(config)}/docker/`,
		resolveSamplePath: (config) => `${normalizeSupabaseDir(config)}/docker/docker-compose.yml`
	},
	{
		id: "supabase-docker-generated",
		pattern: "",
		reason: "Generated Supabase compose and per-server .env files managed by auditor-supabase",
		isApplicable: (config) => Boolean(config.supabaseDocker?.enabled && normalizeSupabaseDir(config).length > 0),
		resolvePattern: (config) => `${normalizeSupabaseDir(config)}/generated/`,
		resolveSamplePath: (config) => `${normalizeSupabaseDir(config)}/generated/docker-compose.yml`
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
		if (!requirement || !requirement.id || !requirement.pattern && !requirement.resolvePattern) return;
		super.register(requirement);
	}
};
/**
* Universal singleton instance for GitIgnoreRegistry.
* Inherits directly from BaseEntityRegistry to eliminate Middle Man delegation.
*/
const GitIgnoreRegistry = new GitIgnoreRegistryImpl();
export { CORE_GITIGNORE_REQUIREMENTS, GitIgnoreRegistry, GitIgnoreRegistryImpl, resolveGitIgnoreRequirement };
