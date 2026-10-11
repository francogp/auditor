/**
 * packages/auditor/src/core/auditTestPredicates.ts
 *
 * Test and spec path detection predicates driven by audit.config.ts.
 */

import { getAuditConfig } from './auditConfigLoader.ts';
import { matchesAnyRoot } from './auditRootMatcher.ts';
import { normalizePosixPath } from './reportUtils.ts';

const TEST_FILE_REGEX = /\.(?:test|spec)\./;

function hasTestFileExtensionOrPattern(base: string, customPatterns: readonly string[]): boolean {
  if (TEST_FILE_REGEX.test(base)) {
    return true;
  }
  return customPatterns.some(pat => base.includes(pat.toLowerCase()));
}

function matchesConfiguredOrFallbackTestRoots(norm: string, configuredRoots: readonly string[]): boolean {
  if (matchesAnyRoot(norm, configuredRoots)) {
    return true;
  }
  const isFallbackRoot = norm.startsWith('tests/') || norm.includes('/tests/');
  return configuredRoots.length === 0 && isFallbackRoot;
}


/**
 * Determines whether a file path belongs to a test, spec, mock, or e2e directory
 * driven dynamically by the project's audit.config.ts configuration.
 */
export function isTestPath(filePath: string): boolean {
  if (!filePath) return false;
  const norm = normalizePosixPath(filePath).toLowerCase();
  const base = norm.split('/').pop() || '';

  const config = getAuditConfig();
  const customTestPatterns = config?.paths?.testFilePatterns ?? [];
  if (hasTestFileExtensionOrPattern(base, customTestPatterns)) {
    return true;
  }

  const configuredRoots = [
    ...(config.paths.testRoots ?? []),
    ...(config.paths.e2eRoots ?? []),
    ...(config.paths.integrationRoots ?? [])
  ];

  return matchesConfiguredOrFallbackTestRoots(norm, configuredRoots);
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
