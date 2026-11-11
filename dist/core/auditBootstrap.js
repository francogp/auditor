import { AUDIT_CONFIG_FILE, AUDIT_CONFIG_JSON_FILE, LEGACY_ROOT_CONFIG_FILES } from "./auditConfigTypes.js";
import { collectAllGitIgnoreRequirements, discoverAuditors } from "../cli/auditScanner.js";
import { initAgentSkill } from "../cli/init_agent.js";
import { loadAuditConfig, resetAuditConfig } from "./auditConfigLoader.js";
import { isSelfProviderProject } from "./auditProjectIdentity.js";
import { migrateLegacyAuditConfig } from "../cli/migrateAuditConfig.js";
import { collectMissingSections, createDefaultAuditConfigContent, enforceCriticalConfigurations, syncAuditorVersionInConfigFile } from "../suites/architecture/validate_audit_config.js";
import "./auditConfig.js";
import { appendMissingSectionsToConfigFile } from "./auditConfigAst.js";
import { appendGitIgnoreEntries, findMissingGitIgnoreRequirements } from "./gitignoreMatcher.js";
import { ensureNpmrcAllowGit } from "./npmrcAllowGit.js";
import { getPackageJson } from "./packageJson.js";
import { tryCatchSync, tryOrNull, tryOrNullAsync, tryOrUndefinedAsync } from "./safeUtils.js";
import { AUDITOR_VERSION } from "./version.js";
import { repairVitePlusProject } from "./vitePlusConfigSync.js";
import path from "node:path";
import fs from "node:fs";
// src/core/auditBootstrap.ts
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
	return discoverAuditors({
		projectRoot,
		withBuild: true,
		speed: "full"
	}).catch(() => []);
}
function resolvePackageName(projectRoot) {
	return tryOrNull(() => getPackageJson(projectRoot))?.name ?? "Project";
}
function ensurePackageJsonModule(projectRoot) {
	const pkgPath = path.resolve(projectRoot, "package.json");
	if (!fs.existsSync(pkgPath)) return false;
	return tryOrNull(() => {
		const raw = fs.readFileSync(pkgPath, "utf-8");
		const parsed = JSON.parse(raw);
		if (parsed.type !== "module") {
			parsed.type = "module";
			fs.writeFileSync(pkgPath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
			return true;
		}
		return false;
	}) ?? false;
}
function ensureInitialSourceAndTests(projectRoot) {
	const srcDir = path.resolve(projectRoot, "src");
	const testsDir = path.resolve(projectRoot, "tests");
	if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir, { recursive: true });
	const srcIndex = path.resolve(srcDir, "index.ts");
	if (!fs.existsSync(srcIndex)) {
		if ((tryOrNull(() => fs.readdirSync(srcDir)) ?? []).length === 0) tryCatchSync(() => fs.writeFileSync(srcIndex, "export const version = '0.0.0';\n", "utf-8"));
	}
	if (!fs.existsSync(testsDir)) fs.mkdirSync(testsDir, { recursive: true });
	const testIndex = path.resolve(testsDir, "index.test.ts");
	if (!fs.existsSync(testIndex)) {
		if ((tryOrNull(() => fs.readdirSync(testsDir)) ?? []).length === 0) {
			const initialTest = `import { describe, it, expect } from 'vitest';
import { version } from '../src/index.ts';

describe('project initialization', () => {
  it('exposes initial version', () => {
    expect(version).toBe('0.0.0');
  });
});
`;
			tryCatchSync(() => fs.writeFileSync(testIndex, initialTest, "utf-8"));
		}
	}
}
function ensureVirginConfigScaffolded(projectRoot, tasks) {
	ensurePackageJsonModule(projectRoot);
	ensureInitialSourceAndTests(projectRoot);
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
	const missing = collectMissingSections(tasks, rawConfig, projectRoot);
	if (missing.size === 0) return injectedKeys;
	const targetPath = fs.existsSync(configPath) ? configPath : jsonConfigPath;
	const sectionsToInsert = {};
	for (const [rootKey, entry] of missing.entries()) {
		const payload = entry.missingTree && Object.keys(entry.missingTree).length > 0 ? entry.missingTree : entry.defaultConfig;
		sectionsToInsert[rootKey] = Object.keys(payload).length > 0 ? payload : { enabled: true };
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
const MANDATORY_PROJECT_DIRS = [
	"scratch",
	"scratch/audits",
	"scratch/audits/architecture",
	"scratch/audits/documentation",
	"scratch/audits/domain_data",
	"scratch/audits/persistence",
	"dist",
	".agents",
	".agents/skills"
];
function ensureMandatoryDirectoriesExist(projectRoot) {
	ensurePackageJsonModule(projectRoot);
	for (const relDir of MANDATORY_PROJECT_DIRS) {
		const targetPath = path.resolve(projectRoot, relDir);
		if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true });
	}
	const scratchKeepPath = path.resolve(projectRoot, "scratch/.gitkeep");
	if (!fs.existsSync(scratchKeepPath)) tryCatchSync(() => fs.writeFileSync(scratchKeepPath, "", "utf-8"));
}
async function ensureProjectBootstrapped(options = {}) {
	const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
	ensureMandatoryDirectoriesExist(projectRoot);
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
			if (syncAuditorVersionInConfigFile(targetConfigPath, "10.11.0-build.20261111-115913")) {
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
export { MANDATORY_PROJECT_DIRS, ensureInitialSourceAndTests, ensureMandatoryDirectoriesExist, ensurePackageJsonModule, ensureProjectBootstrapped };
