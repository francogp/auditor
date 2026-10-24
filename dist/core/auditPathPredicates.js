import { getAuditConfig } from "./auditConfigLoader.js";
import { matchesAnyRoot } from "./auditRootMatcher.js";
import { isTestFileForCodeAudit, isTestPath } from "./auditTestPredicates.js";
import { isCliPath, isInCodeRoots, isScriptPath, isSrcPath } from "./auditCodeRoots.js";
import { isSelfProviderProject } from "./auditProjectIdentity.js";
import { Z_LAYERS, getEffectiveZLayers, resolveZLayersScssPath } from "./auditZLayers.js";
// src/core/auditPathPredicates.ts
/**
* packages/auditor/src/core/auditPathPredicates.ts
*
* Path categorization predicates, root matchers, and Z-Layers resolution helpers.
*/
/**
* Determines whether a file path belongs to a data catalog directory (e.g. static game data,
* catalogs, domain fixtures) configured in paths.dataRoots.
*/
function isDataPath(filePath, config = getAuditConfig()) {
	if (!filePath) return false;
	const norm = filePath.split("\\").join("/").toLowerCase();
	const dataRoots = config?.paths?.dataRoots ?? ["src/data"];
	return matchesAnyRoot(norm, dataRoots);
}
/**
* Determines whether a file path belongs to a demo/showcase/mock directory
* configured in paths.demoRoots.
*/
function isDemoPath(filePath, config = getAuditConfig()) {
	if (!filePath) return false;
	const norm = filePath.split("\\").join("/").toLowerCase();
	const demoRoots = config?.paths?.demoRoots ?? [];
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
export { Z_LAYERS, getEffectiveZLayers, isCliPath, isDataPath, isDemoPath, isExemptFile, isInCodeRoots, isScriptPath, isSelfProviderProject, isSrcPath, isTestFileForCodeAudit, isTestPath, matchesAnyRoot, resolveZLayersScssPath };
