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
 * Determines whether a file path belongs to a constants definition directory or module
 * configured in paths.constantsRoots or located within a /constants/ directory.
 */
export declare function isConstantsPath(filePath: string): boolean;
/**
 * Checks whether a file path belongs to an explicitly exempt file in paths.exemptFiles.
 */
export declare function isExemptFile(filePath: string, config?: import("./auditConfigTypes.ts").AuditEngineConfig): boolean;
/**
 * Determines whether a file path belongs to codeRoots configured for general code audits,
 * dynamically respecting whether test directories are included or excluded.
 */
export declare function isInCodeRoots(filePath: string, config?: import("./auditConfigTypes.ts").AuditEngineConfig): boolean;
/**
 * Checks whether a file path belongs to scriptsRoots.
 */
export declare function isScriptPath(filePath: string, config?: import("./auditConfigTypes.ts").AuditEngineConfig): boolean;
/**
 * Checks whether a file path belongs to srcRoots.
 */
export declare function isSrcPath(filePath: string, config?: import("./auditConfigTypes.ts").AuditEngineConfig): boolean;
/**
 * Checks whether a file path belongs to cliRoots.
 */
export declare function isCliPath(filePath: string, config?: import("./auditConfigTypes.ts").AuditEngineConfig): boolean;
export * from './auditRootMatcher.ts';
export * from './auditTestPredicates.ts';
export * from './auditProjectIdentity.ts';
export * from './auditZLayers.ts';
//# sourceMappingURL=auditPathPredicates.d.ts.map