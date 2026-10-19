import { AuditEngineConfig } from "./auditConfigTypes.js";
//#region src/core/auditCodeRoots.d.ts
/**
 * packages/auditor/src/core/auditCodeRoots.ts
 *
 * Path predicates for source code roots, scripts, and CLI directories.
 */
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