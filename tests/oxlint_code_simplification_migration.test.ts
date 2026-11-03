/**
 * packages/auditor/tests/oxlint_code_simplification_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_code_simplification into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing ValidateCodeSimplificationAuditor
 * with native Oxlint rules (no-else-return, max-depth, no-useless-assignment, unicorn)
 * and @francogp/domain-type plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - 'no-else-return' is 'error'
 *    - 'max-depth' is ['error', 4]
 *    - 'no-useless-assignment' is 'error'
 *    - 'unicorn/prefer-ternary' is 'error'
 *    - 'unicorn/no-lonely-if' is 'error'
 *    - '@francogp/domain-type/no-boolean-trap-parameters' is 'error'
 *    - '@francogp/domain-type/no-massive-switch' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - Code simplification violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - no-boolean-trap-parameters catches multiple positional boolean arguments
 *    - no-massive-switch catches switch statements with > 10 cases
 * 4. Architectural Discovery Verification:
 *    - validate_code_simplification is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Code Simplification Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares native simplification rules', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['no-else-return']).toBe('error');
      expect(DEFAULT_CANONICAL_LINT_RULES['max-depth']).toEqual(['error', 4]);
      expect(DEFAULT_CANONICAL_LINT_RULES['no-useless-assignment']).toBe('error');
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares @francogp/domain-type simplification rules as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-boolean-trap-parameters']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-massive-switch']).toBe('error');
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps no-else-return diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Unnecessary else after return.',
            code: 'eslint(no-else-return)',
            severity: 'error',
            filename: 'src/utils/calculator.ts',
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
      expect(findings[0]?.file).toBe('src/utils/calculator.ts');
      expect(findings[0]?.context).toBe('eslint(no-else-return)');
    });

    it('CANARY: maps no-boolean-trap-parameters diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Positional boolean parameters detected.',
            code: '@francogp/domain-type(no-boolean-trap-parameters)',
            severity: 'error',
            filename: 'src/services/userService.ts',
            labels: [{ span: { line: 8, column: 1 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/services/userService.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-boolean-trap-parameters)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: no-boolean-trap-parameters catches multiple positional boolean arguments', () => {
      const rule = domainTypeOxlintPlugin.rules['no-boolean-trap-parameters'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.FunctionDeclaration?.({
        type: 'FunctionDeclaration',
        params: [
          { typeAnnotation: { type: 'TSBooleanKeyword' } },
          { typeAnnotation: { type: 'TSBooleanKeyword' } }
        ]
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-massive-switch catches switch statements with > 10 cases', () => {
      const rule = domainTypeOxlintPlugin.rules['no-massive-switch'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.SwitchStatement?.({
        type: 'SwitchStatement',
        cases: new Array(12).fill({})
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Dynamic Subauditor Retirement & Discovery Verification', () => {
    it('CANARY: discoverAuditors no longer discovers validate_code_simplification', async () => {
      const discovered = await discoverAuditors();
      const ids = discovered.map((d) => d.id);

      expect(ids).not.toContain('validate_code_simplification');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
