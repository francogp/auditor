/**
 * packages/auditor/tests/oxlint_gsap_framework_hygiene_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_gsap_framework_hygiene into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing ValidateGsapFrameworkHygieneAuditor
 * with @francogp/domain-type Oxlint JS plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - '@francogp/domain-type/require-gsap-cleanup-on-unmount' is 'error'
 *    - '@francogp/domain-type/no-unscoped-component-selectors' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - GSAP framework hygiene violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - require-gsap-cleanup-on-unmount catches gsap.context without revert.
 *    - no-unscoped-component-selectors catches naked string class selectors in SFC.
 * 4. Architectural Discovery Verification:
 *    - validate_gsap_framework_hygiene is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint GSAP Framework Hygiene Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares GSAP framework hygiene rules as error', () => {
      expect(
        DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/require-gsap-cleanup-on-unmount']
      ).toBe('error');
      expect(
        DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-unscoped-component-selectors']
      ).toBe('error');
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps require-gsap-cleanup-on-unmount diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'GSAP context created without revert() in lifecycle unmount.',
            code: '@francogp/domain-type(require-gsap-cleanup-on-unmount)',
            severity: 'error',
            filename: 'src/components/Banner.vue',
            labels: [{ span: { line: 15, column: 5 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/components/Banner.vue');
      expect(findings[0]?.context).toBe('@francogp/domain-type(require-gsap-cleanup-on-unmount)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: require-gsap-cleanup-on-unmount catches gsap.context without revert', () => {
      const rule = domainTypeOxlintPlugin.rules['require-gsap-cleanup-on-unmount'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        },
        getSourceCode: () => ({
          getText: () => 'const ctx = gsap.context(() => {});'
        })
      });

      visitor.CallExpression?.({
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'gsap' },
          property: { type: 'Identifier', name: 'context' }
        }
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-unscoped-component-selectors catches .box selector without scope', () => {
      const rule = domainTypeOxlintPlugin.rules['no-unscoped-component-selectors'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        },
        getSourceCode: () => ({
          getText: () => '<template><div class="box"></div></template>'
        })
      });

      visitor.CallExpression?.({
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'gsap' },
          property: { type: 'Identifier', name: 'to' }
        },
        arguments: [{ type: 'Literal', value: '.box' }, { type: 'ObjectExpression' }]
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Architectural Discovery Verification', () => {
    it('CANARY: validate_gsap_framework_hygiene is completely removed from discovered auditors', async () => {
      const auditors = await discoverAuditors();
      const ids = auditors.map((a) => a.id);
      expect(ids).not.toContain('validate_gsap_framework_hygiene');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
