/**
 * packages/auditor/tests/oxlint_audit_headers_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_audit_headers into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing ValidateAuditHeadersAuditor
 * with @francogp/domain-type Oxlint JS plugin rules and native ESLint comments:
 *
 * 1. Default Canonical Rules:
 *    - '@francogp/domain-type/no-file-level-suppressions' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - File suppression violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - no-file-level-suppressions catches eslint-disable, fallow-ignore-file, @ts-nocheck in headers.
 * 4. Architectural Discovery Verification:
 *    - validate_audit_headers is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Audit Headers Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares no-file-level-suppressions as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-file-level-suppressions']).toBe(
        'error'
      );
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps no-file-level-suppressions diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'File-level suppression header detected.',
            code: '@francogp/domain-type(no-file-level-suppressions)',
            severity: 'error',
            filename: 'src/legacy/utils.ts',
            labels: [{ span: { line: 1, column: 1 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/legacy/utils.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-file-level-suppressions)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: no-file-level-suppressions catches /* eslint-disable */ header', () => {
      const rule = domainTypeOxlintPlugin.rules['no-file-level-suppressions'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        },
        getSourceCode: () => ({
          getText: () => '/* eslint-disable */\nexport const x = 1;'
        })
      });

      visitor.Program?.({ type: 'Program' });
      expect(reported).toBe(true);
    });

    it('CANARY: no-file-level-suppressions catches // @ts-nocheck header', () => {
      const rule = domainTypeOxlintPlugin.rules['no-file-level-suppressions'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        },
        getSourceCode: () => ({
          getText: () => '// @ts-nocheck\nexport const y = 2;'
        })
      });

      visitor.Program?.({ type: 'Program' });
      expect(reported).toBe(true);
    });
  });

  describe('4. Architectural Discovery Verification', () => {
    it('CANARY: validate_audit_headers is completely removed from discovered auditors', async () => {
      const auditors = await discoverAuditors();
      const ids = auditors.map((a) => a.id);
      expect(ids).not.toContain('validate_audit_headers');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
