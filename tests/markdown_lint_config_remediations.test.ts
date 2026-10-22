/**
 * tests/markdown_lint_config_remediations.test.ts
 *
 * Validates that validate_markdown_lint_config conforms strictly to the
 * BaseAuditor contracts:
 * 1. configKey is 'documentation'.
 * 2. defaultConfig has explicit enabled: true.
 * 3. 100% of ruleRemediations contain the 4 canonical sections (Causa Raíz, Diagnóstico, Solución Canónica, Ejemplo/Auto-fix).
 * 4. 100% of rules map to strategic remediation phases.
 * 5. 100% of rules declare valid 7-field AuditorRuleCapabilities.
 */

import { describe, it, expect } from 'vite-plus/test';

import {
  ValidateMarkdownLintConfigAuditor,
  MARKDOWNLINT_CONFIG_RULES
} from '../src/suites/documentation/validate_markdown_lint_config.ts';

describe('validate_markdown_lint_config contract and remediation conformance', () => {
  it('declares canonical configKey: documentation and defaultConfig.enabled: true', () => {
    const auditor = new ValidateMarkdownLintConfigAuditor();
    expect(auditor.configKey).toBe('documentation');
    expect(auditor.defaultConfig.enabled).toBe(true);
  });

  it('declares 4-section canonical ruleRemediations for all rules', () => {
    const auditor = new ValidateMarkdownLintConfigAuditor();
    for (const ruleId of MARKDOWNLINT_CONFIG_RULES) {
      const guide = auditor.getRuleRemediation(ruleId);
      expect(guide).toBeDefined();
      expect(guide).toMatch(/Root Cause|Causa Raíz/i);
      expect(guide).toMatch(/Diagnosis|Diagnóstico/i);
      expect(guide).toMatch(/Canonical Solution|Solución Canónica/i);
      expect(guide).toMatch(/Example|Ejemplo|Auto-fix/i);
    }
  });

  it('declares valid rule descriptions for all rules', () => {
    const auditor = new ValidateMarkdownLintConfigAuditor();
    for (const ruleId of MARKDOWNLINT_CONFIG_RULES) {
      const desc = auditor.ruleDescriptions[ruleId];
      expect(desc).toBeDefined();
      expect(desc.length).toBeGreaterThan(10);
    }
  });

  it('maps all rules to canonical strategic remediation phases', () => {
    const auditor = new ValidateMarkdownLintConfigAuditor();
    for (const ruleId of MARKDOWNLINT_CONFIG_RULES) {
      const phase = auditor.ruleRemediationPhases[ruleId];
      expect(phase).toBeDefined();
      expect(['setup', 'prune', 'dedup', 'contracts', 'behavior', 'hygiene', 'polish']).toContain(
        phase
      );
    }
  });

  it('declares explicit 7-field AuditorRuleCapabilities for all rules', () => {
    const auditor = new ValidateMarkdownLintConfigAuditor();
    for (const ruleId of MARKDOWNLINT_CONFIG_RULES) {
      const caps = auditor.ruleCapabilities[ruleId];
      expect(caps).toBeDefined();
      expect(caps?.speed).toBeDefined();
      expect(caps?.phase).toBeDefined();
      expect(caps?.fix).toBeDefined();
      expect(typeof caps?.md).toBe('boolean');
      expect(typeof caps?.ast).toBe('boolean');
      expect(typeof caps?.changedOnly).toBe('boolean');
      expect(typeof caps?.critical).toBe('boolean');
    }
  });
});
