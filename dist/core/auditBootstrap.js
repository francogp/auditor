import { AUDIT_CONFIG_FILE, AUDIT_CONFIG_JSON_FILE, LEGACY_ROOT_CONFIG_FILES } from "./auditConfigTypes.js";
import { AUDITOR_VERSION } from "./version.js";
import { tryCatchSync, tryOrNull, tryOrNullAsync, tryOrUndefinedAsync } from "./safeUtils.js";
import { loadAuditConfig, resetAuditConfig } from "./auditConfigLoader.js";
import { isSelfProviderProject } from "./auditProjectIdentity.js";
import "./auditConfig.js";
import { appendGitIgnoreEntries, findMissingGitIgnoreRequirements } from "./gitignoreMatcher.js";
import { collectAllGitIgnoreRequirements, discoverAuditors } from "../cli/auditScanner.js";
import { initAgentSkill } from "../cli/init_agent.js";
import { migrateLegacyAuditConfig } from "../cli/migrateAuditConfig.js";
import { getPackageJson } from "./packageJson.js";
import { appendMissingSectionsToConfigFile } from "./auditConfigAst.js";
import { collectMissingSections, createDefaultAuditConfigContent, enforceCriticalConfigurations, syncAuditorVersionInConfigFile } from "../suites/architecture/validate_audit_config.js";
import { ensureNpmrcAllowGit } from "./npmrcAllowGit.js";
import { repairVitePlusProject } from "./vitePlusConfigSync.js";
import path from "node:path";
import fs from "node:fs";
//#region src/core/auditBootstrap.ts
/**
* src/core/auditBootstrap.ts
*
* ZERO-SETUP PRE-FLIGHT AUTO-BOOTSTRAP ENGINE (Node.js 26+ Native)
*
* Ensures that any host repository executing @francogp/auditor:
*   1. Has a valid .auditor/audit.config.ts initialized with 100% of discovered
*      sub-auditors and extension sections populated with their canonical defaults.
*   2. Automatically detects missing configuration sections when @francogp/auditor
*      is updated or new suites/extensions are added, injecting them via TypeScript AST.
*   3. Automatically registers the auditor plugin and skills in .agents/plugins.json
*      and .agents/skills.json so Antigravity AI agents immediately discover capabilities.
*   4. Ensures required .gitignore entries exist (scratch/, .auditor/audit-baseline.json).
*   5. Ensures .npmrc contains allow-git=all so plain `npm install` and `npm update` resolve Git-hosted dependencies on npm 12+.
*
* Runs transparently during pre-flight in local environments while strictly
* respecting CI environments (never mutating files unexpectedly during CI runs).
*/
const EMPTY_BOOTSTRAP_RESULT = {
	configCreated: false,
	configUpdated: false,
	versionUpdated: false,
	currentVersion: AUDITOR_VERSION,
	agentsRegistered: false,
	gitIgnoreUpdated: false,
	sectionsInjected: []
};
function handleLegacyConfigMigration(projectRoot) {
	if (!LEGACY_ROOT_CONFIG_FILES.find((f) => fs.existsSync(path.resolve(projectRoot, f)))) return;
	tryCatchSync(() => {
		migrateLegacyAuditConfig(projectRoot);
	});
}
async function safeDiscoverAuditors(projectRoot) {
	return discoverAuditors({ projectRoot }).catch(() => []);
}
function resolvePackageName(projectRoot) {
	return tryOrNull(() => getPackageJson(projectRoot))?.name ?? "Project";
}
function ensureVirginConfigScaffolded(projectRoot, tasks) {
	const pkgName = resolvePackageName(projectRoot);
	const content = createDefaultAuditConfigContent(pkgName, tasks);
	const targetConfigPath = path.resolve(projectRoot, AUDIT_CONFIG_FILE);
	fs.mkdirSync(path.dirname(targetConfigPath), { recursive: true });
	fs.writeFileSync(targetConfigPath, content, "utf-8");
	resetAuditConfig();
	return true;
}
async function ensureMissingSectionsInjected(projectRoot, configPath, jsonConfigPath, tasks) {
	const injectedKeys = [];
	const activeConfig = await tryOrNullAsync(() => loadAuditConfig(projectRoot));
	if (!activeConfig) return injectedKeys;
	const rawConfig = activeConfig._rawConfig ?? {};
	const missing = collectMissingSections(tasks, rawConfig);
	if (missing.size === 0) return injectedKeys;
	const targetPath = fs.existsSync(configPath) ? configPath : jsonConfigPath;
	const sectionsToInsert = {};
	for (const [rootKey, entry] of missing.entries()) {
		sectionsToInsert[rootKey] = Object.keys(entry.defaultConfig).length > 0 ? entry.defaultConfig : { enabled: true };
		injectedKeys.push(rootKey);
	}
	appendMissingSectionsToConfigFile(targetPath, sectionsToInsert);
	resetAuditConfig();
	return injectedKeys;
}
function ensureAgentSkillRegistered(projectRoot) {
	return tryOrNull(() => initAgentSkill({ targetDir: projectRoot }))?.created ?? false;
}
async function ensureGitIgnoreSynchronized(projectRoot) {
	return await tryOrNull(async () => {
		const gitignorePath = path.resolve(projectRoot, ".gitignore");
		const requirements = await collectAllGitIgnoreRequirements(projectRoot);
		const activeConfig = await tryOrUndefinedAsync(() => loadAuditConfig(projectRoot));
		const applicable = requirements.filter((req) => {
			if (!req.isApplicable) return true;
			return activeConfig ? req.isApplicable(activeConfig) : true;
		});
		if (applicable.length === 0) return false;
		const missing = findMissingGitIgnoreRequirements(projectRoot, gitignorePath, applicable);
		if (missing.length === 0) return false;
		appendGitIgnoreEntries(gitignorePath, missing.map((e) => e.pattern));
		return true;
	}) ?? false;
}
async function ensureProjectBootstrapped(options = {}) {
	const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
	if (process.env.CI === "true" || isSelfProviderProject(projectRoot) && !options.force) return EMPTY_BOOTSTRAP_RESULT;
	handleLegacyConfigMigration(projectRoot);
	const configPath = path.resolve(projectRoot, AUDIT_CONFIG_FILE);
	const jsonConfigPath = path.resolve(projectRoot, AUDIT_CONFIG_JSON_FILE);
	const targetConfigPath = fs.existsSync(configPath) ? configPath : jsonConfigPath;
	const hasExistingConfig = fs.existsSync(configPath) || fs.existsSync(jsonConfigPath);
	const tasks = await safeDiscoverAuditors(projectRoot);
	let configCreated = false;
	let versionUpdated = false;
	let previousVersion;
	let sectionsInjected = [];
	if (!hasExistingConfig) {
		configCreated = ensureVirginConfigScaffolded(projectRoot, tasks);
		versionUpdated = true;
	} else {
		const rawConfig = (await tryOrUndefinedAsync(() => loadAuditConfig(projectRoot)))?._rawConfig ?? {};
		previousVersion = typeof rawConfig.auditorVersion === "string" ? rawConfig.auditorVersion : void 0;
		const versionDiverged = previousVersion !== AUDITOR_VERSION;
		sectionsInjected = await ensureMissingSectionsInjected(projectRoot, configPath, jsonConfigPath, tasks);
		await enforceCriticalConfigurations(projectRoot, tasks);
		if (versionDiverged) {
			if (syncAuditorVersionInConfigFile(targetConfigPath, "10.0.0-build.20261022-194620")) {
				versionUpdated = true;
				resetAuditConfig();
			}
		}
	}
	ensureNpmrcAllowGit(projectRoot);
	repairVitePlusProject(projectRoot);
	const agentsRegistered = ensureAgentSkillRegistered(projectRoot);
	const gitIgnoreUpdated = await ensureGitIgnoreSynchronized(projectRoot);
	return {
		configCreated,
		configUpdated: sectionsInjected.length > 0 || versionUpdated,
		versionUpdated,
		previousVersion,
		currentVersion: AUDITOR_VERSION,
		agentsRegistered,
		gitIgnoreUpdated,
		sectionsInjected
	};
}
//#endregion
export { ensureProjectBootstrapped };
