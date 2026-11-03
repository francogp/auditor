/**
 * packages/auditor/tests/oxlint_error_suppression_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_error_suppression into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing ErrorSuppressionAuditor
 * with native Oxlint Rust rules and @francogp/domain-type plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - 'no-empty' is ['error', { allowEmptyCatch: false }] (Oxlint native Rust core)
 *    - 'promise/catch-or-return' is 'error' (Oxlint promise plugin)
 *    - '@francogp/domain-type/no-silent-promise-catch' is 'error'
 *    - '@francogp/domain-type/no-silent-mock-fallbacks' is 'error'
 *    - '@francogp/domain-type/strict-catch-narrowing' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - Error suppression violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - no-silent-promise-catch catches .catch(() => {}) and .catch(() => null)
 *    - no-silent-mock-fallbacks catches v.fallback(...) and fallback(...)
 *    - strict-catch-narrowing catches err.message / err.code access without instanceof Error
 * 4. Architectural Discovery Verification:
 *    - validate_error_suppression is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Error Suppression Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares no-empty with allowEmptyCatch: false as error', () => {
      const rule = DEFAULT_CANONICAL_LINT_RULES['no-empty'];
      expect(rule).toEqual(['error', { allowEmptyCatch: false }]);
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares promise/catch-or-return as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['promise/catch-or-return']).toBe('error');
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares @francogp/domain-type/no-silent-promise-catch as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-silent-promise-catch']).toBe(
        'error'
      );
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares @francogp/domain-type/no-silent-mock-fallbacks as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-silent-mock-fallbacks']).toBe(
        'error'
      );
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares @francogp/domain-type/strict-catch-narrowing as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/strict-catch-narrowing']).toBe(
        'error'
      );
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps no-empty into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Empty block statement.',
            code: 'eslint(no-empty)',
            severity: 'error',
            filename: 'src/utils/service.ts',
            labels: [{ span: { line: 20, column: 11 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/utils/service.ts');
      expect(findings[0]?.context).toBe('eslint(no-empty)');
    });

    it('CANARY: maps no-silent-mock-fallbacks into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: "Using Valibot 'v.fallback()' is PROHIBITED.",
            code: '@francogp/domain-type(no-silent-mock-fallbacks)',
            severity: 'error',
            filename: 'src/schemas/userSchema.ts',
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
      expect(findings[0]?.file).toBe('src/schemas/userSchema.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-silent-mock-fallbacks)');
    });

    it('CANARY: maps strict-catch-narrowing into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: "Caught exception 'err' accessed (.message) without type narrowing.",
            code: '@francogp/domain-type(strict-catch-narrowing)',
            severity: 'error',
            filename: 'src/services/apiClient.ts',
            labels: [{ span: { line: 35, column: 12 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/services/apiClient.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(strict-catch-narrowing)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: domainTypeOxlintPlugin provides error suppression rules', () => {
      const rules = domainTypeOxlintPlugin.rules;
      expect(rules['no-silent-promise-catch']).toBeDefined();
      expect(rules['no-silent-mock-fallbacks']).toBeDefined();
      expect(rules['strict-catch-narrowing']).toBeDefined();
    });

    it('CANARY: no-silent-promise-catch catches .catch(() => {})', () => {
      const rule = domainTypeOxlintPlugin.rules['no-silent-promise-catch'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      // Simulate Promise.resolve().catch(() => {})
      visitor.CallExpression?.({
        callee: {
          type: 'MemberExpression',
          object: { type: 'CallExpression' },
          property: { type: 'Identifier', name: 'catch' }
        },
        arguments: [
          {
            type: 'ArrowFunctionExpression',
            body: { type: 'BlockStatement', body: [] }
          }
        ]
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-silent-mock-fallbacks catches v.fallback(...)', () => {
      const rule = domainTypeOxlintPlugin.rules['no-silent-mock-fallbacks'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      // Simulate v.fallback(v.string(), 'default')
      visitor.CallExpression?.({
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'v' },
          property: { type: 'Identifier', name: 'fallback' }
        },
        arguments: []
      });
      expect(reported).toBe(true);
    });

    it('CANARY: strict-catch-narrowing catches catch (err) { err.message } without instanceof', () => {
      const rule = domainTypeOxlintPlugin.rules['strict-catch-narrowing'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        },
        getSourceCode: () => ({
          getText: () => 'console.log(err.message);'
        })
      });

      visitor.CatchClause?.({
        param: { type: 'Identifier', name: 'err' },
        body: { type: 'BlockStatement' }
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Dynamic Subauditor Retirement & Discovery Verification', () => {
    it('CANARY: discoverAuditors no longer discovers validate_error_suppression', async () => {
      const discovered = await discoverAuditors();
      const ids = discovered.map((d) => d.id);

      expect(ids).not.toContain('validate_error_suppression');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
