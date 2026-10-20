// test-fragmentation-ok: Isolated markdown lint config remediations test suite below 60 line threshold
/**
 * tests/markdown_lint_config_remediations.test.ts
 *
 * Validates that validate_markdown_lint_config conforms strictly to the
 * BaseAuditor contracts:
 * 1. configKey is 'documentation'.
 * 2. defaultConfig has explicit enabled: true.
 * 3. 100% of ruleRemediations contain the 4 canonical sections (Causa Raíz, Diagnóstico, Solución Canónica, Ejemplo/Auto-fix).
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
      expect(guide).toMatch(/Causa Raíz/i);
      expect(guide).toMatch(/Diagnóstico/i);
      expect(guide).toMatch(/Solución Canónica/i);
      expect(guide).toMatch(/Ejemplo|Auto-fix/i);
    }
  });
});
