/**
 * packages/auditor/src/core/auditRootMatcher.ts
 *
 * Path root matching primitives.
 */

import { ALWAYS_IGNORE_DIRS } from './canonicalIgnoreRegistry.ts';

/**
 * Helper to check if a normalized path matches any of the given root directories.
 */
export function matchesAnyRoot(normalizedPath: string, roots: readonly string[]): boolean {
  if (!normalizedPath || !roots || roots.length === 0) return false;

  // System, agent, and build infrastructure directories are never matched as project code roots
  const firstSegment = normalizedPath.split('/')[0] ?? '';
  if (ALWAYS_IGNORE_DIRS.has(firstSegment)) {
    return roots.some((root) => {
      const cleanRoot = root.replace(/^\/+|\/+$/g, '').toLowerCase();
      const rootFirstSegment = cleanRoot.split('/')[0] ?? '';
      return ALWAYS_IGNORE_DIRS.has(rootFirstSegment);
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
