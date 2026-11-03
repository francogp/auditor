/**
 * packages/auditor/tests/oxlint_vue_reactivity_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_vue_reactivity & validate_reactive_purity into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing the custom sub-auditors
 * with native Oxlint and @francogp/domain-type plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - 'vue/no-side-effects-in-computed-properties' is 'error'.
 *    - 'vue/no-async-in-computed-properties' is 'error'.
 *    - '@francogp/domain-type/watch-reactive-property-getter' is 'error'.
 *    - '@francogp/domain-type/no-destructured-reactive' is 'error'.
 * 2. Diagnostic & Finding Mapping:
 *    - Oxlint violations for Vue reactivity map to severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - watch-reactive-property-getter catches raw props access in watch()
 *    - no-destructured-reactive catches destructuring reactive() without toRefs()
 * 4. Architectural Discovery Verification:
 *    - validate_vue_reactivity and validate_reactive_purity are completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { OxlintAuditor, parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Vue Reactivity & Purity Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares vue/no-side-effects-in-computed-properties as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['vue/no-side-effects-in-computed-properties']).toBe(
        'error'
      );
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares vue/no-async-in-computed-properties as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['vue/no-async-in-computed-properties']).toBe('error');
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares @francogp/domain-type/watch-reactive-property-getter as error', () => {
      expect(
        DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/watch-reactive-property-getter']
      ).toBe('error');
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares @francogp/domain-type/no-destructured-reactive as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-destructured-reactive']).toBe(
        'error'
      );
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps vue/no-side-effects-in-computed-properties into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Unexpected side effect in "fullName" computed property.',
            code: 'vue/no-side-effects-in-computed-properties',
            severity: 'error',
            filename: 'src/components/UserProfile.vue',
            labels: [{ span: { line: 18, column: 5 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 153
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/components/UserProfile.vue');
      expect(findings[0]?.context).toBe('vue/no-side-effects-in-computed-properties');
    });

    it('CANARY: maps vue/no-async-in-computed-properties into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Unexpected async function in "userStats" computed property.',
            code: 'vue/no-async-in-computed-properties',
            severity: 'error',
            filename: 'src/components/Dashboard.vue',
            labels: [{ span: { line: 30, column: 5 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 153
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/components/Dashboard.vue');
      expect(findings[0]?.context).toBe('vue/no-async-in-computed-properties');
    });

    it('CANARY: maps watch-reactive-property-getter into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message:
              'Direct observation of props property in watch(). Use a getter function watch(() => props.property, ...) to preserve reactivity.',
            code: '@francogp/domain-type(watch-reactive-property-getter)',
            severity: 'error',
            filename: 'src/components/Detail.vue',
            labels: [{ span: { line: 15, column: 3 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 153
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/components/Detail.vue');
      expect(findings[0]?.context).toBe('@francogp/domain-type(watch-reactive-property-getter)');
    });

    it('CANARY: maps no-destructured-reactive into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message:
              'Direct destructuring of reactive() is prohibited without toRefs(). Wrap object with toRefs() to preserve reactivity.',
            code: '@francogp/domain-type(no-destructured-reactive)',
            severity: 'error',
            filename: 'src/composables/useCounter.ts',
            labels: [{ span: { line: 8, column: 9 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 153
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/composables/useCounter.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-destructured-reactive)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: domainTypeOxlintPlugin provides watch-reactive-property-getter and no-destructured-reactive', () => {
      const rules = domainTypeOxlintPlugin.rules;
      expect(rules['watch-reactive-property-getter']).toBeDefined();
      expect(rules['no-destructured-reactive']).toBeDefined();
    });

    it('CANARY: watch-reactive-property-getter reports violation when watching props.foo directly', () => {
      const rule = domainTypeOxlintPlugin.rules['watch-reactive-property-getter'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      // Simulate watch(props.foo, ...)
      visitor.CallExpression?.({
        callee: { name: 'watch' },
        arguments: [
          {
            type: 'MemberExpression',
            object: { type: 'Identifier', name: 'props' }
          }
        ]
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-destructured-reactive reports violation when destructuring reactive() directly', () => {
      const rule = domainTypeOxlintPlugin.rules['no-destructured-reactive'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      // Simulate const { count } = reactive({ count: 0 })
      visitor.VariableDeclarator?.({
        id: { type: 'ObjectPattern' },
        init: {
          type: 'CallExpression',
          callee: { name: 'reactive' }
        }
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Dynamic Subauditor Retirement & Discovery Verification', () => {
    it('CANARY: discoverAuditors no longer discovers validate_vue_reactivity or validate_reactive_purity', async () => {
      const discovered = await discoverAuditors();
      const ids = discovered.map((d) => d.id);

      expect(ids).not.toContain('validate_vue_reactivity');
      expect(ids).not.toContain('validate_reactive_purity');
      expect(ids).toContain('validate_oxlint');
    });

    it('CANARY: OxlintAuditor covers code hygiene in phase hygiene', () => {
      const auditor = new OxlintAuditor();
      expect(auditor.id).toBe('validate_oxlint');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toContain('oxlint-violation');
    });
  });
});
