import { normalizePosixPath } from "../core/reportUtils.js";
import "../core/auditConfig.js";
import { resolveEffectiveSpeed, resolveFamilyMetadata } from "../core/auditContract.js";
import { DEFAULT_PERMISSIONS } from "../core/permissionGuard.js";
import { GitIgnoreRegistry } from "../core/gitIgnoreRegistry.js";
import { PackageScriptRegistry } from "../core/packageScriptRegistry.js";
import { toPosixRelative } from "../core/auditCoverage.js";
import "../core/safePath.js";
import { extractAuditorMetadataFromFile } from "./auditorMetadata.js";
import path from "node:path";
//#region src/cli/auditTaskFactory.ts
/**
* packages/auditor/src/cli/auditTaskFactory.ts
*
* Task definition construction, permission resolution, and execution filtering
* for auditor auto-discovery.
*/
const DEFAULT_TIMEOUT_MS = 0;
function getTimeoutForTask(_filename, configRunnerTimeout) {
	return configRunnerTimeout ?? DEFAULT_TIMEOUT_MS;
}
function getPermissionsForTask(filename, fullPath) {
	const perms = [...DEFAULT_PERMISSIONS];
	if (fullPath && fullPath.endsWith(".js")) {
		const stripIdx = perms.indexOf("--experimental-strip-types");
		if (stripIdx !== -1) perms.splice(stripIdx, 1);
	}
	if (filename.includes("audit_project") || filename.includes("convert_assets")) perms.push("--allow-worker");
	return perms;
}
/** Convert snake_case or kebab-case filename to Title Case */
function formatTaskTitle(filename) {
	const baseName = path.basename(filename, path.extname(filename));
	if (baseName === "audit_project") return "Project Architecture & Style Rules";
	if (baseName === "validate_stylelint") return "CSS & SCSS Stylelint Hygiene";
	return baseName.replace(/^(validate_|audit_)/, "").split(/[_-]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
function shouldSkipTaskByFilters(id, filename, family, isFast, options, targetSuiteIds) {
	if (options.skipSimilar && (id === "validate_similar_code" || filename.includes("validate_similar_code"))) return true;
	if (targetSuiteIds && !targetSuiteIds.has(id)) return true;
	if (options.family && options.family !== family) return true;
	if (options.task && !options.task.includes(",") && options.task !== id && !filename.includes(options.task)) return true;
	if (options.fastOnly && !isFast) return true;
	return false;
}
function shouldSkipTaskByCapabilities(capabilities, options) {
	if (Boolean(options.phase === "post-build" || options.preset === "post-build" || options.preset === "build" || options.buildOnly)) return capabilities?.phase !== "post-build";
	if (options.phase && capabilities?.phase !== options.phase) return true;
	if (options.fixOnly) return !capabilities?.fix || capabilities.fix === "none";
	if (options.mdOnly || options.preset === "md") return !capabilities?.md;
	if (options.criticalOnly || options.onlyCritical || options.preset === "critical") return !capabilities?.critical;
	const isTargeted = Boolean(options.withBuild || options.task || options.suites);
	if (!isTargeted && capabilities?.phase === "post-build") return true;
	if (options.onlySpeed) return resolveEffectiveSpeed(capabilities?.speed, { onlySpeed: options.onlySpeed }) === null;
	const speedPresetNames = /* @__PURE__ */ new Set([
		"lint",
		"full",
		"precommit"
	]);
	const hasExplicitSpeedOrPreset = Boolean(options.speed || options.lintOnly || options.precommitOnly || options.includeHeavy === false || options.preset && speedPresetNames.has(options.preset));
	if (!isTargeted || hasExplicitSpeedOrPreset) {
		let maxSpeed = "heavy";
		if (options.speed) maxSpeed = options.speed;
		else if (options.lintOnly || options.preset === "lint" || options.includeHeavy === false) maxSpeed = "light";
		else if (options.preset === "full" || options.preset === "precommit" || options.precommitOnly) maxSpeed = "full";
		if (!(capabilities?.critical === true && maxSpeed === "light") && resolveEffectiveSpeed(capabilities?.speed ?? "light", { maxSpeed }) === null) return true;
	}
	return false;
}
function buildTaskCliArguments(filename, fullPath, id, isBuiltin, options) {
	const relScriptPath = toPosixRelative(process.cwd(), fullPath);
	const scriptArg = relScriptPath.startsWith("..") || path.isAbsolute(relScriptPath) ? normalizePosixPath(fullPath) : relScriptPath;
	const taskArgs = [
		...getPermissionsForTask(filename, fullPath),
		scriptArg,
		"--json"
	];
	if (isBuiltin && id === "audit_project") {
		if (options.preset === "lint" || options.lintOnly) taskArgs.push("--rule", "fallow");
		else if (options.preset === "md" || options.mdOnly) taskArgs.push("--rule", "dox");
	}
	return taskArgs;
}
function resolveTaskConfigKey(metadata, taskId) {
	if (metadata.configKey) return metadata.configKey;
	if (metadata.manifest?.configKey) return metadata.manifest.configKey;
	throw new Error(`[Auditor Contract Violation] Suite/task [${taskId}] must define a mandatory 'configKey'. Silent fallbacks are strictly prohibited.`);
}
function resolveTaskDefaultConfig(metadata, taskId) {
	if (metadata.defaultConfig) return metadata.defaultConfig;
	if (metadata.manifest?.defaultConfig) return metadata.manifest.defaultConfig;
	throw new Error(`[Auditor Contract Violation] Suite/task [${taskId}] must define a mandatory 'defaultConfig'. Silent fallbacks are strictly prohibited.`);
}
function resolveTaskRuleDescriptions(metadata) {
	if (metadata.ruleDescriptions) return metadata.ruleDescriptions;
	return metadata.manifest?.rules;
}
function resolveTaskRuleRemediations(metadata) {
	if (metadata.ruleRemediations) return metadata.ruleRemediations;
	return metadata.manifest?.remediations;
}
function resolveTaskDescription(metadata) {
	if (metadata.description) return metadata.description;
	return metadata.manifest?.description;
}
async function createAuditTaskDefinition(fullPath, filename, family, config, options, isBuiltin, targetSuiteIds) {
	const id = filename;
	const isFast = family === "architecture" || filename.includes("domain_types");
	if (shouldSkipTaskByFilters(id, filename, family, isFast, options, targetSuiteIds)) return null;
	const metadata = await extractAuditorMetadataFromFile(fullPath);
	const capabilities = metadata.capabilities;
	const gitIgnoreEntries = metadata.gitIgnoreEntries;
	if (gitIgnoreEntries.length > 0) GitIgnoreRegistry.registerMany(gitIgnoreEntries);
	const scripts = metadata.scripts;
	if (scripts && scripts.length > 0) PackageScriptRegistry.registerMany(scripts, id);
	if (shouldSkipTaskByCapabilities(capabilities, options)) return null;
	const taskArgs = buildTaskCliArguments(filename, fullPath, id, isBuiltin, options);
	const relScriptPath = toPosixRelative(process.cwd(), fullPath);
	const effectiveScriptPath = relScriptPath.startsWith("..") || path.isAbsolute(relScriptPath) ? normalizePosixPath(fullPath) : relScriptPath;
	const familyMeta = resolveFamilyMetadata(family, config.customFamilies);
	const effectiveIcon = metadata.icon ?? (isBuiltin ? familyMeta.icon : "🧩");
	return {
		id,
		name: formatTaskTitle(filename),
		description: resolveTaskDescription(metadata),
		family,
		scriptPath: effectiveScriptPath,
		command: "node",
		args: taskArgs,
		fast: isFast,
		timeoutMs: getTimeoutForTask(filename, config.runner?.timeoutMs),
		order: familyMeta.order,
		requiresAst: Boolean(capabilities?.ast),
		isBuiltin,
		icon: effectiveIcon,
		capabilities: capabilities ?? void 0,
		gitIgnoreEntries: gitIgnoreEntries.length > 0 ? gitIgnoreEntries : void 0,
		scripts: scripts && scripts.length > 0 ? scripts : void 0,
		manifest: metadata.manifest,
		configKey: resolveTaskConfigKey(metadata, id),
		defaultConfig: resolveTaskDefaultConfig(metadata, id),
		criticalConfig: metadata.criticalConfig,
		ruleDescriptions: resolveTaskRuleDescriptions(metadata),
		ruleRemediations: resolveTaskRuleRemediations(metadata)
	};
}
//#endregion
export { DEFAULT_PERMISSIONS, buildTaskCliArguments, createAuditTaskDefinition, formatTaskTitle, getPermissionsForTask, getTimeoutForTask, shouldSkipTaskByCapabilities, shouldSkipTaskByFilters };
