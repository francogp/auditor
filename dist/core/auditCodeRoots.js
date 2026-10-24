import { DEFAULT_AUDIT_CONFIG } from "./auditConfigDefaults.js";
import { normalizePosixPath } from "./reportUtils.js";
import { getAuditConfig } from "./auditConfigLoader.js";
import { matchesAnyRoot } from "./auditRootMatcher.js";
import { isTestPath } from "./auditTestPredicates.js";
import "./safePath.js";
// src/core/auditCodeRoots.ts
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
	const norm = normalizePosixPath(filePath).toLowerCase();
	if (norm.includes("node_modules")) return false;
	const codeRoots = config?.paths?.codeRoots ?? DEFAULT_AUDIT_CONFIG.paths.codeRoots;
	if (!matchesAnyRoot(norm, codeRoots)) return false;
	if (!(config?.paths?.includeTestsInCodeAudit === true || (config?.paths?.testRoots ?? []).some((tr) => codeRoots.includes(tr))) && isTestPath(filePath)) return false;
	return true;
}
/**
* Checks whether a file path belongs to scriptsRoots.
*/
function isScriptPath(filePath, config = getAuditConfig()) {
	if (!filePath) return false;
	const norm = normalizePosixPath(filePath).toLowerCase();
	const scriptsRoots = config?.paths?.scriptsRoots ?? DEFAULT_AUDIT_CONFIG.paths.scriptsRoots;
	return matchesAnyRoot(norm, scriptsRoots);
}
/**
* Checks whether a file path belongs to srcRoots.
*/
function isSrcPath(filePath, config = getAuditConfig()) {
	if (!filePath) return false;
	const norm = normalizePosixPath(filePath).toLowerCase();
	const srcRoots = config?.paths?.srcRoots ?? DEFAULT_AUDIT_CONFIG.paths.srcRoots;
	return matchesAnyRoot(norm, srcRoots);
}
/**
* Checks whether a file path belongs to cliRoots.
*/
function isCliPath(filePath, config = getAuditConfig()) {
	if (!filePath) return false;
	const norm = normalizePosixPath(filePath).toLowerCase();
	const cliRoots = config?.paths?.cliRoots ?? DEFAULT_AUDIT_CONFIG.paths.cliRoots ?? [];
	return matchesAnyRoot(norm, cliRoots);
}
export { isCliPath, isInCodeRoots, isScriptPath, isSrcPath };
