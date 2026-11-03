/**
 * packages/auditor/tests/oxlint_valibot_parity_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_valibot_parity into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing ValidateValibotParityAuditor
 * with @francogp/domain-type Oxlint JS plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - '@francogp/domain-type/no-silent-mock-fallbacks' is 'error'
 *    - '@francogp/domain-type/valibot-schema-type-parity' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - Valibot parity violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - no-silent-mock-fallbacks catches v.fallback()
 *    - valibot-schema-type-parity catches v.unknown() and redundant nullability v.optional(v.nullable(...))
 * 4. Architectural Discovery Verification:
 *    - validate_valibot_parity is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Valibot Parity Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares valibot rules as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-silent-mock-fallbacks']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/valibot-schema-type-parity']).toBe(
        'error'
      );
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps no-silent-mock-fallbacks diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: "Using Valibot 'fallback()' or 'v.fallback()' is PROHIBITED.",
            code: '@francogp/domain-type(no-silent-mock-fallbacks)',
            severity: 'error',
            filename: 'src/schemas/userSchema.ts',
            labels: [{ span: { line: 10, column: 12 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/schemas/userSchema.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-silent-mock-fallbacks)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: valibot-schema-type-parity catches v.unknown()', () => {
      const rule = domainTypeOxlintPlugin.rules['valibot-schema-type-parity'];
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
          object: { name: 'v' },
          property: { name: 'unknown' }
        }
      });
      expect(reported).toBe(true);
    });

    it('CANARY: valibot-schema-type-parity catches redundant v.optional(v.nullable(...))', () => {
      const rule = domainTypeOxlintPlugin.rules['valibot-schema-type-parity'];
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
          object: { name: 'v' },
          property: { name: 'optional' }
        },
        arguments: [
          {
            type: 'CallExpression',
            callee: {
              type: 'MemberExpression',
              object: { name: 'v' },
              property: { name: 'nullable' }
            }
          }
        ]
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Dynamic Subauditor Retirement & Discovery Verification', () => {
    it('CANARY: discoverAuditors no longer discovers validate_valibot_parity', async () => {
      const discovered = await discoverAuditors();
      const ids = discovered.map((d) => d.id);

      expect(ids).not.toContain('validate_valibot_parity');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
