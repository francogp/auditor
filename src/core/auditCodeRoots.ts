/**
 * packages/auditor/src/core/auditCodeRoots.ts
 *
 * Path predicates for source code roots, scripts, and CLI directories.
 */

import { getAuditConfig } from './auditConfigLoader.ts';
import { matchesAnyRoot } from './auditRootMatcher.ts';
import { isTestPath } from './auditTestPredicates.ts';

/**
 * Determines whether a file path belongs to codeRoots configured for general code audits,
 * dynamically respecting whether test directories are included or excluded.
 */
export function isInCodeRoots(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  if (norm.includes('node_modules')) return false;

  const codeRoots = config?.paths?.codeRoots ?? ['src', 'scripts'];
  if (!matchesAnyRoot(norm, codeRoots)) return false;

  const includesTests =
    config?.paths?.includeTestsInCodeAudit === true ||
    (config?.paths?.testRoots ?? []).some((tr) => codeRoots.includes(tr));

  if (!includesTests && isTestPath(filePath)) {
    return false;
  }

  return true;
}

/**
 * Checks whether a file path belongs to scriptsRoots.
 */
export function isScriptPath(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  const scriptsRoots = config?.paths?.scriptsRoots ?? ['scripts'];
  return matchesAnyRoot(norm, scriptsRoots);
}

/**
 * Checks whether a file path belongs to srcRoots.
 */
export function isSrcPath(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  const srcRoots = config?.paths?.srcRoots ?? ['src'];
  return matchesAnyRoot(norm, srcRoots);
}

/**
 * Checks whether a file path belongs to cliRoots.
 */
export function isCliPath(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  const cliRoots = config?.paths?.cliRoots ?? ['src/cli'];
  return matchesAnyRoot(norm, cliRoots);
}
