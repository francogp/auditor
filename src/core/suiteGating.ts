/**
 * packages/auditor/src/core/suiteGating.ts
 *
 * Single Source of Truth for suite activation and configuration gating.
 * Evaluates whether an audit suite is enabled or disabled in the project's
 * audit configuration, providing transparent skip reasons and CLI introspection.
 */

import type { AuditConfig } from './auditConfigTypes.ts';
import { AUDIT_LIST_FILTERS, type AuditListFilter } from './auditConfigTypes.ts';

export { AUDIT_LIST_FILTERS, type AuditListFilter };

export interface SuiteGatingStatus {
  readonly enabled: boolean;
  readonly reason?: string;
  readonly configKey?: string;
}

interface SuiteGatingSpec {
  readonly configKey: string;
  readonly reason: string;
  readonly path: readonly [string, string];
}

function isSimilarEnvSkipped(): boolean {
  const v = process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS ?? process.env.AUDIT_SKIP_SIMILAR;
  return v === '1' || v === 'true';
}

function checkSimilarCodeGating(config: AuditConfig): SuiteGatingStatus {
  if (isSimilarEnvSkipped()) {
    return {
      enabled: false,
      reason: 'Omitido por variable de entorno AUDIT_SKIP_SIMILAR',
      configKey: 'env:AUDIT_SKIP_SIMILAR'
    };
  }
  if (config.fallow?.similarCode?.enabled === false) {
    return {
      enabled: false,
      reason: 'Desactivado en config (fallow.similarCode.enabled = false)',
      configKey: 'fallow.similarCode.enabled'
    };
  }
  return { enabled: true };
}

function checkSpecialGating(suiteId: string, config: AuditConfig): SuiteGatingStatus | null {
  if (suiteId === 'validate_similar_code') {
    return checkSimilarCodeGating(config);
  }
  if (suiteId === 'validate_stylelint' && (config.stylelint?.enabled === false || config.styles?.stylelint?.enabled === false)) {
    return {
      enabled: false,
      reason: 'Desactivado en config (stylelint.enabled = false)',
      configKey: 'stylelint.enabled'
    };
  }
  if (suiteId === 'validate_test_coverage' && (config.testCoverage?.enabled === false || !config.testCoverage?.enforceInAudit)) {
    return {
      enabled: false,
      reason: 'Desactivado en config (testCoverage no habilitado o enforceInAudit = false)',
      configKey: 'testCoverage.enforceInAudit'
    };
  }
  return null;
}

const SIMPLE_GATING_SPECS: Record<string, SuiteGatingSpec> = {
  validate_domain_types: {
    configKey: 'domain.enabled',
    reason: 'Desactivado en config (domain.enabled = false)',
    path: ['domain', 'enabled']
  },
  audit_bundle: {
    configKey: 'bundle.enabled',
    reason: 'Desactivado en config (bundle.enabled = false)',
    path: ['bundle', 'enabled']
  },
  validate_bundle_budget: {
    configKey: 'bundle.enabled',
    reason: 'Desactivado en config (bundle.enabled = false)',
    path: ['bundle', 'enabled']
  },
  validate_fallow: {
    configKey: 'fallow.enabled',
    reason: 'Desactivado en config (fallow.enabled = false)',
    path: ['fallow', 'enabled']
  },
  validate_html_validate: {
    configKey: 'htmlValidate.enabled',
    reason: 'Desactivado en config (htmlValidate.enabled = false)',
    path: ['htmlValidate', 'enabled']
  },
  validate_accessibility: {
    configKey: 'accessibility.enabled',
    reason: 'Desactivado en config (accessibility.enabled = false)',
    path: ['accessibility', 'enabled']
  },
  validate_template_ids: {
    configKey: 'templates.requireInputIds',
    reason: 'Desactivado en config (templates.requireInputIds = false)',
    path: ['templates', 'requireInputIds']
  },
  validate_z_index: {
    configKey: 'styles.zLayersEnabled',
    reason: 'Desactivado en config (styles.zLayersEnabled = false)',
    path: ['styles', 'zLayersEnabled']
  },
  validate_package_distribution: {
    configKey: 'packageDistribution.enabled',
    reason: 'Desactivado en config (packageDistribution.enabled = false)',
    path: ['packageDistribution', 'enabled']
  },
  validate_package_hygiene: {
    configKey: 'packageHygiene.enabled',
    reason: 'Desactivado en config (packageHygiene.enabled = false)',
    path: ['packageHygiene', 'enabled']
  },
  validate_type_coverage: {
    configKey: 'typeCoverage.enabled',
    reason: 'Desactivado en config (typeCoverage.enabled = false)',
    path: ['typeCoverage', 'enabled']
  },
  validate_agent_plugin: {
    configKey: 'agentPlugin.enabled',
    reason: 'Desactivado en config (agentPlugin.enabled = false)',
    path: ['agentPlugin', 'enabled']
  }
};

function checkSimpleGating(spec: SuiteGatingSpec, config: AuditConfig): boolean {
  const [section, prop] = spec.path;
  const sectionObj = config[section as keyof AuditConfig] as Record<string, unknown> | undefined; // open-record: Dynamic config section traversal
  return sectionObj?.[prop] === false;
}

export function evaluateSuiteStatus(suiteId: string, config: AuditConfig): SuiteGatingStatus {
  const special = checkSpecialGating(suiteId, config);
  if (special) {
    return special;
  }
  const spec = SIMPLE_GATING_SPECS[suiteId];
  if (spec && checkSimpleGating(spec, config)) {
    return { enabled: false, reason: spec.reason, configKey: spec.configKey };
  }
  return { enabled: true };
}
