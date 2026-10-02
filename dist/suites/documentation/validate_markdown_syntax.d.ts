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
import { FileScanAuditor } from '../../core/auditorBase.ts';
export type MarkdownSyntaxRuleId = 'npm-script-exclusivity-in-docs' | 'markdown-table-preceding-blank-line';
export declare const MARKDOWN_SYNTAX_RULES: readonly MarkdownSyntaxRuleId[];
export declare class MarkdownSyntaxAuditor extends FileScanAuditor<MarkdownSyntaxRuleId> {
    constructor(roots?: readonly string[], projectRoot?: string);
    private checkNpmScriptViolation;
    private checkTablePrecedingBlankLine;
    protected scanFile(relPath: string, content: string): void;
}
//# sourceMappingURL=validate_markdown_syntax.d.ts.map