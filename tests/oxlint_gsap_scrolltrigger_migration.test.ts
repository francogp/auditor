/**
 * packages/auditor/tests/oxlint_gsap_scrolltrigger_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_gsap_scrolltrigger into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing ValidateGsapScrollTriggerAuditor
 * with @francogp/domain-type Oxlint JS plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - '@francogp/domain-type/no-nested-scrolltrigger' is 'error'
 *    - '@francogp/domain-type/no-scrolltrigger-markers-production' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - ScrollTrigger violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - no-nested-scrolltrigger catches scrollTrigger in timeline child tweens.
 *    - no-scrolltrigger-markers-production catches markers: true.
 * 4. Architectural Discovery Verification:
 *    - validate_gsap_scrolltrigger is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint GSAP ScrollTrigger Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares ScrollTrigger rules as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-nested-scrolltrigger']).toBe(
        'error'
      );
      expect(
        DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-scrolltrigger-markers-production']
      ).toBe('error');
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps no-nested-scrolltrigger diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Nested scrollTrigger in timeline child tween detected.',
            code: '@francogp/domain-type(no-nested-scrolltrigger)',
            severity: 'error',
            filename: 'src/animations/hero.ts',
            labels: [{ span: { line: 18, column: 5 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/animations/hero.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-nested-scrolltrigger)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: no-nested-scrolltrigger catches scrollTrigger inside tl.to()', () => {
      const rule = domainTypeOxlintPlugin.rules['no-nested-scrolltrigger'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.Property?.({
        type: 'Property',
        key: { name: 'scrollTrigger' },
        parent: {
          type: 'ObjectExpression',
          parent: {
            type: 'CallExpression',
            callee: {
              type: 'MemberExpression',
              object: { name: 'tl' },
              property: { name: 'to' }
            }
          }
        }
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-scrolltrigger-markers-production catches markers: true', () => {
      const rule = domainTypeOxlintPlugin.rules['no-scrolltrigger-markers-production'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.Property?.({
        type: 'Property',
        key: { name: 'markers' },
        value: { value: true }
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Architectural Discovery Verification', () => {
    it('CANARY: validate_gsap_scrolltrigger is completely removed from discovered auditors', async () => {
      const auditors = await discoverAuditors();
      const ids = auditors.map((a) => a.id);
      expect(ids).not.toContain('validate_gsap_scrolltrigger');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
