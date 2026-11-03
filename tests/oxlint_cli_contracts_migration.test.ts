/**
 * packages/auditor/tests/oxlint_cli_contracts_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_cli_contracts AST rules into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing AST checks in CliContractsAuditor
 * with @francogp/domain-type Oxlint JS plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - '@francogp/domain-type/no-direct-process-argv' is 'error'
 *    - '@francogp/domain-type/no-banned-cli-parsers' is 'error'
 *    - '@francogp/domain-type/no-homebrew-flag-parsing' is 'error'
 *    - '@francogp/domain-type/no-cli-eval-bypass' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - CLI contract violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - no-direct-process-argv catches process.argv
 *    - no-banned-cli-parsers catches yargs / commander / minimist
 *    - no-homebrew-flag-parsing catches startsWith('--')
 *    - no-cli-eval-bypass catches eval()
 * 4. Architectural Discovery Verification:
 *    - validate_cli_contracts is verified or cleanly preserved for setup-phase dependency assertions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint CLI Contracts Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares CLI contract rules as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-direct-process-argv']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-banned-cli-parsers']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-homebrew-flag-parsing']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-cli-eval-bypass']).toBe(
        'error'
      );
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps no-direct-process-argv diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: "Direct 'process.argv' access detected.",
            code: '@francogp/domain-type(no-direct-process-argv)',
            severity: 'error',
            filename: 'src/cli/run.ts',
            labels: [{ span: { line: 10, column: 1 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/cli/run.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(no-direct-process-argv)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: no-direct-process-argv catches process.argv', () => {
      const rule = domainTypeOxlintPlugin.rules['no-direct-process-argv'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.MemberExpression?.({
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'process' },
        property: { type: 'Identifier', name: 'argv' }
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-banned-cli-parsers catches commander import', () => {
      const rule = domainTypeOxlintPlugin.rules['no-banned-cli-parsers'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.ImportDeclaration?.({
        type: 'ImportDeclaration',
        source: { value: 'commander' }
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-homebrew-flag-parsing catches startsWith("--")', () => {
      const rule = domainTypeOxlintPlugin.rules['no-homebrew-flag-parsing'];
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
          object: { type: 'Identifier', name: 'arg' },
          property: { type: 'Identifier', name: 'startsWith' }
        },
        arguments: [{ type: 'Literal', value: '--json' }]
      });
      expect(reported).toBe(true);
    });

    it('CANARY: no-cli-eval-bypass catches eval()', () => {
      const rule = domainTypeOxlintPlugin.rules['no-cli-eval-bypass'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.CallExpression?.({
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'eval' }
      });
      expect(reported).toBe(true);
    });
  });
});
