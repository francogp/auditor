//#region src/core/auditRootMatcher.d.ts
/**
 * packages/auditor/src/core/auditRootMatcher.ts
 *
 * Path root matching primitives.
 */
/**
 * Helper to check if a normalized path matches any of the given root directories.
 */
export declare function matchesAnyRoot(normalizedPath: string, roots: readonly string[]): boolean;
//#endregion