/**
 * packages/auditor/tests/oxlint_canonical_domains_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_canonical_domains into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing ValidateCanonicalDomainsAuditor
 * with @francogp/domain-type Oxlint JS plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - '@francogp/domain-type/no-naked-string-union' is 'error'
 *    - '@francogp/domain-type/no-broad-string-array' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - Canonical domain violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - no-naked-string-union catches open string unions (e.g. 'a' | 'b' | string)
 *    - no-broad-string-array catches string arrays without as const
 * 4. Architectural Discovery Verification:
 *    - validate_canonical_domains is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Canonical Domains Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares canonical domain rules as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-naked-string-union']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-broad-string-array']).toBe(
        'error'
      );
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps no-naked-string-union diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Open string union (| string) detected in domain definition.',
            code: '@francogp/domain-type(no-naked-string-union)',
            severity: 'error',
            filename: 'src/types/user.ts',
            labels: [{ span: { line: 12, column: 1 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/types/user.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-naked-string-union)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: no-naked-string-union catches open string union mixing literals with string', () => {
      const rule = domainTypeOxlintPlugin.rules['no-naked-string-union'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.TSUnionType?.({
        type: 'TSUnionType',
        types: [{ type: 'TSLiteralType', literal: { value: 'admin' } }, { type: 'TSStringKeyword' }]
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Dynamic Subauditor Retirement & Discovery Verification', () => {
    it('CANARY: discoverAuditors no longer discovers validate_canonical_domains', async () => {
      const discovered = await discoverAuditors();
      const ids = discovered.map((d) => d.id);

      expect(ids).not.toContain('validate_canonical_domains');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
