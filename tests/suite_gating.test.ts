/**
 * tests/suite_gating.test.ts
 *
 * Unit tests for suite activation gating and CLI introspection flags.
 */

import { describe, it, expect } from 'vitest';
import { evaluateSuiteStatus, AUDIT_LIST_FILTERS } from '../src/core/suiteGating.ts';
import type { AuditConfig } from '../src/core/auditConfigTypes.ts';

describe('suiteGating — evaluateSuiteStatus', () => {
  const baseConfig: AuditConfig = {
    name: 'test-app',
    paths: {
      srcRoots: ['src'],
      testRoots: ['tests'],
      e2eRoots: ['e2e'],
      integrationRoots: ['integration'],
      migrationsDir: 'migrations',
      scriptsRoots: ['scripts'],
      codeRoots: ['src']
    },
    persistence: {
      engine: 'none',
      schemaQualified: false
    },
    domain: {
      enabled: true
    }
  };

  it('declares canonical AUDIT_LIST_FILTERS under /domain-type-first', () => {
    expect(AUDIT_LIST_FILTERS).toEqual(['all', 'enabled', 'disabled']);
  });

  it('evaluates suite as enabled when no disabling flag is present', () => {
    const status = evaluateSuiteStatus('validate_domain_types', baseConfig);
    expect(status.enabled).toBe(true);
    expect(status.reason).toBeUndefined();
  });

  it('detects domain.enabled: false and reports disabled with reason', () => {
    const config: AuditConfig = {
      ...baseConfig,
      domain: { enabled: false }
    };
    const status = evaluateSuiteStatus('validate_domain_types', config);
    expect(status.enabled).toBe(false);
    expect(status.reason).toContain('domain.enabled = false');
    expect(status.configKey).toBe('domain.enabled');
  });

  it('detects bundle.enabled: false for validate_bundle_budget and audit_bundle', () => {
    const config: AuditConfig = {
      ...baseConfig,
      bundle: { enabled: false }
    };
    const statusBudget = evaluateSuiteStatus('validate_bundle_budget', config);
    expect(statusBudget.enabled).toBe(false);
    expect(statusBudget.configKey).toBe('bundle.enabled');

    const statusBundle = evaluateSuiteStatus('audit_bundle', config);
    expect(statusBundle.enabled).toBe(false);
  });

  it('detects fallow.enabled: false for validate_fallow', () => {
    const config: AuditConfig = {
      ...baseConfig,
      fallow: { enabled: false }
    };
    const status = evaluateSuiteStatus('validate_fallow', config);
    expect(status.enabled).toBe(false);
    expect(status.configKey).toBe('fallow.enabled');
  });

  it('detects accessibility.enabled: false and templates.requireInputIds: false', () => {
    const configA11y: AuditConfig = {
      ...baseConfig,
      accessibility: { enabled: false }
    };
    const statusA11y = evaluateSuiteStatus('validate_accessibility', configA11y);
    expect(statusA11y.enabled).toBe(false);
    expect(statusA11y.configKey).toBe('accessibility.enabled');

    const configTemplates: AuditConfig = {
      ...baseConfig,
      templates: { requireInputIds: false }
    };
    const statusTemplates = evaluateSuiteStatus('validate_template_ids', configTemplates);
    expect(statusTemplates.enabled).toBe(false);
    expect(statusTemplates.configKey).toBe('templates.requireInputIds');
  });

  it('detects styles.zLayersEnabled: false for validate_z_index', () => {
    const config: AuditConfig = {
      ...baseConfig,
      styles: { zLayersEnabled: false }
    };
    const status = evaluateSuiteStatus('validate_z_index', config);
    expect(status.enabled).toBe(false);
    expect(status.configKey).toBe('styles.zLayersEnabled');
  });

  it('detects packageDistribution.enabled: false and packageHygiene.enabled: false', () => {
    const configDist: AuditConfig = {
      ...baseConfig,
      packageDistribution: { enabled: false }
    };
    const statusDist = evaluateSuiteStatus('validate_package_distribution', configDist);
    expect(statusDist.enabled).toBe(false);

    const configHygiene: AuditConfig = {
      ...baseConfig,
      packageHygiene: { enabled: false }
    };
    const statusHygiene = evaluateSuiteStatus('validate_package_hygiene', configHygiene);
    expect(statusHygiene.enabled).toBe(false);
    expect(statusHygiene.configKey).toBe('packageHygiene.enabled');
  });

  it('detects testCoverage.enabled: false or enforceInAudit: false', () => {
    const configDisabled: AuditConfig = {
      ...baseConfig,
      testCoverage: { enabled: false }
    };
    const statusDisabled = evaluateSuiteStatus('validate_test_coverage', configDisabled);
    expect(statusDisabled.enabled).toBe(false);

    const configNotEnforced: AuditConfig = {
      ...baseConfig,
      testCoverage: { enabled: true, enforceInAudit: false }
    };
    const statusNotEnforced = evaluateSuiteStatus('validate_test_coverage', configNotEnforced);
    expect(statusNotEnforced.enabled).toBe(false);
  });

  it('detects fallow.similarCode.enabled: false for validate_similar_code', () => {
    const configDisabled: AuditConfig = {
      ...baseConfig,
      fallow: { similarCode: { enabled: false } }
    };
    const statusDisabled = evaluateSuiteStatus('validate_similar_code', configDisabled);
    expect(statusDisabled.enabled).toBe(false);
    expect(statusDisabled.configKey).toBe('fallow.similarCode.enabled');
  });
});
