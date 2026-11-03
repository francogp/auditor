/**
 * packages/auditor/tests/oxlint_vue_router_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_vue_router into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing ValidateVueRouterAuditor
 * with @francogp/domain-type Oxlint JS plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - '@francogp/domain-type/no-deprecated-router-next' is 'error'
 *    - '@francogp/domain-type/no-define-async-component-in-router' is 'error'
 *    - '@francogp/domain-type/no-window-location-navigation' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - Vue router violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - no-deprecated-router-next catches 3-param guards (to, from, next)
 *    - no-define-async-component-in-router catches defineAsyncComponent in router
 *    - no-window-location-navigation catches window.location.href = '/path' in SPA
 * 4. Architectural Discovery Verification:
 *    - validate_vue_router is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Vue Router Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares @francogp/domain-type/no-deprecated-router-next as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-deprecated-router-next']).toBe(
        'error'
      );
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares @francogp/domain-type/no-define-async-component-in-router as error', () => {
      expect(
        DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-define-async-component-in-router']
      ).toBe('error');
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares @francogp/domain-type/no-window-location-navigation as error', () => {
      expect(
        DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-window-location-navigation']
      ).toBe('error');
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps no-deprecated-router-next into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: "Deprecated 3-parameter '(to, from, next)' guard in Vue Router.",
            code: '@francogp/domain-type(no-deprecated-router-next)',
            severity: 'error',
            filename: 'src/router/index.ts',
            labels: [{ span: { line: 15, column: 1 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/router/index.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-deprecated-router-next)');
    });

    it('CANARY: maps no-define-async-component-in-router into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: "Wrapping route component with 'defineAsyncComponent' is prohibited.",
            code: '@francogp/domain-type(no-define-async-component-in-router)',
            severity: 'error',
            filename: 'src/router/routes.ts',
            labels: [{ span: { line: 8, column: 14 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/router/routes.ts');
      expect(findings[0]?.context).toBe(
        '@francogp/domain-type(no-define-async-component-in-router)'
      );
    });

    it('CANARY: maps no-window-location-navigation into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message:
              "Using 'window.location.href' for internal SPA navigation destroys client state.",
            code: '@francogp/domain-type(no-window-location-navigation)',
            severity: 'error',
            filename: 'src/components/HeaderBar.vue',
            labels: [{ span: { line: 20, column: 3 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/components/HeaderBar.vue');
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-window-location-navigation)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: domainTypeOxlintPlugin provides router rules', () => {
      const rules = domainTypeOxlintPlugin.rules;
      expect(rules['no-deprecated-router-next']).toBeDefined();
      expect(rules['no-define-async-component-in-router']).toBeDefined();
      expect(rules['no-window-location-navigation']).toBeDefined();
    });

    it('CANARY: no-deprecated-router-next catches 3-param guard callback', () => {
      const rule = domainTypeOxlintPlugin.rules['no-deprecated-router-next'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      // Simulate router.beforeEach((to, from, next) => { ... })
      visitor.CallExpression?.({
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'router' },
          property: { type: 'Identifier', name: 'beforeEach' }
        },
        arguments: [
          {
            type: 'ArrowFunctionExpression',
            params: [
              { type: 'Identifier', name: 'to' },
              { type: 'Identifier', name: 'from' },
              { type: 'Identifier', name: 'next' }
            ]
          }
        ]
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-define-async-component-in-router catches defineAsyncComponent inside route component', () => {
      const rule = domainTypeOxlintPlugin.rules['no-define-async-component-in-router'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      // Simulate { path: '/home', component: defineAsyncComponent(...) }
      visitor.Property?.({
        key: { type: 'Identifier', name: 'component' },
        value: {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'defineAsyncComponent' }
        }
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-window-location-navigation catches window.location.href = "/dashboard"', () => {
      const rule = domainTypeOxlintPlugin.rules['no-window-location-navigation'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      // Simulate window.location.href = '/dashboard'
      visitor.AssignmentExpression?.({
        left: {
          type: 'MemberExpression',
          object: {
            type: 'MemberExpression',
            object: { type: 'Identifier', name: 'window' },
            property: { type: 'Identifier', name: 'location' }
          },
          property: { type: 'Identifier', name: 'href' }
        },
        right: {
          type: 'Literal',
          value: '/dashboard'
        }
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Dynamic Subauditor Retirement & Discovery Verification', () => {
    it('CANARY: discoverAuditors no longer discovers validate_vue_router', async () => {
      const discovered = await discoverAuditors();
      const ids = discovered.map((d) => d.id);

      expect(ids).not.toContain('validate_vue_router');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
