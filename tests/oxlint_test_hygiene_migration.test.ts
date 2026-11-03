/**
 * packages/auditor/tests/oxlint_test_hygiene_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_test_hygiene into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing TestHygieneAuditor
 * with native Oxlint Vitest rules and @francogp/domain-type plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - 'vitest/no-focused-tests' is 'error'
 *    - 'vitest/no-disabled-tests' is 'error'
 *    - 'vitest/no-identical-title' is 'error'
 *    - 'vitest/expect-expect' is 'error'
 *    - '@francogp/domain-type/no-tautological-integration-mocks' is 'error'
 *    - '@francogp/domain-type/playwright-id-locators-only' is 'error'
 *    - '@francogp/domain-type/no-playwright-force-click' is 'error'
 *    - '@francogp/domain-type/no-test-timeout-inflation' is 'error'
 *    - '@francogp/domain-type/no-playwright-polling-waits' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - Test hygiene violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - no-playwright-force-click catches .click({ force: true })
 *    - no-playwright-polling-waits catches page.waitForTimeout(...)
 *    - no-test-timeout-inflation catches timeouts >= 30000ms
 *    - playwright-id-locators-only catches text-based locators
 *    - no-tautological-integration-mocks catches vi.mock of core database engines
 * 4. Architectural Discovery Verification:
 *    - validate_test_hygiene is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Test Hygiene Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares vitest/expect-expect as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['vitest/expect-expect']).toBe('error');
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares vitest/no-focused-tests and no-disabled-tests as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['vitest/no-focused-tests']).toBe('error');
      expect(DEFAULT_CANONICAL_LINT_RULES['vitest/no-disabled-tests']).toBe('error');
      expect(DEFAULT_CANONICAL_LINT_RULES['vitest/no-identical-title']).toBe('error');
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares @francogp/domain-type test hygiene rules as error', () => {
      expect(
        DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-tautological-integration-mocks']
      ).toBe('error');
      expect(
        DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/playwright-id-locators-only']
      ).toBe('error');
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-playwright-force-click']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-test-timeout-inflation']).toBe(
        'error'
      );
      expect(
        DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-playwright-polling-waits']
      ).toBe('error');
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps vitest/expect-expect diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Test has no assertions.',
            code: 'vitest(expect-expect)',
            severity: 'error',
            filename: 'tests/unit/calculator.test.ts',
            labels: [{ span: { line: 10, column: 5 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('tests/unit/calculator.test.ts');
      expect(findings[0]?.context).toBe('vitest(expect-expect)');
    });

    it('CANARY: maps no-playwright-force-click diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Force click ({ force: true }) detected in E2E simulation.',
            code: '@francogp/domain-type(no-playwright-force-click)',
            severity: 'error',
            filename: 'scripts/e2e/login.spec.ts',
            labels: [{ span: { line: 22, column: 9 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('scripts/e2e/login.spec.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-playwright-force-click)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: no-playwright-force-click catches .click({ force: true })', () => {
      const rule = domainTypeOxlintPlugin.rules['no-playwright-force-click'];
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
          property: { name: 'click' }
        },
        arguments: [
          {
            properties: [
              {
                key: { name: 'force' },
                value: { value: true }
              }
            ]
          }
        ]
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-playwright-polling-waits catches page.waitForTimeout(...)', () => {
      const rule = domainTypeOxlintPlugin.rules['no-playwright-polling-waits'];
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
          property: { name: 'waitForTimeout' }
        },
        arguments: [{ value: 5000 }]
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-test-timeout-inflation catches timeouts >= 30000ms', () => {
      const rule = domainTypeOxlintPlugin.rules['no-test-timeout-inflation'];
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
          property: { name: 'setTimeout' }
        },
        arguments: [{ value: 35000 }]
      });
      expect(reported).toBe(true);
    });

    it('CANARY: playwright-id-locators-only catches getByText locators', () => {
      const rule = domainTypeOxlintPlugin.rules['playwright-id-locators-only'];
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
          property: { name: 'getByText' }
        },
        arguments: [{ value: 'Submit Order' }]
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-tautological-integration-mocks catches vi.mock of core db as a pure AST visitor', () => {
      const rule = domainTypeOxlintPlugin.rules['no-tautological-integration-mocks'];
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
          object: { name: 'vi' },
          property: { name: 'mock' }
        },
        arguments: [{ value: '@/logic/db/supabase' }]
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Dynamic Subauditor Retirement & Discovery Verification', () => {
    it('CANARY: discoverAuditors no longer discovers validate_test_hygiene', async () => {
      const discovered = await discoverAuditors();
      const ids = discovered.map((d) => d.id);

      expect(ids).not.toContain('validate_test_hygiene');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
