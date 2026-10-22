/**
 * packages/auditor/tests/validate_markdown_syntax.test.ts
 *
 * Dedicated unit test suite for MarkdownSyntaxAuditor:
 * - Detects direct scripts in docs (npm-script-exclusivity-in-docs)
 * - Detects tables missing preceding blank lines (markdown-table-preceding-blank-line)
 * - Enforces Zero-Ignore policy
 * - Verifies clean execution (0 errors, passed status)
 */

import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import type { ViolationInput } from '../src/core/auditorBase.ts';
import {
  MarkdownSyntaxAuditor,
  MARKDOWN_SYNTAX_RULES,
  type MarkdownSyntaxRuleId
} from '../src/suites/documentation/validate_markdown_syntax.ts';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

class TestableMarkdownSyntaxAuditor extends MarkdownSyntaxAuditor {
  public readonly collectedViolations: ViolationInput<MarkdownSyntaxRuleId>[] = [];

  public override addViolation(v: ViolationInput<MarkdownSyntaxRuleId>): void {
    this.collectedViolations.push(v);
    super.addViolation(v);
  }

  public override testScanFile(relPath: string, content: string): void {
    this.scanFile(relPath, content);
  }
}

describe('MarkdownSyntaxAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('declares all expected canonical rules', () => {
      expect(MARKDOWN_SYNTAX_RULES).toContain('npm-script-exclusivity-in-docs');
      expect(MARKDOWN_SYNTAX_RULES).toContain('markdown-table-preceding-blank-line');
    });

    it('initializes with correct id and family', () => {
      const auditor = new MarkdownSyntaxAuditor({ roots: [], projectRoot: PROJECT_ROOT });
      expect(auditor.id).toBe('validate_markdown_syntax');
      expect(auditor.family).toBe('documentation');
      expect(auditor.ruleIds).toContain('npm-script-exclusivity-in-docs');
      expect(auditor.ruleIds).toContain('markdown-table-preceding-blank-line');
    });
  });

  describe('Violation Detection: NPM Script Exclusivity', () => {
    it('detects direct script execution in fenced code blocks (npm-script-exclusivity-in-docs)', () => {
      const auditor = new TestableMarkdownSyntaxAuditor({ roots: [], projectRoot: PROJECT_ROOT });
      const content = [
        '# Developer Guide',
        '```bash',
        'node scripts/auditors/audit.ts',
        'npx tsx scripts/dev.ts',
        'npx vite build',
        '```'
      ].join('\n');

      auditor.testScanFile('docs/guide.md', content);

      const violations = auditor.collectedViolations.filter(
        (v) => v.ruleId === 'npm-script-exclusivity-in-docs'
      );
      expect(violations).toHaveLength(3);
      expect(violations[0]?.severity).toBe('error');
      expect(violations[0]?.message).toContain('Direct script execution');
    });

    it('allows npm run commands in fenced code blocks', () => {
      const auditor = new TestableMarkdownSyntaxAuditor({ roots: [], projectRoot: PROJECT_ROOT });
      const content = [
        '# Developer Guide',
        '```bash',
        'npm run audit',
        'npm run build',
        'npm run test',
        '```'
      ].join('\n');

      auditor.testScanFile('docs/guide.md', content);
      const violations = auditor.collectedViolations.filter(
        (v) => v.ruleId === 'npm-script-exclusivity-in-docs'
      );
      expect(violations).toHaveLength(0);
    });

    it('flags direct commands regardless of <!-- npm-ok --> comment (Zero-Ignore Mandate)', () => {
      const auditor = new TestableMarkdownSyntaxAuditor({ roots: [], projectRoot: PROJECT_ROOT });
      const content = [
        '# Setup Script',
        '```bash',
        'node scripts/setup.ts <!-- npm-ok: Low-level bootstrapping -->',
        '```'
      ].join('\n');

      auditor.testScanFile('docs/setup.md', content);
      expect(auditor.collectedViolations).toHaveLength(1);
    });
  });

  describe('Violation Detection: Markdown Tables Preceding Blank Line', () => {
    it('detects tables immediately preceded by text without a blank line (markdown-table-preceding-blank-line)', () => {
      const auditor = new TestableMarkdownSyntaxAuditor({ roots: [], projectRoot: PROJECT_ROOT });
      const content = [
        'Paragraph text immediately before table without blank line.',
        '| Header 1 | Header 2 |',
        '| -------- | -------- |',
        '| Cell 1   | Cell 2   |'
      ].join('\n');

      auditor.testScanFile('docs/table.md', content);

      const violations = auditor.collectedViolations.filter(
        (v) => v.ruleId === 'markdown-table-preceding-blank-line'
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]?.severity).toBe('warning');
      expect(violations[0]?.message).toContain('preceded by a blank empty line');
    });

    it('allows tables preceded by a blank line, heading, or comment', () => {
      const auditor = new TestableMarkdownSyntaxAuditor({ roots: [], projectRoot: PROJECT_ROOT });
      const content = [
        'Some intro text.',
        '',
        '| Header 1 | Header 2 |',
        '| -------- | -------- |',
        '| Cell 1   | Cell 2   |',
        '',
        '# Table Heading',
        '| Column A | Column B |',
        '| :------- | :------- |',
        '| Value A  | Value B  |'
      ].join('\n');

      auditor.testScanFile('docs/clean_table.md', content);
      const violations = auditor.collectedViolations.filter(
        (v) => v.ruleId === 'markdown-table-preceding-blank-line'
      );
      expect(violations).toHaveLength(0);
    });

    it('handles non-table lines with pipe characters cleanly', () => {
      const auditor = new TestableMarkdownSyntaxAuditor({ roots: [], projectRoot: PROJECT_ROOT });
      const content = [
        'Paragraph directly before code.',
        '| Header 1 | Header 2 | with extra text trailing',
        '| -------- | -------- |',
        '| Cell 1   | Cell 2   |'
      ].join('\n');

      auditor.testScanFile('docs/table_escaped.md', content);
      expect(auditor.collectedViolations).toHaveLength(0);
    });
  });

  describe('Clean Execution', () => {
    it('executes cleanly on compliant documentation and reports 0 errors', async () => {
      const auditor = new TestableMarkdownSyntaxAuditor({ roots: [], projectRoot: PROJECT_ROOT });
      const cleanContent = [
        '# Clean Documentation',
        '',
        'Execute tests using:',
        '```bash',
        'npm run test',
        '```',
        '',
        '| Command | Description |',
        '| ------- | ----------- |',
        '| audit   | Run audits  |'
      ].join('\n');

      auditor.testScanFile('docs/clean.md', cleanContent);
      expect(auditor.collectedViolations).toHaveLength(0);

      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('auto-inserts a blank line before markdown tables when fix: true is active', async () => {
      const auditor = new TestableMarkdownSyntaxAuditor({ roots: [], projectRoot: PROJECT_ROOT });
      (auditor as unknown as { fixMode: boolean }).fixMode = true;
      const content = [
        'Paragraph immediately before table.',
        '| Header 1 | Header 2 |',
        '| -------- | -------- |',
        '| Cell 1   | Cell 2   |'
      ].join('\n');

      auditor.testScanFile('docs/nonexistent_table.md', content);
      expect(auditor.collectedViolations).toHaveLength(0);
    });
  });
});
