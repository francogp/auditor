/**
 * packages/auditor/tests/validate_oxlint.test.ts
 *
 * Dedicated unit test suite for OxlintAuditor & parseOxlintResults:
 * - Detects Oxlint violations and elevates to error severity (oxlint-violation)
 * - Verifies JSON output parsing from stdout
 * - Verifies clean execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import {
  OxlintAuditor,
  OXLINT_RULES,
  OXLINT_FIXABLE_RULES,
  isOxlintRuleFixable,
  parseOxlintResults
} from '../src/suites/architecture/validate_oxlint.ts';

describe('OxlintAuditor & parseOxlintResults', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('declares all canonical rules in OXLINT_RULES', () => {
      expect(OXLINT_RULES).toContain('oxlint-violation');
      expect(OXLINT_RULES).toHaveLength(1);
    });

    it('initializes with correct id and family', () => {
      const auditor = new OxlintAuditor();
      expect(auditor.id).toBe('validate_oxlint');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toContain('oxlint-violation');
      expect(OXLINT_FIXABLE_RULES.size).toBeGreaterThan(0);
    });
  });

  describe('parseOxlintResults', () => {
    it('parses Oxlint diagnostic JSON report into AuditFindings with severity error', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message:
              "Unsafe type assertion: type 'Record<string, unknown>' is more narrow than the original type.",
            code: 'typescript(no-unsafe-type-assertion)',
            severity: 'error',
            filename: 'src/example.ts',
            labels: [{ span: { line: 14, column: 7 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 153
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]!.ruleId).toBe('oxlint-violation');
      expect(findings[0]!.severity).toBe('error');
      expect(findings[0]!.file).toBe('src/example.ts');
      expect(findings[0]!.line).toBe(14);
      expect(findings[0]!.col).toBe(7);
      expect(findings[0]!.message).toContain('typescript(no-unsafe-type-assertion)');
    });

    it('CANARY: elevates diagnostics with native severity warning to severity error (Zero-Warning Policy)', () => {
      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Promise returned in function argument where void return is expected.',
            code: 'typescript(no-floating-promises)',
            severity: 'warning',
            filename: 'src/async.ts',
            labels: [{ span: { line: 20, column: 5 } }]
          }
        ],
        number_of_files: 1,
        number_of_rules: 153
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]!.ruleId).toBe('oxlint-violation');
      expect(findings[0]!.severity).toBe('error');
    });

    it('parses legacy array report into AuditFindings with severity error', () => {
      const rawReports = [
        {
          filePath: '/home/project/src/calc.ts',
          messages: [
            {
              ruleId: 'no-unused-vars',
              severity: 1,
              message: "'x' is defined but never used.",
              line: 14,
              column: 7
            }
          ]
        }
      ];

      const findings = parseOxlintResults(rawReports, '/home/project');
      expect(findings).toHaveLength(1);
      expect(findings[0]!.ruleId).toBe('oxlint-violation');
      expect(findings[0]!.severity).toBe('error');
      expect(findings[0]!.file).toBe('src/calc.ts');
      expect(findings[0]!.line).toBe(14);
    });

    it('returns empty findings on clean or empty output', () => {
      const findings = parseOxlintResults('[]');
      expect(findings).toHaveLength(0);
    });

    it('CANARY: accurately propagates fixable: true for fixable oxlint rules', () => {
      expect(isOxlintRuleFixable('prefer-const')).toBe(true);
      expect(isOxlintRuleFixable('no-var')).toBe(true);
      expect(isOxlintRuleFixable('unicorn(prefer-node-protocol)')).toBe(true);
      expect(isOxlintRuleFixable('typescript(no-unnecessary-type-assertion)')).toBe(true);
      expect(isOxlintRuleFixable('vitest(no-test-prefixes)')).toBe(true);
      expect(isOxlintRuleFixable('vue(no-import-compiler-macros)')).toBe(true);
      expect(isOxlintRuleFixable('no-eval')).toBe(false);

      const oxlintOutput = JSON.stringify({
        diagnostics: [
          {
            message: 'Use const instead of let',
            code: 'prefer-const',
            severity: 'error',
            filename: 'src/fixable.ts',
            labels: [{ span: { line: 5, column: 1 } }]
          },
          {
            message: 'eval is evil',
            code: 'no-eval',
            severity: 'error',
            filename: 'src/non_fixable.ts',
            labels: [{ span: { line: 10, column: 1 } }]
          }
        ],
        number_of_files: 2,
        number_of_rules: 153
      });

      const findings = parseOxlintResults(oxlintOutput, process.cwd());
      expect(findings).toHaveLength(2);
      expect(findings[0]!.context).toBe('prefer-const');
      expect(findings[0]!.fixable).toBe(true);
      expect(findings[1]!.context).toBe('no-eval');
      expect(findings[1]!.fixable).toBe(false);
    });
  });

  describe('Clean execution', () => {
    class CleanOxlintAuditor extends OxlintAuditor {
      public override async runAudit(): Promise<void> {
        this.recordScanned('src/clean.ts');
        this.markRuleEvaluated('oxlint-violation');
        this.context.setMetric('oxlint_violations', 0);
      }
    }

    it('runs on clean results and reports zero errors', async () => {
      const auditor = new CleanOxlintAuditor();
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('supports fix: true mode and marks remaining unfixable findings as fixable: false', async () => {
      const auditor = new CleanOxlintAuditor();
      Reflect.set(auditor, 'fixMode', true);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});
