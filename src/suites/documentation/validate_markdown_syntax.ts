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

import path from 'node:path';
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
const TABLE_SEPARATOR_REGEX = /^\s*\|(?:\s*[:-]+[-| :]*)\|\s*$/;
const TABLE_ROW_REGEX = /^\s*\|.+?\|\s*$/;

export class MarkdownSyntaxAuditor extends FileScanAuditor<MarkdownSyntaxRuleId> {
  constructor(roots: readonly string[] = ['.'], projectRoot?: string) {
    super({
      id: 'validate_markdown_syntax',
      name: 'Markdown Syntax & NPM Script SSoT Validator',
      description: 'Comandos no autorizados o tablas mal formateadas en docs',
      family: 'documentation',
      ruleIds: MARKDOWN_SYNTAX_RULES,
      packageName: 'Doc',
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

      // Rule 1: npm-script-exclusivity-in-docs
      if (inFencedCodeBlock) {
        const match = FORBIDDEN_DOC_COMMAND_REGEX.exec(line);
        if (match) {
          this.addViolation({
            ruleId: 'npm-script-exclusivity-in-docs',
            severity: 'error',
            file: relPath,
            line: i + 1,
            message: `Direct script execution '${match[0].trim()}' in documentation. Mandate requires NPM script Single Source of Truth ('npm run <script>').`,
            context: trimmed
          });
        }
      } else {
        // Rule 2: markdown-table-preceding-blank-line
        const nextLine = lines[i + 1]?.trim() || '';
        if (TABLE_ROW_REGEX.test(trimmed) && i + 1 < lines.length && TABLE_SEPARATOR_REGEX.test(nextLine)) {
          if (i > 0) {
            const prevLine = lines[i - 1]?.trim() || '';
            const isPrevBlank = prevLine === '';
            const isPrevHeading = prevLine.startsWith('#');
            const isPrevHtmlComment = prevLine.startsWith('<!--');
            const isPrevTable = TABLE_ROW_REGEX.test(prevLine);

            if (!isPrevBlank && !isPrevHeading && !isPrevHtmlComment && !isPrevTable) {
              this.addViolation({
                ruleId: 'markdown-table-preceding-blank-line',
                severity: 'warning',
                file: relPath,
                line: i + 1,
                message: `Markdown table header must be preceded by a blank empty line for standard GFM compliance.`,
                context: trimmed
              });
            }
          }
        }
      }
    }
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new MarkdownSyntaxAuditor());
}
