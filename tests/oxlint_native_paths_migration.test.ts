/**
 * packages/auditor/tests/oxlint_native_paths_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_native_paths into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing NativePathsAuditor
 * with Oxlint native rules and @francogp/domain-type Oxlint JS plugin rules:
 *
 * 1. Default Canonical Rules:
 *    - 'node/no-path-concat' is 'error'
 *    - '@francogp/domain-type/unsafe-path-concat' is 'error'
 *    - '@francogp/domain-type/unsanitized-env-argv-path' is 'error'
 *    - '@francogp/domain-type/untrusted-url-fetch' is 'error'
 *    - '@francogp/domain-type/hardcoded-slash-path' is 'error'
 * 2. Oxlint Diagnostic & Finding Mapping:
 *    - Native path violations map to AuditFinding with severity 'error' in parseOxlintResults.
 * 3. Domain Type Plugin Rule Conformance:
 *    - unsafe-path-concat detects template literal path assembly.
 *    - unsanitized-env-argv-path detects process.argv passed to fs sinks.
 *    - untrusted-url-fetch detects dynamic fetch without new URL().
 *    - hardcoded-slash-path detects split('\\\\') or split('/').
 * 4. Architectural Discovery Verification:
 *    - validate_native_paths is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { domainTypeOxlintPlugin } from '../src/core/domainTypeOxlintPlugin.ts';
import { parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Native Paths Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares native path rules as error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['node/no-path-concat']).toBe('error');
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/unsafe-path-concat']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/unsanitized-env-argv-path']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/untrusted-url-fetch']).toBe(
        'error'
      );
      expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/hardcoded-slash-path']).toBe(
        'error'
      );
    });
  });

  describe('2. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps unsafe-path-concat diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Unsafe path concatenation via template literal.',
            code: '@francogp/domain-type(unsafe-path-concat)',
            severity: 'error',
            filename: 'src/logic/reader.ts',
            labels: [{ span: { line: 12, column: 5 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 160
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/logic/reader.ts');
      expect(findings[0]?.context).toBe('@francogp/domain-type(unsafe-path-concat)');
    });
  });

  describe('3. Plugin Rule Implementation Verification', () => {
    it('CANARY: unsafe-path-concat catches template literal path concatenation', () => {
      const rule = domainTypeOxlintPlugin.rules['unsafe-path-concat'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        }
      });

      visitor.TemplateLiteral?.({
        type: 'TemplateLiteral',
        quasis: [{ value: { raw: '/tmp/' } }, { value: { raw: '' } }],
        expressions: [{ type: 'Identifier', name: 'fileName' }]
      });
      expect(reported).toBe(true);
    });

    it('CANARY: unsanitized-env-argv-path catches process.argv passed to fs.readFileSync', () => {
      const rule = domainTypeOxlintPlugin.rules['unsanitized-env-argv-path'];
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
          object: { type: 'Identifier', name: 'fs' },
          property: { type: 'Identifier', name: 'readFileSync' }
        },
        arguments: [
          {
            type: 'MemberExpression',
            object: {
              type: 'MemberExpression',
              object: { type: 'Identifier', name: 'process' },
              property: { type: 'Identifier', name: 'argv' }
            },
            property: { type: 'Literal', value: 2 }
          }
        ]
      });
      expect(reported).toBe(true);
    });

    it('CANARY: untrusted-url-fetch catches dynamic fetch without new URL()', () => {
      const rule = domainTypeOxlintPlugin.rules['untrusted-url-fetch'];
      let reported = false;
      const visitor = rule.create({
        report: () => {
          reported = true;
        },
        getSourceCode: () => ({
          getText: () =>
            'export async function loadData(endpoint: string) { return fetch(endpoint); }'
        })
      });

      visitor.CallExpression?.({
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'fetch' },
        arguments: [{ type: 'Identifier', name: 'endpoint' }]
      });
      expect(reported).toBe(true);
    });

    it('CANARY: hardcoded-slash-path catches split("\\\\\\\\")', () => {
      const rule = domainTypeOxlintPlugin.rules['hardcoded-slash-path'];
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
          object: { type: 'Identifier', name: 'filePath' },
          property: { type: 'Identifier', name: 'split' }
        },
        arguments: [{ type: 'Literal', value: '\\\\' }]
      });
      expect(reported).toBe(true);
    });
  });

  describe('4. Architectural Discovery Verification', () => {
    it('CANARY: validate_native_paths is completely removed from discovered auditors', async () => {
      const auditors = await discoverAuditors();
      const ids = auditors.map((a) => a.id);
      expect(ids).not.toContain('validate_native_paths');
      expect(ids).toContain('validate_oxlint');
    });
  });
});
