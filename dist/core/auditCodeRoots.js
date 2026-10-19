import { getAuditConfig } from "./auditConfigLoader.js";
import { matchesAnyRoot } from "./auditRootMatcher.js";
import { isTestPath } from "./auditTestPredicates.js";
//#region src/core/auditCodeRoots.ts
/**
* packages/auditor/src/core/auditCodeRoots.ts
*
* Path predicates for source code roots, scripts, and CLI directories.
*/
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
export { isCliPath, isInCodeRoots, isScriptPath, isSrcPath };
