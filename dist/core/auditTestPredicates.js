/**
 * packages/auditor/src/core/auditTestPredicates.ts
 *
 * Test and spec path detection predicates driven by audit.config.ts.
 */
import { getAuditConfig } from "./auditConfigLoader.js";
import { matchesAnyRoot } from "./auditRootMatcher.js";
import { normalizePosixPath } from "./reportUtils.js";
const TEST_FILE_REGEX = /\.(?:test|spec)\./;
function hasTestFileExtensionOrPattern(base, customPatterns) {
    if (TEST_FILE_REGEX.test(base)) {
        return true;
    }
    return customPatterns.some(pat => base.includes(pat.toLowerCase()));
}
function matchesConfiguredOrFallbackTestRoots(norm, configuredRoots) {
    if (matchesAnyRoot(norm, configuredRoots)) {
        return true;
    }
    const isFallbackRoot = norm.startsWith('tests/') || norm.includes('/tests/');
    return configuredRoots.length === 0 && isFallbackRoot;
}
/**
 * Determines whether a file path belongs to a test, spec, mock, or e2e directory
 * driven dynamically by the project's audit.config.ts configuration.
 */
export function isTestPath(filePath) {
    if (!filePath)
        return false;
    const norm = normalizePosixPath(filePath).toLowerCase();
    const base = norm.split('/').pop() || '';
    const config = getAuditConfig();
    const customTestPatterns = config?.paths?.testFilePatterns ?? [];
    if (hasTestFileExtensionOrPattern(base, customTestPatterns)) {
        return true;
    }
    const configuredRoots = [
        ...(config.paths.testRoots ?? []),
        ...(config.paths.e2eRoots ?? []),
        ...(config.paths.integrationRoots ?? [])
    ];
    return matchesConfiguredOrFallbackTestRoots(norm, configuredRoots);
}
/**
 * Determines whether a file path is a test file that should be skipped during source code audits,
 * honoring config.paths.includeTestsInCodeAudit.
 */
export function isTestFileForCodeAudit(filePath, projectRoot) {
    const config = getAuditConfig(projectRoot);
    if (config?.paths?.includeTestsInCodeAudit)
        return false;
    return isTestPath(filePath);
}
//# sourceMappingURL=auditTestPredicates.js.map