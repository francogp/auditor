/**
 * packages/auditor/src/core/auditPathPredicates.ts
 *
 * Path categorization predicates, root matchers, and Z-Layers resolution helpers.
 */
import { getAuditConfig } from "./auditConfigLoader.js";
import { matchesAnyRoot } from "./auditRootMatcher.js";
import { isTestPath } from "./auditTestPredicates.js";
/**
 * Determines whether a file path belongs to a data catalog directory (e.g. static game data,
 * catalogs, domain fixtures) configured in paths.dataRoots.
 */
export function isDataPath(filePath) {
    if (!filePath)
        return false;
    const norm = filePath.split('\\').join('/').toLowerCase();
    const config = getAuditConfig();
    const dataRoots = config?.paths?.dataRoots ?? ['src/data'];
    return matchesAnyRoot(norm, dataRoots);
}
/**
 * Determines whether a file path belongs to a demo/showcase/mock directory
 * configured in paths.demoRoots.
 */
export function isDemoPath(filePath) {
    if (!filePath)
        return false;
    const norm = filePath.split('\\').join('/').toLowerCase();
    const config = getAuditConfig();
    const demoRoots = config?.paths?.demoRoots ?? [];
    return matchesAnyRoot(norm, demoRoots);
}
/**
 * Checks whether a file path belongs to an explicitly exempt file in paths.exemptFiles.
 */
export function isExemptFile(filePath, config = getAuditConfig()) {
    if (!filePath)
        return false;
    const norm = filePath.split('\\').join('/').toLowerCase();
    const exemptFiles = config?.paths?.exemptFiles ?? [];
    return exemptFiles.some(f => {
        const clean = f.replace(/^\/+|\/+$/g, '').toLowerCase();
        return norm === clean || norm.endsWith('/' + clean);
    });
}
/**
 * Determines whether a file path belongs to codeRoots configured for general code audits,
 * dynamically respecting whether test directories are included or excluded.
 */
export function isInCodeRoots(filePath, config = getAuditConfig()) {
    if (!filePath)
        return false;
    const norm = filePath.split('\\').join('/').toLowerCase();
    if (norm.includes('node_modules'))
        return false;
    const codeRoots = config?.paths?.codeRoots ?? ['src', 'scripts'];
    if (!matchesAnyRoot(norm, codeRoots))
        return false;
    const includesTests = config?.paths?.includeTestsInCodeAudit === true ||
        (config?.paths?.testRoots ?? []).some(tr => codeRoots.includes(tr));
    if (!includesTests && isTestPath(filePath)) {
        return false;
    }
    return true;
}
/**
 * Checks whether a file path belongs to scriptsRoots.
 */
export function isScriptPath(filePath, config = getAuditConfig()) {
    if (!filePath)
        return false;
    const norm = filePath.split('\\').join('/').toLowerCase();
    const scriptsRoots = config?.paths?.scriptsRoots ?? ['scripts'];
    return matchesAnyRoot(norm, scriptsRoots);
}
/**
 * Checks whether a file path belongs to srcRoots.
 */
export function isSrcPath(filePath, config = getAuditConfig()) {
    if (!filePath)
        return false;
    const norm = filePath.split('\\').join('/').toLowerCase();
    const srcRoots = config?.paths?.srcRoots ?? ['src'];
    return matchesAnyRoot(norm, srcRoots);
}
/**
 * Checks whether a file path belongs to cliRoots.
 */
export function isCliPath(filePath, config = getAuditConfig()) {
    if (!filePath)
        return false;
    const norm = filePath.split('\\').join('/').toLowerCase();
    const cliRoots = config?.paths?.cliRoots ?? ['src/cli'];
    return matchesAnyRoot(norm, cliRoots);
}
export * from "./auditRootMatcher.js";
export * from "./auditTestPredicates.js";
export * from "./auditProjectIdentity.js";
export * from "./auditZLayers.js";
//# sourceMappingURL=auditPathPredicates.js.map