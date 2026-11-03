/**
 * packages/auditor/tests/oxlint_persistence_client_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_persistence_client into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing ValidatePersistenceClientAuditor
 * with @francogp/domain-type Oxlint JS plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - '@francogp/domain-type/no-direct-database-instantiation' is 'error'
 *    - '@francogp/domain-type/require-storage-try-catch' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - Persistence client violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - no-direct-database-instantiation catches raw new Client / Pool / PrismaClient.
 *    - require-storage-try-catch catches localStorage.setItem outside try/catch.
 * 4. Architectural Discovery Verification:
 *    - validate_persistence_client is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Persistence Client Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares persistence client rules as error', () => {
      expect(
        DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-direct-database-instantiation']
      ).toBe('error');
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/require-storage-try-catch']).toBe(
        'error'
      );
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps no-direct-database-instantiation diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: "Direct database client instantiation 'Pool' detected.",
            code: '@francogp/domain-type(no-direct-database-instantiation)',
            severity: 'error',
            filename: 'src/services/db.ts',
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
      expect(findings[0]?.file).toBe('src/services/db.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-direct-database-instantiation)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: no-direct-database-instantiation catches new PrismaClient', () => {
      const rule = domainTypeOxlintPlugin.rules['no-direct-database-instantiation'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.NewExpression?.({
        type: 'NewExpression',
        callee: { type: 'Identifier', name: 'PrismaClient' }
      });
      expect(reported).toBe(true);
    });

    it('CANARY: require-storage-try-catch catches localStorage.setItem outside try/catch', () => {
      const rule = domainTypeOxlintPlugin.rules['require-storage-try-catch'];
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
          object: { type: 'Identifier', name: 'localStorage' },
          property: { type: 'Identifier', name: 'setItem' }
        },
        parent: { type: 'ExpressionStatement' }
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Architectural Discovery Verification', () => {
    it('CANARY: validate_persistence_client is completely removed from discovered auditors', async () => {
      const auditors = await discoverAuditors();
      const ids = auditors.map((a) => a.id);
      expect(ids).not.toContain('validate_persistence_client');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
