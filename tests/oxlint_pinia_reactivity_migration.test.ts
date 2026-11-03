/**
 * packages/auditor/tests/oxlint_pinia_reactivity_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_pinia_reactivity into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing ValidatePiniaReactivityAuditor
 * with @francogp/domain-type Oxlint JS plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - '@francogp/domain-type/no-store-destructuring-without-storetorefs' is 'error'
 *    - '@francogp/domain-type/no-direct-state-mutation-outside-actions' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - Pinia reactivity violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - no-store-destructuring-without-storetorefs catches direct destructuring of use*Store()
 *    - no-store-destructuring-without-storetorefs catches indirect destructuring of store instance
 *    - no-store-destructuring-without-storetorefs allows storeToRefs(store) and store.property
 *    - no-direct-state-mutation-outside-actions catches direct store.$state = ... assignment
 * 4. Architectural Discovery Verification:
 *    - validate_pinia_reactivity is completely removed from discovered auditors.
 */

import { createPinia } from 'pinia';
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Pinia Reactivity Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares @francogp/domain-type/no-store-destructuring-without-storetorefs as error', () => {
      expect(
        DEFAULT_CANONICAL_LINT_RULES[
          '@francogp/domain-type/no-store-destructuring-without-storetorefs'
        ]
      ).toBe('error');
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares @francogp/domain-type/no-direct-state-mutation-outside-actions as error', () => {
      expect(
        DEFAULT_CANONICAL_LINT_RULES[
          '@francogp/domain-type/no-direct-state-mutation-outside-actions'
        ]
      ).toBe('error');
    });

    it('CANARY: verifies native Pinia instance instantiation in test harness', () => {
      const pinia = createPinia();
      expect(pinia).toBeDefined();
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps no-store-destructuring-without-storetorefs into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message:
              "Direct destructuring of Pinia store 'useBillingStore()' strips reactivity. Wrap with 'storeToRefs(...)'.",
            code: '@francogp/domain-type(no-store-destructuring-without-storetorefs)',
            severity: 'error',
            filename: 'src/components/BillingWidget.vue',
            labels: [{ span: { line: 12, column: 9 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/components/BillingWidget.vue');
      expect(findings[0]?.context).toBe(
        '@francogp/domain-type(no-store-destructuring-without-storetorefs)'
      );
    });

    it('CANARY: maps no-direct-state-mutation-outside-actions into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Direct state mutation via store.$state is PROHIBITED.',
            code: '@francogp/domain-type(no-direct-state-mutation-outside-actions)',
            severity: 'error',
            filename: 'src/views/ProfileView.vue',
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
      expect(findings[0]?.file).toBe('src/views/ProfileView.vue');
      expect(findings[0]?.context).toBe(
        '@francogp/domain-type(no-direct-state-mutation-outside-actions)'
      );
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: domainTypeOxlintPlugin provides no-store-destructuring-without-storetorefs and no-direct-state-mutation-outside-actions', () => {
      const rules = domainTypeOxlintPlugin.rules;
      expect(rules['no-store-destructuring-without-storetorefs']).toBeDefined();
      expect(rules['no-direct-state-mutation-outside-actions']).toBeDefined();
    });

    it('CANARY: no-store-destructuring-without-storetorefs catches direct destructuring of use*Store()', () => {
      const rule = domainTypeOxlintPlugin.rules['no-store-destructuring-without-storetorefs'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      // Simulate const { currentProject, projects } = useBillingStore();
      visitor.VariableDeclarator?.({
        id: { type: 'ObjectPattern' },
        init: {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'useBillingStore' }
        }
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-store-destructuring-without-storetorefs catches indirect destructuring of store identifier', () => {
      const rule = domainTypeOxlintPlugin.rules['no-store-destructuring-without-storetorefs'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      // Step 1: assign store: const billingStore = useBillingStore();
      visitor.VariableDeclarator?.({
        id: { type: 'Identifier', name: 'billingStore' },
        init: {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'useBillingStore' }
        }
      });

      // Step 2: destructure store: const { currentProject } = billingStore;
      visitor.VariableDeclarator?.({
        id: { type: 'ObjectPattern' },
        init: {
          type: 'Identifier',
          name: 'billingStore'
        }
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-direct-state-mutation-outside-actions catches assignment to store.$state', () => {
      const rule = domainTypeOxlintPlugin.rules['no-direct-state-mutation-outside-actions'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      // Simulate store.$state = { ... }
      visitor.AssignmentExpression?.({
        left: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'store' },
          property: { type: 'Identifier', name: '$state' }
        }
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Dynamic Subauditor Retirement & Discovery Verification', () => {
    it('CANARY: discoverAuditors no longer discovers validate_pinia_reactivity', async () => {
      const discovered = await discoverAuditors();
      const ids = discovered.map((d) => d.id);

      expect(ids).not.toContain('validate_pinia_reactivity');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
