import { loadAuditConfig } from "../core/auditConfigLoader.js";
import "../core/auditConfig.js";
import { getActiveFamilies } from "../core/auditContract.js";
import { DEFAULT_PERMISSIONS } from "../core/permissionGuard.js";
import { GitIgnoreRegistry } from "../core/gitIgnoreRegistry.js";
import { CORE_PACKAGE_SCRIPT_REQUIREMENTS, PackageScriptRegistry } from "../core/packageScriptRegistry.js";
import { toPosixRelative } from "../core/auditCoverage.js";
import "../core/safePath.js";
import { isSimilarCodeSkipped } from "../suites/architecture/validate_similar_code.js";
import { extractAuditorMetadataFromFile, extractStaticMetadataFromFile } from "./auditorMetadata.js";
import { buildTaskCliArguments, createAuditTaskDefinition, formatTaskTitle, getPermissionsForTask, getTimeoutForTask, shouldSkipTaskByCapabilities, shouldSkipTaskByFilters } from "./auditTaskFactory.js";
import path from "node:path";
import fs from "node:fs";
import fs$1 from "node:fs/promises";
//#region src/cli/auditScanner.ts
/**
* packages/auditor/src/cli/auditScanner.ts
*
* AUDITOR SCANNER & AUTO-DISCOVERY ENGINE (Node.js 26+)
* Scans packages/auditor/src/suites/ recursively and loads host extensions from audit.config.ts,
* infers families, generates canonical task definitions, and guarantees that ZERO auditors
* are ever left behind from the orchestrator.
*/
const BUILTIN_SUITES_DIR = path.resolve(import.meta.dirname, "../suites");
const AUDIT_PRESETS = {
	performance: ["validate_web_performance", "validate_query_performance"],
	security: ["validate_security_hardening"]
};
async function extractCapabilitiesFromFile(fullPath) {
	return (await extractAuditorMetadataFromFile(fullPath)).capabilities;
}
async function extractGitIgnoreRequirementsFromFile(fullPath) {
	return (await extractAuditorMetadataFromFile(fullPath)).gitIgnoreEntries;
}
function resolveTargetSuiteIds(options, combinedPresets) {
	let targetSuiteIds = null;
	if (options.preset && options.preset !== "lint" && options.preset !== "full" && options.preset !== "precommit" && options.preset !== "md" && options.preset !== "post-build" && options.preset !== "build" && options.preset !== "critical" && options.preset in combinedPresets) targetSuiteIds = new Set(combinedPresets[options.preset]);
	if (options.suites && options.suites.length > 0) targetSuiteIds = /* @__PURE__ */ new Set([...targetSuiteIds ?? [], ...options.suites]);
	else if (options.task && options.task.includes(",")) {
		const list = options.task.split(",").map((s) => s.trim()).filter(Boolean);
		targetSuiteIds = /* @__PURE__ */ new Set([...targetSuiteIds ?? [], ...list]);
	}
	return targetSuiteIds;
}
function inferFamilyFromRelPath(relPath, activeFamilies) {
	const segments = relPath.split("/");
	const firstSegment = segments[0];
	if (segments.length > 1 && firstSegment && activeFamilies.some((f) => f === firstSegment)) return firstSegment;
	return "architecture";
}
function isIgnoredFileEntry(entry) {
	if (entry.startsWith("_")) return true;
	if (!entry.endsWith(".ts") && !entry.endsWith(".js")) return true;
	if (entry.endsWith(".d.ts") || entry.endsWith(".d.ts.map") || entry.endsWith(".js.map")) return true;
	return entry.includes(".spec.") || entry.includes(".test.") || entry.startsWith("report_") || entry === "audit_rules.ts" || entry === "audit_rules.js" || entry.endsWith("Plugin.ts") || entry.endsWith("Plugin.js");
}
async function scanSuiteDirectory(params) {
	let entries;
	try {
		entries = await fs$1.readdir(params.currentDir);
	} catch {
		return;
	}
	const isBuiltin = params.isBuiltin ?? true;
	for (const entry of entries) {
		const fullPath = path.join(params.currentDir, entry);
		const stat = await fs$1.stat(fullPath);
		if (stat.isDirectory()) {
			if (!entry.startsWith("_") && entry !== "node_modules" && entry !== "lib") await scanSuiteDirectory({
				...params,
				currentDir: fullPath,
				isBuiltin
			});
		} else if (stat.isFile() && !isIgnoredFileEntry(entry)) {
			const family = inferFamilyFromRelPath(toPosixRelative(params.rootDir, fullPath), params.activeFamilies);
			const filename = path.basename(entry, path.extname(entry));
			const task = await createAuditTaskDefinition(fullPath, filename, family, params.config, params.options, isBuiltin, params.targetSuiteIds);
			if (task) params.discovered.push(task);
		}
	}
}
function detectExtensionFamily(extPath, activeFamilies) {
	const normalized = toPosixRelative(process.cwd(), extPath);
	for (const fam of activeFamilies) if (normalized.includes(`/${fam}/`)) return fam;
	return "domain_data";
}
async function scanSingleExtensionFile(fullPath, extPath, params) {
	const filename = path.basename(extPath, path.extname(extPath));
	const family = detectExtensionFamily(extPath, params.activeFamilies);
	const task = await createAuditTaskDefinition(fullPath, filename, family, params.config, params.options, false, params.targetSuiteIds);
	if (task) params.discovered.push(task);
}
async function scanConfigExtensionEntry(extPath, params) {
	const rootDir = params.options.projectRoot || process.cwd();
	const fullPath = path.resolve(rootDir, extPath);
	if (!fs.existsSync(fullPath)) return;
	const stat = await fs$1.stat(fullPath);
	if (stat.isDirectory()) await scanSuiteDirectory({
		currentDir: fullPath,
		rootDir: fullPath,
		config: params.config,
		options: params.options,
		activeFamilies: params.activeFamilies,
		targetSuiteIds: params.targetSuiteIds,
		discovered: params.discovered,
		isBuiltin: false
	});
	else if (stat.isFile() && (extPath.endsWith(".ts") || extPath.endsWith(".js"))) await scanSingleExtensionFile(fullPath, extPath, params);
}
async function scanConfigExtensions(params) {
	for (const extPath of params.extensions) await scanConfigExtensionEntry(extPath, params);
}
async function discoverAuditors(options = {}) {
	const config = await loadAuditConfig(options.projectRoot);
	const activeFamilies = getActiveFamilies(config.customFamilies);
	const discovered = [];
	const targetSuiteIds = resolveTargetSuiteIds(options, {
		...AUDIT_PRESETS,
		...config.presets
	});
	const scanDir = options.baseDir ?? BUILTIN_SUITES_DIR;
	await scanSuiteDirectory({
		currentDir: scanDir,
		rootDir: scanDir,
		config,
		options,
		activeFamilies,
		targetSuiteIds,
		discovered
	});
	if ((!options.baseDir || options.baseDir === BUILTIN_SUITES_DIR) && config.extensions && config.extensions.length > 0) await scanConfigExtensions({
		extensions: config.extensions,
		config,
		options,
		activeFamilies,
		targetSuiteIds,
		discovered
	});
	discovered.sort((a, b) => {
		const familyDiff = (a.order ?? 99) - (b.order ?? 99);
		if (familyDiff !== 0) return familyDiff;
		return a.id.localeCompare(b.id);
	});
	return discovered;
}
/**
* Dynamically collects gitignore requirements from all discovered subauditors,
* registered extensions, and audit.config.ts, guaranteeing that zero rules are hardcoded.
*/
async function collectAllGitIgnoreRequirements(projectRoot = process.cwd(), config) {
	const effectiveConfig = config ?? await loadAuditConfig(projectRoot);
	await discoverAuditors({ projectRoot });
	const customEntries = effectiveConfig.gitIgnore?.extraRequiredEntries ?? [];
	for (const entry of customEntries) if (typeof entry === "string") GitIgnoreRegistry.register({
		id: entry,
		pattern: entry,
		reason: `Entrada requerida configurada en audit.config.ts (${entry})`
	});
	else if (entry && typeof entry === "object" && entry.id && entry.pattern) GitIgnoreRegistry.register(entry);
	return GitIgnoreRegistry.getRequirements();
}
/**
* Dynamically collects package.json script requirements from all discovered subauditors,
* registered extensions, and audit.config.ts, collecting unique script names in a Set
* to prevent duplicates when multiple auditors share or expose the same command.
*/
async function collectAllPackageScriptRequirements(projectRoot = process.cwd(), config) {
	const effectiveConfig = config ?? await loadAuditConfig(projectRoot);
	const tasks = await discoverAuditors({ projectRoot });
	const seenScriptNames = /* @__PURE__ */ new Set();
	const collected = [];
	const addRequirement = (req) => {
		if (!req || !req.name || !req.command) return;
		if (seenScriptNames.has(req.name)) return;
		seenScriptNames.add(req.name);
		collected.push(req);
		PackageScriptRegistry.register(req);
	};
	for (const task of tasks) if (task.scripts && task.scripts.length > 0) for (const script of task.scripts) addRequirement(script);
	for (const req of CORE_PACKAGE_SCRIPT_REQUIREMENTS) addRequirement(req);
	const customScripts = effectiveConfig.packageScripts?.extraRequiredScripts ?? [];
	for (const scriptName of customScripts) addRequirement({
		name: scriptName,
		command: `auditor task=${scriptName}`,
		description: `Script requerido adicional configurado en audit.config.ts (${scriptName})`,
		category: "custom"
	});
	return collected;
}
//#endregion
export { AUDIT_PRESETS, DEFAULT_PERMISSIONS, buildTaskCliArguments, collectAllGitIgnoreRequirements, collectAllPackageScriptRequirements, createAuditTaskDefinition, discoverAuditors, extractAuditorMetadataFromFile, extractCapabilitiesFromFile, extractGitIgnoreRequirementsFromFile, extractStaticMetadataFromFile, formatTaskTitle, getPermissionsForTask, getTimeoutForTask, isSimilarCodeSkipped, shouldSkipTaskByCapabilities, shouldSkipTaskByFilters };
