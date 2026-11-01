/**
 * packages/auditor/src/core/auditConfigUi.ts
 *
 * UI and tooling subsystem declaration validators for audit configurations.
 * Enforces active-by-default configuration invariants for styles, templates, fallow, and runner subsystems.
 */

import { type AuditEngineConfig, FALLOW_TARGET_PRIORITIES } from './auditConfigTypes.ts';
import { createDomainSet } from './domainCollections.ts';

const FALLOW_TARGET_PRIORITIES_SET = createDomainSet(FALLOW_TARGET_PRIORITIES);

export function checkUiSubsystems(config: AuditEngineConfig): readonly string[] {
  const missing: string[] = [];
  if (typeof config.styles?.zLayersEnabled !== 'boolean') {
    missing.push("  - 'styles': Field 'zLayersEnabled' must be boolean (true or false).");
  }
  if (typeof config.templates?.requireInputIds !== 'boolean') {
    missing.push("  - 'templates': Field 'requireInputIds' must be boolean (true or false).");
  }
  if (typeof config.agentPlugin?.enabled !== 'boolean') {
    missing.push("  - 'agentPlugin': Field 'enabled' must be boolean (true or false).");
  }
  if (config.gitSafety?.enabled !== undefined && typeof config.gitSafety.enabled !== 'boolean') {
    missing.push("  - 'gitSafety': Field 'enabled' must be boolean (true or false).");
  }
  if (config.fallow?.maxTargetPriority !== undefined) {
    const val = config.fallow.maxTargetPriority;
    const isValidString = typeof val === 'string' && FALLOW_TARGET_PRIORITIES_SET.has(val);
    const isValidNumber = typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= 100;
    if (!isValidString && !isValidNumber) {
      missing.push(
        `  - 'fallow': Invalid target priority ('${val}'). Must be a number (0-100) or one of: ${FALLOW_TARGET_PRIORITIES.join(' | ')}.`
      );
    }
  }
  if (config.runner?.maxStalenessMinutes !== undefined && config.runner.maxStalenessMinutes <= 0) {
    missing.push("  - 'runner': 'maxStalenessMinutes' must be a positive number greater than 0.");
  }
  return missing;
}
