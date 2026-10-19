/**
 * packages/auditor/src/core/auditPathPredicates.ts
 *
 * Path categorization predicates, root matchers, and Z-Layers resolution helpers.
 */

import { getAuditConfig } from './auditConfigLoader.ts';
import { matchesAnyRoot } from './auditRootMatcher.ts';

/**
 * Determines whether a file path belongs to a data catalog directory (e.g. static game data,
 * catalogs, domain fixtures) configured in paths.dataRoots.
 */
export function isDataPath(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  const dataRoots = config?.paths?.dataRoots ?? ['src/data'];

  return matchesAnyRoot(norm, dataRoots);
}

/**
 * Determines whether a file path belongs to a demo/showcase/mock directory
 * configured in paths.demoRoots.
 */
export function isDemoPath(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  const demoRoots = config?.paths?.demoRoots ?? [];

  return matchesAnyRoot(norm, demoRoots);
}

/**
 * Checks whether a file path belongs to an explicitly exempt file in paths.exemptFiles.
 */
export function isExemptFile(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  const exemptFiles = config?.paths?.exemptFiles ?? [];
  return exemptFiles.some((f) => {
    const clean = f.replace(/^\/+|\/+$/g, '').toLowerCase();
    return norm === clean || norm.endsWith('/' + clean);
  });
}

export * from './auditCodeRoots.ts';
export * from './auditRootMatcher.ts';
export * from './auditTestPredicates.ts';
export * from './auditProjectIdentity.ts';
export * from './auditZLayers.ts';
