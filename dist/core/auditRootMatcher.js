/**
 * packages/auditor/src/core/auditRootMatcher.ts
 *
 * Path root matching primitives.
 */
/**
 * Helper to check if a normalized path matches any of the given root directories.
 */
export function matchesAnyRoot(normalizedPath, roots) {
    if (!normalizedPath || !roots || roots.length === 0)
        return false;
    return roots.some(root => {
        const cleanRoot = root.replace(/^\/+|\/+$/g, '').toLowerCase();
        return cleanRoot !== '' && (normalizedPath === cleanRoot ||
            normalizedPath.startsWith(cleanRoot + '/') ||
            normalizedPath.includes('/' + cleanRoot + '/'));
    });
}
//# sourceMappingURL=auditRootMatcher.js.map