/**
 * src/core/exemptionPolicies.ts
 *
 * EXEMPTION POLICY REGISTRY (Node.js 26+ Native)
 * Single registry of every path-based policy that silences rules for a set of files.
 * `validate_audit_coverage` replays these policies over every tracked file to report
 * DEGRADED coverage: files that are scanned but have rules silenced by configuration.
 *
 * - `configured` policies depend on host configuration and degrade coverage unless acknowledged
 *   through `coverage.acknowledgedDegradations`.
 * - `structural` policies are framework design (e.g. tests are not production code) and only
 *   appear in the coverage map for transparency.
 */

import {
  ACKNOWLEDGEABLE_EXEMPTION_POLICIES,
  getAuditConfig,
  isCliPath,
  isDataPath,
  isDemoPath,
  isExemptFile,
  isScriptPath,
  isTestPath,
  type AuditEngineConfig
} from './auditConfig.ts';

export const STRUCTURAL_EXEMPTION_POLICIES = ['test'] as const;
export const EXEMPTION_POLICY_IDS = [
  ...ACKNOWLEDGEABLE_EXEMPTION_POLICIES,
  ...STRUCTURAL_EXEMPTION_POLICIES
] as const;
export type ExemptionPolicyId = (typeof EXEMPTION_POLICY_IDS)[number];

export const EXEMPTION_POLICY_KINDS = ['configured', 'structural'] as const;
export type ExemptionPolicyKind = (typeof EXEMPTION_POLICY_KINDS)[number];

export interface ExemptionPolicy {
  readonly id: ExemptionPolicyId;
  readonly kind: ExemptionPolicyKind;
  /** Configuration key that drives the policy (shown to the developer). */
  readonly configKey: string;
  /** What gets silenced for matching files (Spanish, terminal-facing). */
  readonly silences: string;
  readonly matches: (relPosixPath: string, config: AuditEngineConfig) => boolean;
}

export function isCodeFile(relPosixPath: string): boolean {
  return /\.(?:ts|tsx|js|jsx|mjs|cjs|vue)$/i.test(relPosixPath);
}

export const EXEMPTION_POLICIES: readonly ExemptionPolicy[] = [
  {
    id: 'cli',
    kind: 'configured',
    configKey: 'paths.cliRoots',
    silences: 'console, CWE security, and production rules',
    matches: (p, config) => isCodeFile(p) && isCliPath(p, config)
  },
  {
    id: 'scripts',
    kind: 'configured',
    configKey: 'paths.scriptsRoots',
    silences: 'console, duplicate constants, and production rules',
    matches: (p, config) => isCodeFile(p) && isScriptPath(p, config)
  },
  {
    id: 'data',
    kind: 'configured',
    configKey: 'paths.dataRoots',
    silences: 'complexity, LOC, and magic numbers',
    matches: (p) => isCodeFile(p) && isDataPath(p)
  },
  {
    id: 'demo',
    kind: 'configured',
    configKey: 'paths.demoRoots',
    silences: 'complexity, LOC, and magic numbers',
    matches: (p) => isCodeFile(p) && isDemoPath(p)
  },
  {
    id: 'exemptFiles',
    kind: 'configured',
    configKey: 'paths.exemptFiles',
    silences: 'domain, date, and timezone rules',
    matches: (p, config) => isCodeFile(p) && isExemptFile(p, config)
  },
  {
    id: 'test',
    kind: 'structural',
    configKey: 'paths.testRoots',
    silences: 'production code rules',
    matches: (p) => isCodeFile(p) && isTestPath(p)
  }
];

/** Every policy matching the given file, in registry order. */
export function getMatchingExemptionPolicies(
  relPosixPath: string,
  config: AuditEngineConfig = getAuditConfig()
): ExemptionPolicy[] {
  return EXEMPTION_POLICIES.filter((policy) => policy.matches(relPosixPath, config));
}
