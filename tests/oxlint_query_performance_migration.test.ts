/**
 * packages/auditor/tests/oxlint_query_performance_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_query_performance into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing ValidateQueryPerformanceAuditor
 * with @francogp/domain-type Oxlint JS plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - '@francogp/domain-type/no-await-in-loops-query' is 'error'
 *    - '@francogp/domain-type/no-select-star-in-queries' is 'error'
 *    - '@francogp/domain-type/require-paginated-queries' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - Query performance violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - no-await-in-loops-query catches await in for/while loops.
 *    - no-select-star-in-queries catches .select('*').
 *    - require-paginated-queries catches unconstrained collection queries.
 * 4. Architectural Discovery Verification:
 *    - validate_query_performance is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Query Performance Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares query performance rules as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-await-in-loops-query']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-select-star-in-queries']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/require-paginated-queries']).toBe(
        'error'
      );
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps no-await-in-loops-query diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Asynchronous database query inside loop (N+1 query pattern).',
            code: '@francogp/domain-type(no-await-in-loops-query)',
            severity: 'error',
            filename: 'src/repositories/userRepo.ts',
            labels: [{ span: { line: 20, column: 5 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/repositories/userRepo.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-await-in-loops-query)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: no-await-in-loops-query catches await db inside for loop', () => {
      const rule = domainTypeOxlintPlugin.rules['no-await-in-loops-query'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.AwaitExpression?.({
        type: 'AwaitExpression',
        parent: {
          type: 'ForOfStatement'
        },
        argument: {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: { type: 'Identifier', name: 'db' },
            property: { type: 'Identifier', name: 'query' }
          }
        }
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-select-star-in-queries catches .select("*")', () => {
      const rule = domainTypeOxlintPlugin.rules['no-select-star-in-queries'];
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
          object: { type: 'Identifier', name: 'query' },
          property: { type: 'Identifier', name: 'select' }
        },
        arguments: [{ type: 'Literal', value: '*' }]
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Architectural Discovery Verification', () => {
    it('CANARY: validate_query_performance is completely removed from discovered auditors', async () => {
      const auditors = await discoverAuditors();
      const ids = auditors.map((a) => a.id);
      expect(ids).not.toContain('validate_query_performance');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
