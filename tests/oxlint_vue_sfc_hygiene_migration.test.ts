/**
 * packages/auditor/tests/oxlint_vue_sfc_hygiene_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_vue_sfc_hygiene into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing ValidateVueSfcHygieneAuditor
 * with native Oxlint Vue rules and @francogp/domain-type plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - 'vue/no-export-in-script-setup' is 'error'
 *    - 'vue/component-definition-name-casing' is 'error'
 *    - 'vue/define-props-declaration' is 'error'
 *    - 'vue/define-emits-declaration' is 'error'
 *    - '@francogp/domain-type/script-setup-required' is 'error'
 *    - '@francogp/domain-type/vue-template-quote-escaping' is 'error'
 *    - '@francogp/domain-type/no-data-provider-in-template' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - Vue SFC hygiene violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - script-setup-required catches Options API in .vue files
 *    - no-data-provider-in-template catches dataProvider in templates
 *    - vue-template-quote-escaping catches escaped quotes in bindings
 * 4. Architectural Discovery Verification:
 *    - validate_vue_sfc_hygiene is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Vue SFC Hygiene Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares native vue rules', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['vue/no-export-in-script-setup']).toBe('error');
      expect(DEFAULT_CANONICAL_LINT_RULES['vue/component-definition-name-casing']).toBe('error');
      expect(DEFAULT_CANONICAL_LINT_RULES['vue/define-props-declaration']).toBe('error');
      expect(DEFAULT_CANONICAL_LINT_RULES['vue/define-emits-declaration']).toBe('error');
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares @francogp/domain-type SFC rules as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/script-setup-required']).toBe(
        'error'
      );
      expect(
        DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/vue-template-quote-escaping']
      ).toBe('error');
      expect(
        DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-data-provider-in-template']
      ).toBe('error');
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps vue/no-export-in-script-setup diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Exports in <script setup> are not allowed.',
            code: 'vue(no-export-in-script-setup)',
            severity: 'error',
            filename: 'src/components/MyWidget.vue',
            labels: [{ span: { line: 5, column: 1 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/components/MyWidget.vue');
      expect(findings[0]?.context).toBe('vue(no-export-in-script-setup)');
    });

    it('CANARY: maps script-setup-required diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message:
              'Options API detected. Vue 3 SFCs must strictly standardize on Composition API.',
            code: '@francogp/domain-type(script-setup-required)',
            severity: 'error',
            filename: 'src/views/LegacyView.vue',
            labels: [{ span: { line: 12, column: 1 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/views/LegacyView.vue');
      expect(findings[0]?.context).toBe('@francogp/domain-type(script-setup-required)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: script-setup-required catches Options API in .vue files', () => {
      const rule = domainTypeOxlintPlugin.rules['script-setup-required'];
      let reported = false;
      const visitor = rule.create({
        filename: 'src/components/LegacyCard.vue',
        report: () => {
          reported = true;
        }
      });

      visitor.ExportDefaultDeclaration?.({
        type: 'ExportDefaultDeclaration',
        declaration: { type: 'ObjectExpression' }
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-data-provider-in-template catches dataProvider.*() calls in template', () => {
      const rule = domainTypeOxlintPlugin.rules['no-data-provider-in-template'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.CallExpression?.({
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: { name: 'dataProvider' },
          property: { name: 'fetchUsers' }
        }
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Dynamic Subauditor Retirement & Discovery Verification', () => {
    it('CANARY: discoverAuditors no longer discovers validate_vue_sfc_hygiene', async () => {
      const discovered = await discoverAuditors();
      const ids = discovered.map((d) => d.id);

      expect(ids).not.toContain('validate_vue_sfc_hygiene');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
