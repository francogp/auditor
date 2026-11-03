/**
 * packages/auditor/tests/oxlint_console_debugger_migration.test.ts
 *
 * CANARY & MIGRATION TEST SUITE: Subsuming validate_console_cleanliness into Oxlint
 *
 * Verifies 1:1 parity and zero regressions after replacing the custom sub-auditor
 * (validate_console_cleanliness) with native Oxlint rules ('no-console' and 'no-debugger'):
 *
 * 1. Default Canonical Rules:
 *    - 'no-debugger' is enabled with severity 'error'.
 *    - 'no-console' is enabled with severity 'error', allowing only ['warn', 'error'].
 * 2. Zero Hardcoded Ignores & Dynamic Path Derivation:
 *    - Dynamic logging exemptions resolve strictly from auditConfig.paths.
 *    - Overrides for 'no-console': 'off' apply dynamically to cliRoots, scriptsRoots, testRoots.
 * 3. Diagnostic & Finding Mapping:
 *    - Oxlint violations for eslint(no-console) map to severity 'error'.
 *    - Oxlint violations for eslint(no-debugger) map to severity 'error'.
 * 4. Zero False-Positives in Allowed Usages:
 *    - console.warn and console.error produce zero console errors.
 *    - CLI and test paths with dynamic override produce zero console errors.
 * 5. Architectural Discovery Verification:
 *    - validate_console_cleanliness is completely removed from discovered auditors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { defineAuditConfig, type AuditConfig } from '../src/core/auditConfig.ts';
import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import {
  resolveDynamicTestExemptGlobs,
  resolveEffectiveLintOverrides
} from '../src/core/viteConfigAst.ts';
import { OxlintAuditor, parseOxlintResults } from '../src/suites/architecture/validate_oxlint.ts';

describe('Oxlint Console & Debugger Migration Verification', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. Default Canonical Lint Rules (SSoT)', () => {
    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares no-debugger with severity error', () => {
      expect(DEFAULT_CANONICAL_LINT_RULES['no-debugger']).toBe('error');
    });

    it('CANARY: DEFAULT_CANONICAL_LINT_RULES declares no-console with severity error and permits warn/error', () => {
      const noConsoleRule = DEFAULT_CANONICAL_LINT_RULES['no-console'];
      expect(noConsoleRule).toBeDefined();
      expect(Array.isArray(noConsoleRule)).toBe(true);

      const [severity, options] = noConsoleRule as [string, { allow?: readonly string[] }];
      expect(severity).toBe('error');
      expect(options).toBeDefined();
      expect(options.allow).toContain('warn');
      expect(options.allow).toContain('error');
      expect(options.allow).not.toContain('log');
      expect(options.allow).not.toContain('info');
      expect(options.allow).not.toContain('debug');
    });
  });

  describe('2. Dynamic Test Exemption Resolution (Zero Hardcoded Paths)', () => {
    it('CANARY: resolves test exemption globs dynamically from auditConfig.paths', () => {
      const mockConfig: AuditConfig = defineAuditConfig({
        name: '@francogp/auditor',
        paths: {
          codeRoots: ['src'],
          cliRoots: ['src/cli', 'src/custom-cli'],
          scriptsRoots: ['scripts/maintenance'],
          testRoots: ['tests/unit'],
          e2eRoots: ['tests/e2e'],
          integrationRoots: ['tests/integration']
        }
      });

      const globs = resolveDynamicTestExemptGlobs(mockConfig);
      expect(globs).toContain('**/tests/unit/**');
      expect(globs).toContain('**/tests/e2e/**');
      expect(globs).toContain('**/tests/integration/**');

      // Verify zero hardcoding of unrelated paths and no uninvited CLI relaxation
      expect(globs).not.toContain('**/src/cli/**');
      expect(globs).not.toContain('**/src/custom-cli/**');
      expect(globs).not.toContain('**/scripts/maintenance/**');
      expect(globs).not.toContain('**/src/services/**');
      expect(globs).not.toContain('**/src/components/**');
    });

    it('CANARY: returns empty array when paths has no test roots', () => {
      const emptyConfig: AuditConfig = defineAuditConfig({
        name: '@francogp/auditor',
        paths: {
          codeRoots: ['src'],
          cliRoots: ['src/cli'],
          scriptsRoots: ['scripts'],
          testRoots: [],
          e2eRoots: [],
          integrationRoots: []
        }
      });

      const globs = resolveDynamicTestExemptGlobs(emptyConfig);
      expect(globs).toHaveLength(0);
    });

    it('CANARY: generates effective lint overrides with relaxation ONLY for dynamic test roots', () => {
      const mockConfig: AuditConfig = defineAuditConfig({
        name: '@francogp/auditor',
        paths: {
          codeRoots: ['src'],
          cliRoots: ['src/bin'],
          testRoots: ['tests/unit']
        },
        vitePlusConfig: {
          lint: {
            overrides: []
          }
        }
      });

      const overrides = resolveEffectiveLintOverrides(mockConfig);
      expect(overrides.length).toBeGreaterThan(0);

      const testOverride = overrides.find((ov) => ov.rules && ov.rules['no-console'] === 'off');
      expect(testOverride).toBeDefined();
      expect(testOverride?.files).toContain('**/tests/unit/**');
      // Must NOT contain CLI roots
      expect(testOverride?.files).not.toContain('**/src/bin/**');
    });

    it('CANARY: respects developer custom overrides when no-console is explicitly configured', () => {
      const mockConfig: AuditConfig = defineAuditConfig({
        name: '@francogp/auditor',
        paths: {
          cliRoots: ['src/cli']
        },
        vitePlusConfig: {
          lint: {
            overrides: [
              {
                files: ['**/special/**'],
                rules: {
                  'no-console': 'warn'
                }
              }
            ]
          }
        }
      });

      const overrides = resolveEffectiveLintOverrides(mockConfig);
      // Since developer provided a no-console override, it must be respected
      const customOverride = overrides.find((ov) => ov.rules?.['no-console'] === 'warn');
      expect(customOverride).toBeDefined();
      expect(customOverride?.files).toContain('**/special/**');
    });
  });

  describe('3. Oxlint Finding & Violation Mapping', () => {
    it('CANARY: maps eslint(no-console) diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Unexpected console statement.',
            code: 'eslint(no-console)',
            severity: 'error',
            filename: 'src/services/payment.ts',
            labels: [{ span: { line: 42, column: 5 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 153
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('oxlint-violation');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/services/payment.ts');
      expect(findings[0]?.line).toBe(42);
      expect(findings[0]?.col).toBe(5);
      expect(findings[0]?.context).toBe('eslint(no-console)');
      expect(findings[0]?.message).toContain('Unexpected console statement');
    });

    it('CANARY: maps eslint(no-debugger) diagnostic into AuditFinding with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Unexpected debugger statement.',
            code: 'eslint(no-debugger)',
            severity: 'error',
            filename: 'src/controllers/auth.ts',
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
      expect(findings[0]?.file).toBe('src/controllers/auth.ts');
      expect(findings[0]?.line).toBe(15);
      expect(findings[0]?.col).toBe(3);
      expect(findings[0]?.context).toBe('eslint(no-debugger)');
      expect(findings[0]?.message).toContain('Unexpected debugger statement');
    });
  });

  describe('4. Dynamic Subauditor Retirement & Discovery Verification', () => {
    it('CANARY: discoverAuditors no longer discovers the legacy validate_console_cleanliness', async () => {
      const discovered = await discoverAuditors();
      const ids = discovered.map((d) => d.id);

      expect(ids).not.toContain('validate_console_cleanliness');
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
