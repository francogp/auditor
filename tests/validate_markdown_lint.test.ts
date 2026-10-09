/**
 * packages/auditor/tests/validate_markdown_lint.test.ts
 *
 * Dedicated unit test suite for MarkdownLintAuditor & parseMarkdownLintIssues:
 * - Detects markdownlint violations (markdownlint-issue)
 * - Parses JSON output from markdownlint-cli
 * - Handles node warning banners in output
 * - Verifies clean execution (0 errors, passed status)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import {
  MarkdownLintAuditor,
  MARKDOWN_LINT_RULES,
  parseMarkdownLintIssues,
  type RawMarkdownLintIssue
} from '../src/suites/documentation/validate_markdown_lint.ts';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

describe('MarkdownLintAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('declares all expected canonical rules', () => {
      expect(MARKDOWN_LINT_RULES).toContain('markdownlint-issue');
    });

    it('initializes with correct id and family', () => {
      const auditor = new MarkdownLintAuditor(PROJECT_ROOT);
      expect(auditor.id).toBe('validate_markdown_lint');
      expect(auditor.family).toBe('documentation');
      expect(auditor.ruleIds).toContain('markdownlint-issue');
    });
  });

  describe('Violation Parsing & Detection', () => {
    it('parses raw markdownlint JSON output into canonical AuditFindings (markdownlint-issue)', () => {
      const rawJson = JSON.stringify([
        {
          fileName: 'docs/test.md',
          lineNumber: 12,
          ruleNames: ['MD001', 'heading-increment'],
          ruleDescription: 'Heading levels should only increment by one level at a time',
          errorDetail: 'Expected: h2; Actual: h3',
          errorContext: '### Subheading'
        }
      ]);

      const findings = parseMarkdownLintIssues(rawJson, PROJECT_ROOT);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('markdownlint-issue');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('docs/test.md');
      expect(findings[0]?.line).toBe(12);
      expect(findings[0]?.context).toBe('MD001/heading-increment');
      expect(findings[0]?.message).toContain('Heading levels should only increment by one level at a time');
    });

    it('parses array of RawMarkdownLintIssue objects directly', () => {
      const issues: RawMarkdownLintIssue[] = [
        {
          fileName: path.join(PROJECT_ROOT, 'AGENTS.md'),
          lineNumber: 45,
          ruleNames: ['MD009', 'no-trailing-spaces'],
          ruleDescription: 'Trailing spaces',
          errorDetail: 'Expected: 0 or 2; Actual: 1'
        }
      ];

      const findings = parseMarkdownLintIssues(issues, PROJECT_ROOT);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('markdownlint-issue');
      expect(findings[0]?.file).toBe('AGENTS.md');
      expect(findings[0]?.line).toBe(45);
    });

    it('filters out Node permission warnings preceding JSON output', () => {
      const rawWithWarnings = [
        '(node:99999) ExperimentalWarning: Type Stripping is an experimental feature.',
        '(Use `node --trace-warnings ...` to show where the warning was created)',
        '[PERM] SecurityWarning: Access allowed',
        JSON.stringify([
          {
            fileName: 'README.md',
            lineNumber: 5,
            ruleNames: ['MD013', 'line-length'],
            ruleDescription: 'Line length',
            errorDetail: 'Expected: 80; Actual: 105'
          }
        ])
      ].join('\n');

      const findings = parseMarkdownLintIssues(rawWithWarnings, PROJECT_ROOT);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('markdownlint-issue');
      expect(findings[0]?.file).toBe('README.md');
    });

    it('throws descriptive error on malformed JSON string', () => {
      const malformed = '[(node:123) { invalid json }]';
      expect(() => parseMarkdownLintIssues(malformed, PROJECT_ROOT)).toThrow('Error al procesar salida JSON de markdownlint');
    });
  });

  describe('Clean Execution', () => {
    it('returns 0 errors when given empty output or clean results', () => {
      const findings = parseMarkdownLintIssues('', PROJECT_ROOT);
      expect(findings).toHaveLength(0);
      const errors = findings.filter(f => f.severity === 'error').length;
      expect(errors).toBe(0);
    });

    it('returns 0 errors when given an empty JSON array', () => {
      const findings = parseMarkdownLintIssues('[]', PROJECT_ROOT);
      expect(findings).toHaveLength(0);
      const errors = findings.filter(f => f.severity === 'error').length;
      expect(errors).toBe(0);
    });

    it('executes actual runAudit and passes when no issues found', async () => {
      const { vi } = await import('vitest');
      const cliUtils = await import('../src/cli/cliUtils.ts');
      vi.spyOn(cliUtils, 'executeNodeCli').mockReturnValue('[]');

      const auditor = new MarkdownLintAuditor(PROJECT_ROOT);
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('executes actual runAudit with findings and handles fix mode', async () => {
      const { vi } = await import('vitest');
      const cliUtils = await import('../src/cli/cliUtils.ts');
      const spy = vi.spyOn(cliUtils, 'executeNodeCli').mockReturnValue(JSON.stringify([
        {
          fileName: 'README.md',
          lineNumber: 10,
          ruleNames: ['MD001'],
          ruleDescription: 'Heading level error',
          errorDetail: 'Expected h2'
        }
      ]));

      process.argv.push('fix');
      try {
        const auditor = new MarkdownLintAuditor(PROJECT_ROOT);
        const result = await auditor.execute();

        expect(spy).toHaveBeenCalled();
        const args = spy.mock.calls[0]![1];
        expect(args).toContain('--fix');
        expect(result.summary.errors).toBe(1);
        expect(result.findings[0]!.file).toBe('README.md');
      } finally {
        process.argv.pop();
      }
    });
  });

  describe('Auto-repair .markdownlint.json (MD033 allowed_elements)', () => {
    it('injects "br" into MD033 when missing', async () => {
      const nodeFs = await import('node:fs');
      const os = await import('node:os');
      const tmpDir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'mdlint-test-'));
      const testConfigPath = path.join(tmpDir, '.markdownlint.json');

      try {
        nodeFs.writeFileSync(testConfigPath, JSON.stringify({ default: true }, null, 2), 'utf8');

        const auditor = new MarkdownLintAuditor(tmpDir);
        auditor.repairMarkdownLintConfig(testConfigPath);

        const updated = JSON.parse(nodeFs.readFileSync(testConfigPath, 'utf8'));
        expect(updated.MD033).toEqual({ allowed_elements: ['br'] });
      } finally {
        nodeFs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('appends "br" to pre-existing allowed_elements list without duplicates', async () => {
      const nodeFs = await import('node:fs');
      const os = await import('node:os');
      const tmpDir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'mdlint-test-'));
      const testConfigPath = path.join(tmpDir, '.markdownlint.json');

      try {
        nodeFs.writeFileSync(
          testConfigPath,
          JSON.stringify({ default: true, MD033: { allowed_elements: ['span'] } }, null, 2),
          'utf8'
        );

        const auditor = new MarkdownLintAuditor(tmpDir);
        auditor.repairMarkdownLintConfig(testConfigPath);

        const updated = JSON.parse(nodeFs.readFileSync(testConfigPath, 'utf8'));
        expect(updated.MD033.allowed_elements).toEqual(['span', 'br']);

        // Second run should be idempotent
        auditor.repairMarkdownLintConfig(testConfigPath);
        const secondUpdated = JSON.parse(nodeFs.readFileSync(testConfigPath, 'utf8'));
        expect(secondUpdated.MD033.allowed_elements).toEqual(['span', 'br']);
      } finally {
        nodeFs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('does not alter configuration if MD033 is explicitly disabled (false)', async () => {
      const nodeFs = await import('node:fs');
      const os = await import('node:os');
      const tmpDir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'mdlint-test-'));
      const testConfigPath = path.join(tmpDir, '.markdownlint.json');

      try {
        nodeFs.writeFileSync(
          testConfigPath,
          JSON.stringify({ default: true, MD033: false }, null, 2),
          'utf8'
        );

        const auditor = new MarkdownLintAuditor(tmpDir);
        auditor.repairMarkdownLintConfig(testConfigPath);

        const updated = JSON.parse(nodeFs.readFileSync(testConfigPath, 'utf8'));
        expect(updated.MD033).toBe(false);
      } finally {
        nodeFs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('safely handles non-existent or invalid configuration file', async () => {
      const auditor = new MarkdownLintAuditor(PROJECT_ROOT);
      expect(() => auditor.repairMarkdownLintConfig('/non/existent/path/.markdownlint.json')).not.toThrow();
    });
  });
});

