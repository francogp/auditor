/**
 * packages/auditor/src/core/auditCodeRoots.ts
 *
 * Path predicates for source code roots, scripts, and CLI directories.
 */

import { DEFAULT_AUDIT_CONFIG } from './auditConfigDefaults.ts';
import { getAuditConfig } from './auditConfigLoader.ts';
import { matchesAnyRoot } from './auditRootMatcher.ts';
import { isTestPath } from './auditTestPredicates.ts';
import { normalizePosixPath } from './safePath.ts';

/**
 * Determines whether a file path belongs to codeRoots configured for general code audits,
 * dynamically respecting whether test directories are included or excluded.
 */
export function isInCodeRoots(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = normalizePosixPath(filePath).toLowerCase();
  if (norm.includes('node_modules')) return false;

  const codeRoots = config?.paths?.codeRoots ?? DEFAULT_AUDIT_CONFIG.paths.codeRoots;
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
  const norm = normalizePosixPath(filePath).toLowerCase();
  const scriptsRoots = config?.paths?.scriptsRoots ?? DEFAULT_AUDIT_CONFIG.paths.scriptsRoots;
  return matchesAnyRoot(norm, scriptsRoots);
}

/**
 * Checks whether a file path belongs to srcRoots.
 */
export function isSrcPath(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = normalizePosixPath(filePath).toLowerCase();
  const srcRoots = config?.paths?.srcRoots ?? DEFAULT_AUDIT_CONFIG.paths.srcRoots;
  return matchesAnyRoot(norm, srcRoots);
}

/**
 * Checks whether a file path belongs to cliRoots.
 */
export function isCliPath(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = normalizePosixPath(filePath).toLowerCase();
  const cliRoots = config?.paths?.cliRoots ?? DEFAULT_AUDIT_CONFIG.paths.cliRoots ?? [];
  return matchesAnyRoot(norm, cliRoots);
}
