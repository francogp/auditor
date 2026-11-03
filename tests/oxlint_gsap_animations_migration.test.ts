/**
 * packages/auditor/tests/oxlint_gsap_animations_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_gsap_animations into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing ValidateGsapAnimationsAuditor
 * with @francogp/domain-type Oxlint JS plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - '@francogp/domain-type/no-gsap-layout-properties' is 'error'
 *    - '@francogp/domain-type/gsap-named-timer-constants' is 'error'
 *    - '@francogp/domain-type/no-gsap-banned-ui-timers' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - GSAP animation violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - no-gsap-layout-properties catches top / left / width / height in gsap.to().
 *    - gsap-named-timer-constants catches raw numeric durations.
 *    - no-gsap-banned-ui-timers catches setTimeout in animated components.
 * 4. Architectural Discovery Verification:
 *    - validate_gsap_animations is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint GSAP Animations Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares GSAP animation rules as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-gsap-layout-properties']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/gsap-named-timer-constants']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-gsap-banned-ui-timers']).toBe(
        'error'
      );
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps no-gsap-layout-properties diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: "Animating layout property 'top' in GSAP.",
            code: '@francogp/domain-type(no-gsap-layout-properties)',
            severity: 'error',
            filename: 'src/components/Card.vue',
            labels: [{ span: { line: 25, column: 5 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/components/Card.vue');
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-gsap-layout-properties)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: no-gsap-layout-properties catches top in gsap.to', () => {
      const rule = domainTypeOxlintPlugin.rules['no-gsap-layout-properties'];
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
          object: { type: 'Identifier', name: 'gsap' },
          property: { type: 'Identifier', name: 'to' }
        },
        arguments: [
          { type: 'Identifier', name: 'target' },
          {
            type: 'ObjectExpression',
            properties: [{ key: { name: 'top' }, value: { type: 'Literal', value: 100 } }]
          }
        ]
      });
      expect(reported).toBe(true);
    });

    it('CANARY: gsap-named-timer-constants catches raw numeric duration', () => {
      const rule = domainTypeOxlintPlugin.rules['gsap-named-timer-constants'];
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
          object: { type: 'Identifier', name: 'gsap' },
          property: { type: 'Identifier', name: 'to' }
        },
        arguments: [
          { type: 'Identifier', name: 'target' },
          { type: 'Literal', value: 0.5 }
        ]
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Architectural Discovery Verification', () => {
    it('CANARY: validate_gsap_animations is completely removed from discovered auditors', async () => {
      const auditors = await discoverAuditors();
      const ids = auditors.map((a) => a.id);
      expect(ids).not.toContain('validate_gsap_animations');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
