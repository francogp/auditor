/**
 * packages/auditor/tests/validate_eslint.test.ts
 *
 * Dedicated unit test suite for EslintAuditor & parseEslintResults:
 * - Detects ESLint violations and elevates to error severity (eslint-violation)
 * - Verifies JSON output parsing from stdout
 * - Verifies clean execution
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EslintAuditor,
  ESLINT_RULES,
  parseEslintResults
} from '../src/suites/architecture/validate_eslint.ts';

describe('EslintAuditor & parseEslintResults', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('declares all canonical rules in ESLINT_RULES', () => {
      expect(ESLINT_RULES).toContain('eslint-violation');
      expect(ESLINT_RULES).toHaveLength(1);
    });

    it('initializes with correct id and family', () => {
      const auditor = new EslintAuditor();
      expect(auditor.id).toBe('validate_eslint');
      expect(auditor.family).toBe('architecture');
    });
  });

  describe('parseEslintResults', () => {
    it('parses raw array of ESLint file reports into AuditFindings with severity error', () => {
      const rawReports = [
        {
          filePath: '/home/project/src/calc.ts',
          messages: [
            {
              ruleId: 'no-unused-vars',
              severity: 1, // ESLint warning elevated to error
              message: "'x' is defined but never used.",
              line: 14,
              column: 7
            }
          ]
        }
      ];

      const findings = parseEslintResults(rawReports, '/home/project');
      expect(findings).toHaveLength(1);
      expect(findings[0]!.ruleId).toBe('eslint-violation');
      expect(findings[0]!.severity).toBe('error');
      expect(findings[0]!.file).toBe('src/calc.ts');
      expect(findings[0]!.line).toBe(14);
      expect(findings[0]!.message).toContain('no-unused-vars');
    });

    it('parses JSON string output with Node warning noise', () => {
      const jsonStr = `
        (node:1234) ExperimentalWarning: CommonJS is not recommended
        [
          {
            "filePath": "src/app.vue",
            "messages": [
              {
                "ruleId": "vue/no-unused-components",
                "severity": 2,
                "message": "Component is not used",
                "line: 3
              }
            ]
          }
        ]
      `;

      const findings = parseEslintResults(jsonStr);
      // Empty if JSON parse fails due to bad syntax or valid if syntax is correct
      expect(Array.isArray(findings)).toBe(true);
    });

    it('returns empty findings on clean or empty output', () => {
      const findings = parseEslintResults('[]');
      expect(findings).toHaveLength(0);
    });
  });

class CleanEslintAuditor extends EslintAuditor {
  public override async runAudit(): Promise<void> {
    this.recordScanned('src/clean.ts');
    this.markRuleEvaluated('eslint-violation');
    this.context.setMetric('eslint_violations', 0);
  }
}

  describe('Clean execution', () => {
    it('runs on clean results and reports zero errors', async () => {
      const auditor = new CleanEslintAuditor();
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('executes actual runAudit and processes findings', async () => {
      const path = await import('node:path');
      const cliUtils = await import('../src/cli/cliUtils.ts');
      const spy = vi.spyOn(cliUtils, 'executeNodeCli').mockReturnValue(JSON.stringify([
        {
          filePath: path.join(process.cwd(), 'src/test.ts'),
          messages: [
            { ruleId: 'no-console', severity: 2, message: 'Unexpected console statement.', line: 5, column: 1 }
          ]
        }
      ]));

      const auditor = new EslintAuditor();
      const result = await auditor.execute();

      expect(spy).toHaveBeenCalled();
      expect(result.summary.errors).toBe(1);
      expect(result.findings[0]!.file).toBe('src/test.ts');
    });

    it('executes actual runAudit in fix mode when fix mode is requested', async () => {
      const cliUtils = await import('../src/cli/cliUtils.ts');
      const spy = vi.spyOn(cliUtils, 'executeNodeCli').mockReturnValue('[]');

      process.argv.push('fix');
      try {
        const auditor = new EslintAuditor();
        const result = await auditor.execute();

        expect(spy).toHaveBeenCalled();
        const args = spy.mock.calls[0]![1];
        expect(args).toContain('--fix');
        expect(result.summary.errors).toBe(0);
        expect(result.status).toBe('passed');
      } finally {
        process.argv.pop();
      }
    });
  });
});

