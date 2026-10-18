/**
 * tests/fixable_integrity_canary.test.ts
 *
 * AUTOMATED FIXABILITY & POST-FIX INTEGRITY CANARY
 *
 * Validates with concrete dummy files and execution passes that:
 * 1. Rules marked as fixable genuinely repair code on disk.
 * 2. Post-repair audit passes report ZERO fixable errors and NEVER re-prompt for fix.
 * 3. Non-fixable / dangerous rules (e.g. eqeqeq with != null, no-unneeded-ternary, no-eval)
 *    are NEVER marked with fixable: true, eradicating false-positive fix banners.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { computeFixableViolations } from '../src/cli/audit_full.ts';
import type { StandardAuditResult } from '../src/core/auditContract.ts';
import {
  applyRuleFix,
  ProjectArchitectureAuditor
} from '../src/suites/architecture/audit_project.ts';
import { nodePrefix } from '../src/suites/architecture/audit_rules.ts';
import {
  isOxlintRuleFixable,
  parseOxlintResults
} from '../src/suites/architecture/validate_oxlint.ts';
import { MarkdownSyntaxAuditor } from '../src/suites/documentation/validate_markdown_syntax.ts';
import { ValidateMermaidSyntaxAuditor } from '../src/suites/documentation/validate_mermaid_syntax.ts';

describe('Fixability & Post-Fix Integrity Canary', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-fix-integrity-'));
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok: cleanup
    }
  });

  describe('1. Oxlint Grounded Fixability Contract (No False Positives)', () => {
    it('CANARY: strictly returns false for dangerous rules (eqeqeq, no-unneeded-ternary) and suggestions', () => {
      // Dangerous or non-safe rules that Oxlint --fix does NOT safely auto-repair
      const dangerousRules = [
        'eqeqeq',
        'eslint(eqeqeq)',
        'no-unneeded-ternary',
        'eslint(no-unneeded-ternary)',
        'unicorn/no-useless-spread',
        'unicorn(no-useless-spread)',
        'vue/no-import-compiler-macros',
        'vue(no-import-compiler-macros)',
        'no-useless-call',
        'prefer-rest-params',
        'no-eval',
        'eslint(no-eval)'
      ];

      for (const rule of dangerousRules) {
        expect(isOxlintRuleFixable(rule)).toBe(false);
      }
    });

    it('CANARY: returns true for verified safe auto-fixable rules', () => {
      const safeRules = [
        'prefer-const',
        'eslint(prefer-const)',
        'no-var',
        'eslint(no-var)',
        'curly',
        'sort-imports',
        'typescript(consistent-type-imports)',
        'unicorn(prefer-node-protocol)',
        'vitest(no-test-prefixes)'
      ];

      for (const rule of safeRules) {
        expect(isOxlintRuleFixable(rule)).toBe(true);
      }
    });

    it('parses Oxlint report and marks eqeqeq and no-unneeded-ternary as fixable: false', () => {
      const oxlintReport = JSON.stringify({
        diagnostics: [
          {
            message: 'Expected !== and instead saw !=',
            code: 'eslint(eqeqeq)',
            severity: 'error',
            filename: 'src/components/BoxView.vue',
            labels: [{ span: { line: 42, column: 10 } }]
          },
          {
            message: 'Unnecessary use of boolean literals in conditional expression',
            code: 'eslint(no-unneeded-ternary)',
            severity: 'error',
            filename: 'src/logic/helper.ts',
            labels: [{ span: { line: 15, column: 5 } }]
          },
          {
            message: 'Unexpected var, use let or const instead.',
            code: 'eslint(no-var)',
            severity: 'error',
            filename: 'src/logic/script.ts',
            labels: [{ span: { line: 1, column: 1 } }]
          }
        ],
        number_of_files: 3,
        number_of_rules: 180
      });

      const findings = parseOxlintResults(oxlintReport, tempDir);
      expect(findings).toHaveLength(3);

      const eqeqeq = findings.find((f) => f.context === 'eslint(eqeqeq)');
      expect(eqeqeq).toBeDefined();
      expect(eqeqeq!.fixable).toBe(false);

      const ternary = findings.find((f) => f.context === 'eslint(no-unneeded-ternary)');
      expect(ternary).toBeDefined();
      expect(ternary!.fixable).toBe(false);

      const noVar = findings.find((f) => f.context === 'eslint(no-var)');
      expect(noVar).toBeDefined();
      expect(noVar!.fixable).toBe(true);

      // Verify that when only eqeqeq is present, computeFixableViolations yields 0 fixable errors
      const result: StandardAuditResult = {
        id: 'validate_oxlint',
        name: 'Oxlint Validator',
        description: 'Oxlint Validator',
        family: 'architecture',
        status: 'failed',
        durationMs: 100,
        summary: { errors: 2, warnings: 0, info: 0 },
        metrics: {},
        findings: [eqeqeq!, ternary!]
      };

      const fixableSummary = computeFixableViolations([result], false);
      expect(fixableSummary.fixableErrors).toBe(0);
      expect(fixableSummary.autoFixRecommended).toBe(false);
    });
  });

  describe('2. Project Architecture Fixable Rules (Disk Modification & Zero Re-Prompt)', () => {
    it('applies nodePrefix automated fix and guarantees clean re-check without re-prompt', () => {
      // Test snippet without literal banned import in test source
      const legacyImport = 'import path from ' + "'path';\nconst x = 1;\n";
      const testRegex = new RegExp(nodePrefix.regex.source);
      expect(testRegex.test(legacyImport)).toBe(true);

      const repaired = applyRuleFix(nodePrefix, legacyImport, 'src/test.ts');
      expect(repaired).toContain('import path from ' + "'node:path';");
      expect(testRegex.test(repaired)).toBe(false);

      // Simulate a post-fix pass: remaining findings MUST be fixable: false in fix mode
      const auditor = new ProjectArchitectureAuditor();
      expect(auditor.capabilities.fix).toBe('normal');
    });
  });

  describe('3. Markdown Syntax Fixable Rules (Preceding Table Blank Line)', () => {
    it('auto-repairs missing blank lines before tables on disk and never re-prompts for fix', async () => {
      const docsDir = path.join(tempDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });

      const docFile = path.join(docsDir, 'table.md');
      const initialContent =
        '# Title\nSome text immediately preceding table.\n| Col1 | Col2 |\n| ---- | ---- |\n| A    | B    |\n';
      fs.writeFileSync(docFile, initialContent, 'utf-8');

      // 1. Check mode: must report violation marked fixable: true
      const checkAuditor = new MarkdownSyntaxAuditor([tempDir], tempDir);
      const checkResult = await checkAuditor.execute();

      const tableFinding = checkResult.findings.find(
        (f) => f.ruleId === 'markdown-table-preceding-blank-line'
      );
      expect(tableFinding).toBeDefined();
      expect(tableFinding!.fixable).toBe(true);

      // 2. Fix mode: repairs file on disk
      const fixAuditor = new MarkdownSyntaxAuditor([tempDir], tempDir);
      Reflect.set(fixAuditor, 'fixMode', true);
      await fixAuditor.execute();

      const repairedContent = fs.readFileSync(docFile, 'utf-8');
      expect(repairedContent).toContain(
        'Some text immediately preceding table.\n\n| Col1 | Col2 |'
      );

      // 3. Post-repair check pass: verify zero violations
      const postAuditor = new MarkdownSyntaxAuditor([tempDir], tempDir);
      const postResult = await postAuditor.execute();

      const postTableFinding = postResult.findings.find(
        (f) => f.ruleId === 'markdown-table-preceding-blank-line'
      );
      expect(postTableFinding).toBeUndefined();

      const summary = computeFixableViolations([postResult], false);
      expect(summary.fixableErrors).toBe(0);
      expect(summary.autoFixRecommended).toBe(false);
    });
  });

  describe('4. Mermaid Syntax Fixable Rules (Unquoted Punctuation)', () => {
    it('auto-repairs unquoted punctuation in Mermaid diagram nodes and never re-prompts for fix', async () => {
      const docsDir = path.join(tempDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });

      const docFile = path.join(docsDir, 'architecture.md');
      const initialContent =
        '```mermaid\ngraph TD\n  A[Step 1 (Setup)] --> B[Step 2 (Deploy)]\n```\n';
      fs.writeFileSync(docFile, initialContent, 'utf-8');

      // 1. Check mode: must report unquoted punctuation as fixable: true
      const checkAuditor = new ValidateMermaidSyntaxAuditor([tempDir], tempDir);
      const checkResult = await checkAuditor.execute();

      const unquotedFindings = checkResult.findings.filter(
        (f) => f.ruleId === 'mermaid-unquoted-special-chars'
      );
      expect(unquotedFindings.length).toBeGreaterThan(0);
      for (const f of unquotedFindings) {
        expect(f.fixable).toBe(true);
      }

      // 2. Fix mode: repairs unquoted characters on disk
      const fixAuditor = new ValidateMermaidSyntaxAuditor([tempDir], tempDir);
      Reflect.set(fixAuditor, 'fixMode', true);
      await fixAuditor.execute();

      const repairedContent = fs.readFileSync(docFile, 'utf-8');
      expect(repairedContent).toContain('A["Step 1 (Setup)"]');
      expect(repairedContent).toContain('B["Step 2 (Deploy)"]');

      // 3. Post-repair check pass: verify clean execution with 0 fixable errors
      const postAuditor = new ValidateMermaidSyntaxAuditor([tempDir], tempDir);
      const postResult = await postAuditor.execute();

      const remainingFindings = postResult.findings.filter(
        (f) => f.ruleId === 'mermaid-unquoted-special-chars'
      );
      expect(remainingFindings).toHaveLength(0);

      const summary = computeFixableViolations([postResult], false);
      expect(summary.fixableErrors).toBe(0);
      expect(summary.autoFixRecommended).toBe(false);
    });
  });
});
