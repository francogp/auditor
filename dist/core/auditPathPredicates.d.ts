/**
 * packages/auditor/src/core/auditPathPredicates.ts
 *
 * Path categorization predicates, root matchers, and Z-Layers resolution helpers.
 */
/**
 * Helper to check if a normalized path matches any of the given root directories.
 */
export declare function matchesAnyRoot(normalizedPath: string, roots: readonly string[]): boolean;
/**
 * Determines whether a file path belongs to a test, spec, mock, or e2e directory
 * driven dynamically by the project's audit.config.ts configuration.
 */
export declare function isTestPath(filePath: string): boolean;
/**
 * Determines whether a file path is a test file that should be skipped during source code audits,
 * honoring config.paths.includeTestsInCodeAudit.
 */
export declare function isTestFileForCodeAudit(filePath: string, projectRoot?: string): boolean;
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
 * Determines whether the specified project root is the @francogp/auditor provider repository itself.
 */
export declare function isSelfProviderProject(projectRoot: string): boolean;
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
/**
 * Resolves the primary SCSS file path for Z-Layers from config or stylesRoots.
 */
export declare function resolveZLayersScssPath(projectRoot?: string): string | undefined;
/**
 * Canonical fallback Z-Layers scale matching framework standards.
 */
export declare const Z_LAYERS: Readonly<Record<string, number>>;
/**
 * Resolves the effective Z-Layers dictionary from config.styles.zLayers,
 * or by parsing the TypeScript file defined in config.styles.zLayersTsFile or config.domain.zLayersFile,
 * or falls back to the default Z_LAYERS.
 */
export declare function getEffectiveZLayers(projectRoot?: string): Record<string, number>;
//# sourceMappingURL=auditPathPredicates.d.ts.map