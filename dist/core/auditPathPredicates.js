import { getAuditConfig } from "./auditConfigLoader.js";
import { matchesAnyRoot } from "./auditRootMatcher.js";
import { isTestFileForCodeAudit, isTestPath } from "./auditTestPredicates.js";
import { isSelfProviderProject } from "./auditProjectIdentity.js";
import { Z_LAYERS, getEffectiveZLayers, resolveZLayersScssPath } from "./auditZLayers.js";
//#region src/core/auditPathPredicates.ts
/**
* packages/auditor/src/core/auditPathPredicates.ts
*
* Path categorization predicates, root matchers, and Z-Layers resolution helpers.
*/
/**
* Determines whether a file path belongs to a data catalog directory (e.g. static game data,
* catalogs, domain fixtures) configured in paths.dataRoots.
*/
function isDataPath(filePath) {
	if (!filePath) return false;
	const norm = filePath.split("\\").join("/").toLowerCase();
	const dataRoots = getAuditConfig()?.paths?.dataRoots ?? ["src/data"];
	return matchesAnyRoot(norm, dataRoots);
}
/**
* Determines whether a file path belongs to a demo/showcase/mock directory
* configured in paths.demoRoots.
*/
function isDemoPath(filePath) {
	if (!filePath) return false;
	const norm = filePath.split("\\").join("/").toLowerCase();
	const demoRoots = getAuditConfig()?.paths?.demoRoots ?? [];
	return matchesAnyRoot(norm, demoRoots);
}
/**
* Checks whether a file path belongs to an explicitly exempt file in paths.exemptFiles.
*/
function isExemptFile(filePath, config = getAuditConfig()) {
	if (!filePath) return false;
	const norm = filePath.split("\\").join("/").toLowerCase();
	return (config?.paths?.exemptFiles ?? []).some((f) => {
		const clean = f.replace(/^\/+|\/+$/g, "").toLowerCase();
		return norm === clean || norm.endsWith("/" + clean);
	});
}
/**
* Determines whether a file path belongs to codeRoots configured for general code audits,
* dynamically respecting whether test directories are included or excluded.
*/
function isInCodeRoots(filePath, config = getAuditConfig()) {
	if (!filePath) return false;
	const norm = filePath.split("\\").join("/").toLowerCase();
	if (norm.includes("node_modules")) return false;
	const codeRoots = config?.paths?.codeRoots ?? ["src", "scripts"];
	if (!matchesAnyRoot(norm, codeRoots)) return false;
	if (!(config?.paths?.includeTestsInCodeAudit === true || (config?.paths?.testRoots ?? []).some((tr) => codeRoots.includes(tr))) && isTestPath(filePath)) return false;
	return true;
}
/**
* Checks whether a file path belongs to scriptsRoots.
*/
function isScriptPath(filePath, config = getAuditConfig()) {
	if (!filePath) return false;
	const norm = filePath.split("\\").join("/").toLowerCase();
	const scriptsRoots = config?.paths?.scriptsRoots ?? ["scripts"];
	return matchesAnyRoot(norm, scriptsRoots);
}
/**
* Checks whether a file path belongs to srcRoots.
*/
function isSrcPath(filePath, config = getAuditConfig()) {
	if (!filePath) return false;
	const norm = filePath.split("\\").join("/").toLowerCase();
	const srcRoots = config?.paths?.srcRoots ?? ["src"];
	return matchesAnyRoot(norm, srcRoots);
}
/**
* Checks whether a file path belongs to cliRoots.
*/
function isCliPath(filePath, config = getAuditConfig()) {
	if (!filePath) return false;
	const norm = filePath.split("\\").join("/").toLowerCase();
	const cliRoots = config?.paths?.cliRoots ?? ["src/cli"];
	return matchesAnyRoot(norm, cliRoots);
}
//#endregion
export { Z_LAYERS, getEffectiveZLayers, isCliPath, isDataPath, isDemoPath, isExemptFile, isInCodeRoots, isScriptPath, isSelfProviderProject, isSrcPath, isTestFileForCodeAudit, isTestPath, matchesAnyRoot, resolveZLayersScssPath };
