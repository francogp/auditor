/**
 * packages/auditor/tests/oxlint_ephemeral_storage_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_ephemeral_storage_isolation into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing EphemeralStorageIsolationAuditor
 * with @francogp/domain-type Oxlint JS plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - '@francogp/domain-type/ephemeral-no-source-temp-references' is 'error'
 *    - '@francogp/domain-type/no-raw-local-storage' is 'error'
 *    - '@francogp/domain-type/no-raw-session-storage' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - Ephemeral storage violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - ephemeral-no-source-temp-references catches src/temp references.
 *    - no-raw-local-storage catches localStorage.getItem / setItem.
 *    - no-raw-session-storage catches sessionStorage.getItem / setItem.
 * 4. Architectural Discovery Verification:
 *    - validate_ephemeral_storage_isolation is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Ephemeral Storage Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares ephemeral storage rules as error', () => {
      expect(
        DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/ephemeral-no-source-temp-references']
      ).toBe('error');
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-raw-local-storage']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-raw-session-storage']).toBe(
        'error'
      );
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps ephemeral-no-source-temp-references diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Forbidden reference to ephemeral path inside source code tree.',
            code: '@francogp/domain-type(ephemeral-no-source-temp-references)',
            severity: 'error',
            filename: 'src/utils/tempStorage.ts',
            labels: [{ span: { line: 15, column: 1 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/utils/tempStorage.ts');
      expect(findings[0]?.context).toBe(
        '@francogp/domain-type(ephemeral-no-source-temp-references)'
      );
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: ephemeral-no-source-temp-references catches src/temp literal', () => {
      const rule = domainTypeOxlintPlugin.rules['ephemeral-no-source-temp-references'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.Literal?.({
        type: 'Literal',
        value: 'src/temp/database.sqlite'
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-raw-local-storage catches localStorage.getItem', () => {
      const rule = domainTypeOxlintPlugin.rules['no-raw-local-storage'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.MemberExpression?.({
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'localStorage' },
        property: { type: 'Identifier', name: 'getItem' }
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-raw-session-storage catches sessionStorage.setItem', () => {
      const rule = domainTypeOxlintPlugin.rules['no-raw-session-storage'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.MemberExpression?.({
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'sessionStorage' },
        property: { type: 'Identifier', name: 'setItem' }
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Architectural Discovery Verification', () => {
    it('CANARY: validate_ephemeral_storage_isolation is completely removed from discovered auditors', async () => {
      const auditors = await discoverAuditors();
      const ids = auditors.map((a) => a.id);
      expect(ids).not.toContain('validate_ephemeral_storage_isolation');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
