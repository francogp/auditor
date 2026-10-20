import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
//#region src/suites/documentation/validate_markdown_syntax.d.ts
export type MarkdownSyntaxRuleId = 'npm-script-exclusivity-in-docs' | 'markdown-table-preceding-blank-line';
export declare const MARKDOWN_SYNTAX_RULES: readonly MarkdownSyntaxRuleId[];
export declare class MarkdownSyntaxAuditor extends FileScanAuditor<MarkdownSyntaxRuleId> {
  constructor(options?: FileScanRootsOptions);
  private checkNpmScriptViolation;
  private checkTablePrecedingBlankLine;
  protected scanFile(relPath: string, content: string): void;
}
//#endregion