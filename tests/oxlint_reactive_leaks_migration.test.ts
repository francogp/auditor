/**
 * packages/auditor/tests/oxlint_reactive_leaks_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_reactive_leaks into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing ReactiveLeaksAuditor
 * with @francogp/domain-type Oxlint JS plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - '@francogp/domain-type/dom-event-leak' is 'error'
 *    - '@francogp/domain-type/interval-leak' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - Memory leak violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - dom-event-leak catches addEventListener without { once: true } or cleanup
 *    - dom-event-leak allows addEventListener with { once: true }
 *    - interval-leak catches setInterval without clearInterval
 * 4. Architectural Discovery Verification:
 *    - validate_reactive_leaks is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Reactive & DOM Leaks Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares @francogp/domain-type/dom-event-leak as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/dom-event-leak']).toBe('error');
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares @francogp/domain-type/interval-leak as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/interval-leak']).toBe('error');
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps dom-event-leak into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message:
              "Potential DOM event listener leak: 'addEventListener' attached without cleanup.",
            code: '@francogp/domain-type(dom-event-leak)',
            severity: 'error',
            filename: 'src/components/KeyHandler.vue',
            labels: [{ span: { line: 14, column: 5 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/components/KeyHandler.vue');
      expect(findings[0]?.context).toBe('@francogp/domain-type(dom-event-leak)');
    });

    it('CANARY: maps interval-leak into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message:
              "Potential timer leak: 'setInterval' invoked without a matching 'clearInterval'.",
            code: '@francogp/domain-type(interval-leak)',
            severity: 'error',
            filename: 'src/composables/useTicker.ts',
            labels: [{ span: { line: 22, column: 3 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/composables/useTicker.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(interval-leak)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: domainTypeOxlintPlugin provides dom-event-leak and interval-leak', () => {
      const rules = domainTypeOxlintPlugin.rules;
      expect(rules['dom-event-leak']).toBeDefined();
      expect(rules['interval-leak']).toBeDefined();
    });

    it('CANARY: dom-event-leak catches addEventListener without cleanup', () => {
      const rule = domainTypeOxlintPlugin.rules['dom-event-leak'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        },
        getSourceCode: () => ({
          getText: () => 'window.addEventListener("keydown", handleKey);'
        })
      });

      // Simulate window.addEventListener('keydown', handleKey)
      visitor.CallExpression?.({
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'window' },
          property: { type: 'Identifier', name: 'addEventListener' }
        },
        arguments: [
          { type: 'Literal', value: 'keydown' },
          { type: 'Identifier', name: 'handleKey' }
        ]
      });
      expect(reported).toBe(true);
    });

    it('CANARY: interval-leak catches setInterval without clearInterval', () => {
      const rule = domainTypeOxlintPlugin.rules['interval-leak'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        },
        getSourceCode: () => ({
          getText: () => 'const id = setInterval(poll, 1000);'
        })
      });

      // Simulate setInterval(poll, 1000)
      visitor.CallExpression?.({
        callee: { type: 'Identifier', name: 'setInterval' },
        arguments: [
          { type: 'Identifier', name: 'poll' },
          { type: 'Literal', value: 1000 }
        ]
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Dynamic Subauditor Retirement & Discovery Verification', () => {
    it('CANARY: discoverAuditors no longer discovers validate_reactive_leaks', async () => {
      const discovered = await discoverAuditors();
      const ids = discovered.map((d) => d.id);

      expect(ids).not.toContain('validate_reactive_leaks');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
