/**
 * packages/auditor/src/core/auditRootMatcher.ts
 *
 * Path root matching primitives.
 */

/**
 * Helper to check if a normalized path matches any of the given root directories.
 */
export function matchesAnyRoot(normalizedPath: string, roots: readonly string[]): boolean {
  if (!normalizedPath || !roots || roots.length === 0) return false;

  // System, agent, and build infrastructure directories are never matched as project code roots
  if (
    normalizedPath.startsWith('.agents/') ||
    normalizedPath.startsWith('.git/') ||
    normalizedPath.startsWith('.gemini/') ||
    normalizedPath.startsWith('node_modules/') ||
    normalizedPath.startsWith('scratch/')
  ) {
    return roots.some((root) => {
      const cleanRoot = root.replace(/^\/+|\/+$/g, '').toLowerCase();
      return (
        cleanRoot.startsWith('.agents/') ||
        cleanRoot.startsWith('.git/') ||
        cleanRoot.startsWith('.gemini/') ||
        cleanRoot.startsWith('scratch/')
      );
    });
  }

  return roots.some((root) => {
    const cleanRoot = root.replace(/^\/+|\/+$/g, '').toLowerCase();
    return (
      cleanRoot !== '' &&
      (normalizedPath === cleanRoot ||
        normalizedPath.startsWith(cleanRoot + '/') ||
        normalizedPath.includes('/' + cleanRoot + '/'))
    );
  });
}
