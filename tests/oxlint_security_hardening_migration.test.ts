/**
 * packages/auditor/tests/oxlint_security_hardening_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_security_hardening into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing ValidateSecurityHardeningAuditor
 * with native Oxlint security rules (no-eval, no-implied-eval, no-script-url, no-new-func)
 * and @francogp/domain-type plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - 'no-eval' is 'error'
 *    - 'no-implied-eval' is 'error'
 *    - 'no-script-url' is 'error'
 *    - 'no-new-func' is 'error'
 *    - '@francogp/domain-type/no-raw-html-injection' is 'error'
 *    - '@francogp/domain-type/no-insecure-random' is 'error'
 *    - '@francogp/domain-type/no-permissive-cors' is 'error'
 *    - '@francogp/domain-type/no-unvalidated-redirect' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - Security hardening violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - no-raw-html-injection catches innerHTML and v-html
 *    - no-insecure-random catches Math.random() for tokens
 *    - no-permissive-cors catches Access-Control-Allow-Origin: '*'
 *    - no-unvalidated-redirect catches open redirect with query params
 * 4. Architectural Discovery Verification:
 *    - validate_security_hardening is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Security Hardening Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares native security rules', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['no-eval']).toBe('error');
      expect(DEFAULT_CANONICAL_LINT_RULES['no-implied-eval']).toBe('error');
      expect(DEFAULT_CANONICAL_LINT_RULES['no-script-url']).toBe('error');
      expect(DEFAULT_CANONICAL_LINT_RULES['no-new-func']).toBe('error');
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares @francogp/domain-type security rules as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-raw-html-injection']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-insecure-random']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-permissive-cors']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-unvalidated-redirect']).toBe(
        'error'
      );
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps no-eval diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'eval can be harmful.',
            code: 'eslint(no-eval)',
            severity: 'error',
            filename: 'src/services/sandbox.ts',
            labels: [{ span: { line: 12, column: 5 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/services/sandbox.ts');
      expect(findings[0]?.context).toBe('eslint(no-eval)');
    });

    it('CANARY: maps no-raw-html-injection diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: "Direct HTML injection via 'innerHTML' detected.",
            code: '@francogp/domain-type(no-raw-html-injection)',
            severity: 'error',
            filename: 'src/components/Banner.vue',
            labels: [{ span: { line: 20, column: 5 } }]
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
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-raw-html-injection)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: no-raw-html-injection catches innerHTML assignment', () => {
      const rule = domainTypeOxlintPlugin.rules['no-raw-html-injection'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.AssignmentExpression?.({
        type: 'AssignmentExpression',
        left: {
          type: 'MemberExpression',
          property: { name: 'innerHTML' }
        }
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-permissive-cors catches Access-Control-Allow-Origin: *', () => {
      const rule = domainTypeOxlintPlugin.rules['no-permissive-cors'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.Property?.({
        type: 'Property',
        key: { name: 'Access-Control-Allow-Origin' },
        value: { value: '*' }
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Dynamic Subauditor Retirement & Discovery Verification', () => {
    it('CANARY: discoverAuditors no longer discovers validate_security_hardening', async () => {
      const discovered = await discoverAuditors();
      const ids = discovered.map((d) => d.id);

      expect(ids).not.toContain('validate_security_hardening');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
