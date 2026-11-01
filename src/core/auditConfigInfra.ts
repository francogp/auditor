/**
 * packages/auditor/src/core/auditConfigInfra.ts
 *
 * Infrastructure subsystem declaration validators for audit configurations.
 * Enforces active-by-default configuration invariants for persistence, bundle, and package governance.
 */

import {
  type AuditEngineConfig,
  PERSISTENCE_ENGINES,
  PACKAGE_DISTRIBUTION_LEVELS
} from './auditConfigTypes.ts';
import { createDomainSet } from './domainCollections.ts';

const PERSISTENCE_ENGINES_SET = createDomainSet(PERSISTENCE_ENGINES);
const PACKAGE_DISTRIBUTION_LEVELS_SET = createDomainSet(PACKAGE_DISTRIBUTION_LEVELS);

function checkPersistenceSubsystem(config: AuditEngineConfig): readonly string[] {
  const engine = config.persistence?.engine;
  if (!engine || !PERSISTENCE_ENGINES_SET.has(engine)) {
    const engineDisplay = String(engine ?? '');
    return [
      `  - 'persistence': Invalid persistence engine ('${engineDisplay}'). Must be one of: ${PERSISTENCE_ENGINES.join(' | ')}.`
    ];
  }
  return [];
}

function checkCoverageAndBundleSubsystem(config: AuditEngineConfig): readonly string[] {
  const missing: string[] = [];
  if (typeof config.bundle?.enabled !== 'boolean') {
    missing.push("  - 'bundle': Field 'enabled' must be boolean (true or false).");
  }
  if (typeof config.testCoverage?.enabled !== 'boolean') {
    missing.push("  - 'testCoverage': Field 'enabled' must be boolean (true or false).");
  }
  if (typeof config.testCoverage?.enforceInAudit !== 'boolean') {
    missing.push(
      "  - 'testCoverage': Field 'enforceInAudit' must be boolean (true or false). Default is true in all projects governed by @francogp/auditor."
    );
  }
  return missing;
}

function checkPackageGovernanceSubsystem(config: AuditEngineConfig): readonly string[] {
  const missing: string[] = [];
  const pkg = config.packageDistribution;
  if (typeof pkg?.enabled !== 'boolean') {
    missing.push("  - 'packageDistribution': Field 'enabled' must be boolean (true or false).");
  } else if (pkg.level && !PACKAGE_DISTRIBUTION_LEVELS_SET.has(pkg.level)) {
    const levelDisplay = String(pkg.level);
    missing.push(
      `  - 'packageDistribution': Invalid package distribution level ('${levelDisplay}'). Must be one of: ${PACKAGE_DISTRIBUTION_LEVELS.join(' | ')}.`
    );
  }
  const scripts = config.packageScripts;
  if (
    scripts?.recommendedScripts !== undefined &&
    typeof scripts.recommendedScripts !== 'boolean'
  ) {
    missing.push(
      "  - 'packageScripts': Field 'recommendedScripts' must be a strict boolean (true or false)."
    );
  }
  if (scripts?.enforceBuildAudit !== undefined && typeof scripts.enforceBuildAudit !== 'boolean') {
    missing.push(
      "  - 'packageScripts': Field 'enforceBuildAudit' must be a strict boolean (true or false)."
    );
  }
  const exts = config.scriptExtensions;
  if (exts?.enabled !== undefined && typeof exts.enabled !== 'boolean') {
    missing.push(
      "  - 'scriptExtensions': Field 'enabled' must be a strict boolean (true or false)."
    );
  }
  if (exts?.enforceTypeScript !== undefined && typeof exts.enforceTypeScript !== 'boolean') {
    missing.push(
      "  - 'scriptExtensions': Field 'enforceTypeScript' must be a strict boolean (true or false)."
    );
  }
  return missing;
}

export function checkInfrastructureSubsystems(config: AuditEngineConfig): readonly string[] {
  return [
    ...checkPersistenceSubsystem(config),
    ...checkCoverageAndBundleSubsystem(config),
    ...checkPackageGovernanceSubsystem(config)
  ];
}
