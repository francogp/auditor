/**
 * packages/auditor/src/core/auditTestPredicates.ts
 *
 * Test and spec path detection predicates driven by audit.config.ts.
 */

import { getAuditConfig } from './auditConfigLoader.ts';
import { matchesAnyRoot } from './auditRootMatcher.ts';
import { normalizePosixPath } from './reportUtils.ts';

/**
 * Determines whether a file path belongs to a test, spec, mock, or e2e directory
 * driven dynamically by the project's audit.config.ts configuration.
 */
export function isTestPath(filePath: string): boolean {
  if (!filePath) return false;
  const norm = normalizePosixPath(filePath).toLowerCase();
  const base = norm.split('/').pop() || '';

  if (base.includes('.test.') || base.includes('.spec.')) {
    return true;
  }

  const config = getAuditConfig();
  const customTestPatterns = config?.paths?.testFilePatterns ?? [];
  if (customTestPatterns.some(pat => base.includes(pat.toLowerCase()))) {
    return true;
  }

  const configuredRoots = [
    ...(config.paths.testRoots ?? []),
    ...(config.paths.e2eRoots ?? []),
    ...(config.paths.integrationRoots ?? [])
  ];

  if (matchesAnyRoot(norm, configuredRoots)) {
    return true;
  }

  return configuredRoots.length === 0 && (norm.startsWith('tests/') || norm.includes('/tests/'));
}

/**
 * Determines whether a file path is a test file that should be skipped during source code audits,
 * honoring config.paths.includeTestsInCodeAudit.
 */
export function isTestFileForCodeAudit(filePath: string, projectRoot?: string): boolean {
  const config = getAuditConfig(projectRoot);
  if (config?.paths?.includeTestsInCodeAudit) return false;
  return isTestPath(filePath);
}
