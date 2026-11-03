/**
 * packages/auditor/tests/oxlint_constant_hygiene_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_constant_hygiene into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing ValidateConstantHygieneAuditor
 * with @francogp/domain-type Oxlint JS plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - '@francogp/domain-type/no-redundant-constant-alias' is 'error'
 *    - '@francogp/domain-type/no-literal-suffix-constant' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - Constant hygiene violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - no-redundant-constant-alias catches const A = B
 *    - no-literal-suffix-constant catches CONST_100
 * 4. Architectural Discovery Verification:
 *    - validate_constant_hygiene is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Constant Hygiene Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares constant hygiene rules as error', () => {
      expect(
        DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-redundant-constant-alias']
      ).toBe('error');
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-literal-suffix-constant']).toBe(
        'error'
      );
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps no-redundant-constant-alias diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: "Redundant 1:1 constant alias 'const A = B' detected.",
            code: '@francogp/domain-type(no-redundant-constant-alias)',
            severity: 'error',
            filename: 'src/constants/keys.ts',
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
      expect(findings[0]?.file).toBe('src/constants/keys.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-redundant-constant-alias)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: no-redundant-constant-alias catches const A = B', () => {
      const rule = domainTypeOxlintPlugin.rules['no-redundant-constant-alias'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.VariableDeclarator?.({
        type: 'VariableDeclarator',
        id: { type: 'Identifier', name: 'COLOR_PRIMARY' },
        init: { type: 'Identifier', name: 'COLOR_BLUE' }
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-literal-suffix-constant catches CONST_100', () => {
      const rule = domainTypeOxlintPlugin.rules['no-literal-suffix-constant'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.VariableDeclarator?.({
        type: 'VariableDeclarator',
        id: { type: 'Identifier', name: 'FONT_WEIGHT_400' }
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Dynamic Subauditor Retirement & Discovery Verification', () => {
    it('CANARY: discoverAuditors no longer discovers validate_constant_hygiene', async () => {
      const discovered = await discoverAuditors();
      const ids = discovered.map((d) => d.id);

      expect(ids).not.toContain('validate_constant_hygiene');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
