import { AuditEngineConfig } from "./auditConfigTypes.js";
import { matchesAnyRoot } from "./auditRootMatcher.js";
import { isTestFileForCodeAudit, isTestPath } from "./auditTestPredicates.js";
import { isSelfProviderProject } from "./auditProjectIdentity.js";
import { Z_LAYERS, getEffectiveZLayers, resolveZLayersScssPath } from "./auditZLayers.js";
//#region src/core/auditPathPredicates.d.ts
/**
 * packages/auditor/src/core/auditPathPredicates.ts
 *
 * Path categorization predicates, root matchers, and Z-Layers resolution helpers.
 */
/**
 * Determines whether a file path belongs to a data catalog directory (e.g. static game data,
 * catalogs, domain fixtures) configured in paths.dataRoots.
 */
export declare function isDataPath(filePath: string): boolean;
/**
 * Determines whether a file path belongs to a demo/showcase/mock directory
 * configured in paths.demoRoots.
 */
export declare function isDemoPath(filePath: string): boolean;
/**
 * Checks whether a file path belongs to an explicitly exempt file in paths.exemptFiles.
 */
export declare function isExemptFile(filePath: string, config?: AuditEngineConfig): boolean;
/**
 * Determines whether a file path belongs to codeRoots configured for general code audits,
 * dynamically respecting whether test directories are included or excluded.
 */
export declare function isInCodeRoots(filePath: string, config?: AuditEngineConfig): boolean;
/**
 * Checks whether a file path belongs to scriptsRoots.
 */
export declare function isScriptPath(filePath: string, config?: AuditEngineConfig): boolean;
/**
 * Checks whether a file path belongs to srcRoots.
 */
export declare function isSrcPath(filePath: string, config?: AuditEngineConfig): boolean;
/**
 * Checks whether a file path belongs to cliRoots.
 */
export declare function isCliPath(filePath: string, config?: AuditEngineConfig): boolean;
//#endregion
export { Z_LAYERS, getEffectiveZLayers, isSelfProviderProject, isTestFileForCodeAudit, isTestPath, matchesAnyRoot, resolveZLayersScssPath };