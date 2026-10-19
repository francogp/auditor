import { getAuditConfig } from "./auditConfigLoader.js";
import { matchesAnyRoot } from "./auditRootMatcher.js";
import { normalizePosixPath } from "./reportUtils.js";
//#region src/core/auditTestPredicates.ts
/**
* packages/auditor/src/core/auditTestPredicates.ts
*
* Test and spec path detection predicates driven by audit.config.ts.
*/
const TEST_FILE_REGEX = /\.(?:test|spec)\./;
function hasTestFileExtensionOrPattern(base, customPatterns) {
	if (TEST_FILE_REGEX.test(base)) return true;
	return customPatterns.some((pat) => base.includes(pat.toLowerCase()));
}
function matchesConfiguredOrFallbackTestRoots(norm, configuredRoots) {
	if (matchesAnyRoot(norm, configuredRoots)) return true;
	const isFallbackRoot = norm.startsWith("tests/") || norm.includes("/tests/");
	return configuredRoots.length === 0 && isFallbackRoot;
}
/**
* Determines whether a file path belongs to a test, spec, mock, or e2e directory
* driven dynamically by the project's audit.config.ts configuration.
*/
function isTestPath(filePath, projectRoot) {
	if (!filePath) return false;
	const norm = normalizePosixPath(filePath).toLowerCase();
	const base = norm.split("/").pop() || "";
	const config = getAuditConfig(projectRoot);
	if (hasTestFileExtensionOrPattern(base, config?.paths?.testFilePatterns ?? [])) return true;
	return matchesConfiguredOrFallbackTestRoots(norm, [
		...config.paths.testRoots ?? [],
		...config.paths.e2eRoots ?? [],
		...config.paths.integrationRoots ?? []
	]);
}
/**
* Determines whether a file path is a test file that should be skipped during source code audits,
* honoring config.paths.includeTestsInCodeAudit.
*/
function isTestFileForCodeAudit(filePath, projectRoot) {
	if (getAuditConfig(projectRoot)?.paths?.includeTestsInCodeAudit) return false;
	return isTestPath(filePath, projectRoot);
}
//#endregion
export { isTestFileForCodeAudit, isTestPath };
