/**
 * src/core/satelliteGlobMatcher.ts
 *
 * Satellite configuration sovereignty validation and allowed excludes resolution.
 * Verifies that path exclusions in satellite config files (.fallowrc.json, .stylelintrc.json, etc.)
 * are legitimately declared in the central SSoT audit configuration.
 */

import { enableCompileCache } from 'node:module';

import type { AuditConfig } from './auditConfigTypes.ts';
import { getEffectiveIgnoreGlobs } from './canonicalIgnoreRegistry.ts';
import {
  isPatternContainedInGlobs,
  stripGlobSuffix,
  type SatelliteGlobMatcherContext
} from './globContainment.ts';
import { normalizePosixPath } from './reportUtils.ts';

enableCompileCache();

export { stripGlobSuffix, isPatternContainedInGlobs, type SatelliteGlobMatcherContext };

function addNormalizedPaths(globs: readonly string[] | undefined, target: Set<string>): void {
  if (!globs) return;
  for (let i = 0; i < globs.length; i++) {
    target.add(normalizePosixPath(globs[i]!));
  }
}

/**
 * Resolves the canonical set of allowed path exemptions and ignore globs from SSoT config.
 * Encapsulates all canonical root categories, data directories, test roots, demo directories,
 * and global ignore globs for satellite configuration sovereignty validators.
 */
export function getAllowedSatellitePathExcludes(
  auditConfig: AuditConfig,
  projectRoot: string
): ReadonlySet<string> {
  const result = new Set<string>();
  addNormalizedPaths(getEffectiveIgnoreGlobs(projectRoot), result);

  const p = auditConfig.paths;
  if (p) {
    addNormalizedPaths(p.ignoreGlobs, result);
    addNormalizedPaths(p.dataRoots, result);
    addNormalizedPaths(p.demoRoots, result);
    addNormalizedPaths(p.testRoots, result);
    addNormalizedPaths(p.cliRoots, result);
    addNormalizedPaths(p.integrationRoots, result);
    addNormalizedPaths(p.e2eRoots, result);
  }

  return result;
}

function resolveMatcherContext(
  contextOrAllowed: SatelliteGlobMatcherContext | ReadonlySet<string>,
  effectiveGlobsOrHandler: readonly string[] | ((entry: string, index: number) => void)
): SatelliteGlobMatcherContext {
  if ('allowedGlobs' in contextOrAllowed) {
    return contextOrAllowed;
  }
  const effective = Array.isArray(effectiveGlobsOrHandler) ? effectiveGlobsOrHandler : [];
  return { allowedGlobs: contextOrAllowed, effectiveGlobs: effective };
}

function isCandidateEntryAllowed(entry: string, context: SatelliteGlobMatcherContext): boolean {
  if (isPatternContainedInGlobs(entry, context)) {
    return true;
  }
  if (entry.startsWith('!')) {
    const clean = entry.slice(1);
    return isPatternContainedInGlobs(clean, context);
  }
  return false;
}

/**
 * Validates a list of candidate path/glob entries from a satellite configuration file against
 * allowed exemptions and effective ignore globs. Invokes onUndeclared for each entry not covered.
 */
export function validateSatelliteUndeclaredEntries(
  entries: readonly string[],
  contextOrAllowed: SatelliteGlobMatcherContext | ReadonlySet<string>,
  effectiveGlobsOrHandler: readonly string[] | ((entry: string, index: number) => void),
  maybeHandler?: (entry: string, index: number) => void
): void {
  const context = resolveMatcherContext(contextOrAllowed, effectiveGlobsOrHandler);
  const onUndeclared =
    typeof effectiveGlobsOrHandler === 'function' ? effectiveGlobsOrHandler : maybeHandler!;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (typeof entry !== 'string' || entry.length === 0) {
      continue;
    }
    if (!isCandidateEntryAllowed(entry, context)) {
      onUndeclared(entry, i);
    }
  }
}
