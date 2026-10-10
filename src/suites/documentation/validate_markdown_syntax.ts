/**
 * scripts/auditors/documentation/validate_markdown_syntax.ts
 *
 * MARKDOWN SYNTAX & NPM SCRIPT SSOT AUDITOR (Node.js 26+ Native)
 *
 * Enforces documentation hygiene and Single Source of Truth mandates across markdown files:
 *   1. NPM Script Exclusivity in Docs (`npm-script-exclusivity-in-docs`):
 *      In `.agents/skills/`, `docs/`, and project markdown files, forbids raw script commands
 *      like `node scripts/...`, `npx tsx scripts/...`, `node -e "..."`, `python .agents/...`,
 *      or `npx vite build` in code blocks. Commands must be declared in package.json and run via
 *      `npm run <script>`.
 *   2. Markdown Table Preceding Blank Line (`markdown-table-preceding-blank-line`):
 *      Ensures all markdown tables are preceded by an empty line so CommonMark and GFM parsers
 *      render tables cleanly without merging into preceding paragraphs.
 *
 * Escape Hatches:
 *   `<!-- doc-ok -->`, `<!-- npm-ok -->`, `<!-- table-ok -->`
 *
 * Usage:
 *   npm run validate:markdown-syntax
 */

import { enableCompileCache } from 'node:module';
import {
  FileScanAuditor,
  BaseAuditor
} from '../../core/auditorBase.ts';

enableCompileCache();

export type MarkdownSyntaxRuleId =
  | 'npm-script-exclusivity-in-docs'
  | 'markdown-table-preceding-blank-line';

export const MARKDOWN_SYNTAX_RULES: readonly MarkdownSyntaxRuleId[] = [
  'npm-script-exclusivity-in-docs',
  'markdown-table-preceding-blank-line'
] as const;

const FORBIDDEN_DOC_COMMAND_REGEX = /\b(?:node\s+scripts\/|npx\s+tsx\s+scripts\/|node\s+-e\s+["']|python\s+\.agents\/|npx\s+vite\s+build\b)/;
const TABLE_SEPARATOR_REGEX = /^\s*\|\s*[:-][-| :]*\|\s*$/;
const TABLE_ROW_REGEX = /^\s*\|.+?\|\s*$/;

function isTablePrecededProperly(prevLine: string): boolean {
  if (prevLine === '') return true;
  if (prevLine.startsWith('#') || prevLine.startsWith('<!--')) return true;
  return TABLE_ROW_REGEX.test(prevLine);
}

export class MarkdownSyntaxAuditor extends FileScanAuditor<MarkdownSyntaxRuleId> {
constructor(roots: readonly string[] = ['.'], projectRoot?: string) {
    super({
      capabilities: {
        fix: false,
        fixPriority: false,
        lint: false,
        md: true,
        ast: false,
        changedSince: false,
        heavy: false,
        requiresBuild: false,
        postRun: false
      },
      id: 'validate_markdown_syntax',
      name: 'Markdown Syntax & NPM Script SSoT Validator',
      description: 'Comandos no autorizados o tablas mal formateadas en docs',
      family: 'documentation',
      ruleIds: MARKDOWN_SYNTAX_RULES,
      packageName: 'Doc',
      configKey: 'documentation.enabled',
      defaultConfig: { enabled: true },
      icon: '📝',
      ruleDescriptions: {
        'npm-script-exclusivity-in-docs': 'Comando directo en vez de npm run',
        'markdown-table-preceding-blank-line': 'Falta línea en blanco antes de tabla'
      },
      roots,
      allowedExtensions: new Set(['.md']),
      extraIgnorePatterns: ['scratch/**', 'dist/**', 'dev-dist/**', 'test-results/**'],
      projectRoot
    });
  }

  private checkNpmScriptViolation(line: string, trimmed: string, lineNum: number, relPath: string): void {
    const match = FORBIDDEN_DOC_COMMAND_REGEX.exec(line);
    if (!match) return;

    this.addViolation({
      ruleId: 'npm-script-exclusivity-in-docs',
      severity: 'error',
      file: relPath,
      line: lineNum,
      message: `Direct script execution '${match[0].trim()}' in documentation. Mandate requires NPM script Single Source of Truth ('npm run <script>').`,
      context: trimmed
    });
  }

  private checkTablePrecedingBlankLine(
    lines: readonly string[],
    index: number,
    trimmed: string,
    relPath: string
  ): void {
    if (index === 0) return;
    const nextLine = lines[index + 1]?.trim() || '';
    if (!TABLE_ROW_REGEX.test(trimmed) || index + 1 >= lines.length || !TABLE_SEPARATOR_REGEX.test(nextLine)) {
      return;
    }

    const prevLine = lines[index - 1]?.trim() || '';
    if (!isTablePrecededProperly(prevLine)) {
      this.addViolation({
        ruleId: 'markdown-table-preceding-blank-line',
        severity: 'warning',
        file: relPath,
        line: index + 1,
        message: 'Markdown table header must be preceded by a blank empty line for standard GFM compliance.',
        context: trimmed
      });
    }
  }

  protected override scanFile(relPath: string, content: string): void {
    const lines = content.split('\n');
    let inFencedCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const trimmed = line.trim();

      if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
        inFencedCodeBlock = !inFencedCodeBlock;
        continue;
      }

      if (this.isLineIgnored(line, ['doc-ok', 'npm-ok', 'table-ok', 'markdown-ok'])) continue;

      if (inFencedCodeBlock) {
        this.checkNpmScriptViolation(line, trimmed, i + 1, relPath);
      } else {
        this.checkTablePrecedingBlankLine(lines, i, trimmed, relPath);
      }
    }
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new MarkdownSyntaxAuditor());
