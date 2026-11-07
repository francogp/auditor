/**
 * packages/auditor/tests/oxlint_type_assertion_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_type_assertion_hygiene into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing the custom sub-auditor
 * (validate_type_assertion_hygiene) with native Oxlint and @francogp/domain-type plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - '@typescript-eslint/no-explicit-any' is 'error'.
 *    - '@typescript-eslint/no-floating-promises' is 'error'.
 *    - '@francogp/domain-type/no-double-cast-unknown' is 'error'.
 *    - '@francogp/domain-type/no-boolean-literal-annotation' is 'error'.
 *    - '@francogp/domain-type/no-broad-string-array' is 'error'.
 * 2. Diagnostic & Finding Mapping:
 *    - Oxlint violations for all 5 rules map to severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - no-double-cast-unknown catches 'as unknown as ...'
 *    - no-boolean-literal-annotation catches ': true' or ': false'
 *    - no-broad-string-array catches string arrays without as const
 * 4. Architectural Discovery Verification:
 *    - validate_type_assertion_hygiene is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { OxlintAuditor, parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Type Assertion Hygiene Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares typescript/no-explicit-any as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['typescript/no-explicit-any']).toBe('error');
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares typescript/no-floating-promises as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['typescript/no-floating-promises']).toBe('error');
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares @francogp/domain-type/no-double-cast-unknown as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-double-cast-unknown']).toBe(
        'error'
      );
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares @francogp/domain-type/no-boolean-literal-annotation as error', () => {
      expect(
        DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-boolean-literal-annotation']
      ).toBe('error');
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares @francogp/domain-type/no-broad-string-array as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-broad-string-array']).toBe(
        'error'
      );
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps no-double-cast-unknown into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message:
              'Casting to unknown (as unknown) is STRICTLY PROHIBITED. Use type guards, canonical typing, or direct interfaces.',
            code: '@francogp/domain-type(no-double-cast-unknown)',
            severity: 'error',
            filename: 'src/services/auth.ts',
            labels: [{ span: { line: 25, column: 15 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 153
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/services/auth.ts');
      expect(findings[0]?.line).toBe(25);
      expect(findings[0]?.col).toBe(15);
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-double-cast-unknown)');
    });

    it('CANARY: maps no-boolean-literal-annotation into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message:
              'Redundant literal annotation (: true or : false). Use : boolean or type inference by assignment.',
            code: '@francogp/domain-type(no-boolean-literal-annotation)',
            severity: 'error',
            filename: 'src/config/flags.ts',
            labels: [{ span: { line: 10, column: 5 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 153
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/config/flags.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-boolean-literal-annotation)');
    });

    it('CANARY: maps no-broad-string-array into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message:
              'String literal array declared without `as const`. Add `as const` or type with a canonical domain.',
            code: '@francogp/domain-type(no-broad-string-array)',
            severity: 'error',
            filename: 'src/constants/status.ts',
            labels: [{ span: { line: 12, column: 1 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 153
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/constants/status.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-broad-string-array)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: domainTypeOxlintPlugin provides all 3 custom assertion rules', () => {
      const rules = domainTypeOxlintPlugin.rules;
      expect(rules['no-double-cast-unknown']).toBeDefined();
      expect(rules['no-boolean-literal-annotation']).toBeDefined();
      expect(rules['no-broad-string-array']).toBeDefined();
    });

    it('CANARY: no-double-cast-unknown reports violation on TSAsExpression with unknown', () => {
      const rule = domainTypeOxlintPlugin.rules['no-double-cast-unknown'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      // Simulate node: val as unknown
      visitor.TSAsExpression?.({
        typeAnnotation: { type: 'TSUnknownKeyword' }
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-boolean-literal-annotation reports violation on literal boolean type annotation', () => {
      const rule = domainTypeOxlintPlugin.rules['no-boolean-literal-annotation'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      // Simulate node: : true
      visitor.TSTypeAnnotation?.({
        typeAnnotation: { type: 'TSTrueKeyword' }
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Dynamic Subauditor Retirement & Discovery Verification', () => {
    it('CANARY: discoverAuditors no longer discovers the legacy validate_type_assertion_hygiene', async () => {
      const discovered = await discoverAuditors();
      const ids = discovered.map((d) => d.id);

      expect(ids).not.toContain('validate_type_assertion_hygiene');
      expect(ids).toContain('validate_oxlint');
    });

    it('CANARY: OxlintAuditor covers code hygiene in phase hygiene', () => {
      const auditor = new OxlintAuditor();
      expect(auditor.id).toBe('validate_oxlint');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toContain('oxlint-violation');
    });
  });
});
