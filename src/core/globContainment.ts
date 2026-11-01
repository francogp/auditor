/**
 * src/core/globContainment.ts
 *
 * Glob pattern containment, path hierarchy evaluation, and container wildcard matching.
 * Provides pure path pattern matching without coupling to project configuration SSoT.
 */

import path from 'node:path';

import { normalizePosixPath } from './reportUtils.ts';
import { stripGlobSuffix } from './safePath.ts';

export { stripGlobSuffix };

/**
 * Parameter object encapsulating allowed glob exclusions and effective project ignore patterns.
 * Solves the Data Clump smell across glob matching functions.
 */
export interface SatelliteGlobMatcherContext {
  readonly allowedGlobs: ReadonlySet<string>;
  readonly effectiveGlobs: readonly string[];
}

const ROOT_WILDCARD_GLOBS: ReadonlySet<string> = new Set<string>(['**', '**/*', '.']);

function isPosixContained(parent: string, child: string): boolean {
  if (!parent || !child) return false;
  if (parent === child) return true;
  const rel = path.posix.relative(parent, child);
  return !rel.startsWith('..') && !path.posix.isAbsolute(rel);
}

function isSubsumedPath(
  parentContainerPath: string,
  normPattern: string,
  strippedPattern: string
): boolean {
  return (
    normPattern === parentContainerPath ||
    strippedPattern === parentContainerPath ||
    isPosixContained(parentContainerPath, normPattern) ||
    isPosixContained(parentContainerPath, strippedPattern)
  );
}

function matchesAnyContainerGlob(
  globs: Iterable<string>,
  normPattern: string,
  strippedPattern: string
): boolean {
  for (const g of globs) {
    if (ROOT_WILDCARD_GLOBS.has(g)) return true;
    const cleanG = stripGlobSuffix(g);
    const parentContainerPath = normalizePosixPath(cleanG);
    if (!parentContainerPath || parentContainerPath === '.') continue;
    if (isSubsumedPath(parentContainerPath, normPattern, strippedPattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether a candidate path or glob pattern is covered by an allowed glob set
 * or effective ignore globs, accounting for trailing slashes, wildcards, and directory boundaries.
 */
export function isPatternContainedInGlobs(
  pattern: string,
  contextOrAllowed: SatelliteGlobMatcherContext | ReadonlySet<string>,
  maybeEffectiveGlobs?: readonly string[]
): boolean {
  if (!pattern) return false;

  const allowedGlobs =
    'allowedGlobs' in contextOrAllowed ? contextOrAllowed.allowedGlobs : contextOrAllowed;
  const effectiveGlobs =
    'effectiveGlobs' in contextOrAllowed
      ? contextOrAllowed.effectiveGlobs
      : (maybeEffectiveGlobs ?? []);

  const norm = normalizePosixPath(pattern);
  const normPattern = norm.endsWith('/') ? norm.slice(0, -1) : norm;
  const strippedPattern = stripGlobSuffix(normPattern);
  if (
    allowedGlobs.has(pattern) ||
    allowedGlobs.has(norm) ||
    allowedGlobs.has(normPattern) ||
    allowedGlobs.has(strippedPattern) ||
    allowedGlobs.has(`${normPattern}/**`) ||
    allowedGlobs.has(`${normPattern}/*`)
  ) {
    return true;
  }
  return (
    matchesAnyContainerGlob(allowedGlobs, normPattern, strippedPattern) ||
    matchesAnyContainerGlob(effectiveGlobs, normPattern, strippedPattern)
  );
}
