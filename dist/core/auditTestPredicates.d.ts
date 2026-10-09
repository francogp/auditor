/**
 * packages/auditor/src/core/auditTestPredicates.ts
 *
 * Test and spec path detection predicates driven by audit.config.ts.
 */
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
//# sourceMappingURL=auditTestPredicates.d.ts.map