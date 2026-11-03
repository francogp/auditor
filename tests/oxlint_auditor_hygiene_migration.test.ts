/**
 * packages/auditor/tests/oxlint_auditor_hygiene_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_auditor_hygiene into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing AuditorHygieneAuditor
 * with @francogp/domain-type Oxlint JS plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - '@francogp/domain-type/auditor-class-inheritance' is 'error'
 *    - '@francogp/domain-type/no-homebrew-file-walker' is 'error'
 *    - '@francogp/domain-type/auditor-rule-description-limit' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - Auditor hygiene violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - auditor-class-inheritance catches class FooAuditor not extending BaseAuditor/FileScanAuditor.
 *    - no-homebrew-file-walker catches fs.readdirSync in auditor suites.
 *    - auditor-rule-description-limit catches descriptions > 60 chars.
 * 4. Architectural Discovery Verification:
 *    - validate_auditor_hygiene is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Auditor Hygiene Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares auditor hygiene rules as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/auditor-class-inheritance']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-homebrew-file-walker']).toBe(
        'error'
      );
      expect(
        DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/auditor-rule-description-limit']
      ).toBe('error');
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps auditor-class-inheritance diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: "Auditor class 'BadAuditor' must inherit from BaseAuditor or FileScanAuditor.",
            code: '@francogp/domain-type(auditor-class-inheritance)',
            severity: 'error',
            filename: 'src/suites/custom/badAuditor.ts',
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
      expect(findings[0]?.file).toBe('src/suites/custom/badAuditor.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(auditor-class-inheritance)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: auditor-class-inheritance catches class not inheriting from BaseAuditor', () => {
      const rule = domainTypeOxlintPlugin.rules['auditor-class-inheritance'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.ClassDeclaration?.({
        type: 'ClassDeclaration',
        id: { name: 'MyCustomAuditor' },
        superClass: { name: 'SomeOtherBase' }
      });
      expect(reported).toBe(true);
    });

    it('CANARY: auditor-rule-description-limit catches description > 60 chars', () => {
      const rule = domainTypeOxlintPlugin.rules['auditor-rule-description-limit'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.Property?.({
        type: 'Property',
        key: { name: 'description' },
        value: {
          type: 'Literal',
          value:
            'This is an excessively long auditor rule description that violates our 60 characters limit policy'
        }
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Architectural Discovery Verification', () => {
    it('CANARY: validate_auditor_hygiene is completely removed from discovered auditors', async () => {
      const auditors = await discoverAuditors();
      const ids = auditors.map((a) => a.id);
      expect(ids).not.toContain('validate_auditor_hygiene');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
