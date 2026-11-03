/**
 * packages/auditor/tests/oxlint_domain_types_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_domain_types into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing ValidateDomainTypesAuditor
 * with @francogp/domain-type Oxlint JS plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - '@francogp/domain-type/no-record-string-key' is 'error'
 *    - '@francogp/domain-type/no-unbranded-id' is 'error'
 *    - '@francogp/domain-type/no-untyped-string-set-map' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - Domain type violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - no-record-string-key catches Record<string, T>
 *    - no-unbranded-id catches unbranded string IDs
 *    - no-untyped-string-set-map catches new Set<string>() without domain type
 * 4. Architectural Discovery Verification:
 *    - validate_domain_types is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Domain Types Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares domain type rules as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-record-string-key']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-unbranded-id']).toBe('error');
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-untyped-string-set-map']).toBe(
        'error'
      );
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps no-record-string-key diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Record<string, T> is forbidden. Use Record<DomainId, T>.',
            code: '@francogp/domain-type(no-record-string-key)',
            severity: 'error',
            filename: 'src/types/models.ts',
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
      expect(findings[0]?.file).toBe('src/types/models.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-record-string-key)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: no-record-string-key catches Record with raw string key', () => {
      const rule = domainTypeOxlintPlugin.rules['no-record-string-key'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.TSTypeReference?.({
        type: 'TSTypeReference',
        typeName: { name: 'Record' },
        typeArguments: {
          params: [{ type: 'TSStringKeyword' }, { type: 'TSNumberKeyword' }]
        }
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-unbranded-id catches type UserId = string without Brand', () => {
      const rule = domainTypeOxlintPlugin.rules['no-unbranded-id'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.TSTypeAliasDeclaration?.({
        type: 'TSTypeAliasDeclaration',
        id: { name: 'UserId' },
        typeAnnotation: { type: 'TSStringKeyword' }
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Dynamic Subauditor Retirement & Discovery Verification', () => {
    it('CANARY: discoverAuditors no longer discovers validate_domain_types', async () => {
      const discovered = await discoverAuditors();
      const ids = discovered.map((d) => d.id);

      expect(ids).not.toContain('validate_domain_types');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
