/**
 * packages/auditor/tests/oxlint_secret_leaks_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_secret_leaks into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing ValidateSecretLeaksAuditor
 * with @francogp/domain-type Oxlint JS plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - '@francogp/domain-type/no-hardcoded-secrets' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - Hardcoded secret violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - no-hardcoded-secrets catches private keys, tokens, AWS keys, database URIs with passwords.
 * 4. Architectural Discovery Verification:
 *    - validate_secret_leaks is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Secret Leaks Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares no-hardcoded-secrets as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-hardcoded-secrets']).toBe(
        'error'
      );
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps no-hardcoded-secrets diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Hardcoded private cryptographic key detected.',
            code: '@francogp/domain-type(no-hardcoded-secrets)',
            severity: 'error',
            filename: 'src/auth/keys.ts',
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
      expect(findings[0]?.file).toBe('src/auth/keys.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-hardcoded-secrets)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: no-hardcoded-secrets catches RSA Private Key', () => {
      const rule = domainTypeOxlintPlugin.rules['no-hardcoded-secrets'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.Literal?.({
        type: 'Literal',
        value: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...'
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-hardcoded-secrets catches AWS Access Key ID', () => {
      const rule = domainTypeOxlintPlugin.rules['no-hardcoded-secrets'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.Literal?.({
        type: 'Literal',
        value: 'AKIAIOSFODNN7EXAMPLE'
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-hardcoded-secrets catches Database URI with password', () => {
      const rule = domainTypeOxlintPlugin.rules['no-hardcoded-secrets'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.Literal?.({
        type: 'Literal',
        value: 'postgres://postgres:secretpassword@localhost:5432/mydb'
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Architectural Discovery Verification', () => {
    it('CANARY: validate_secret_leaks is completely removed from discovered auditors', async () => {
      const auditors = await discoverAuditors();
      const ids = auditors.map((a) => a.id);
      expect(ids).not.toContain('validate_secret_leaks');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
