/**
 * @file validate_mermaid_syntax.ts
 * @description Sub-auditor that validates syntax and escapes in Mermaid diagrams within Markdown files.
 */
import { FileScanAuditor } from '../../core/auditorBase.ts';
export declare const MERMAID_SYNTAX_RULES: readonly ["mermaid-syntax-error", "mermaid-unquoted-special-chars"];
export type MermaidSyntaxRuleId = (typeof MERMAID_SYNTAX_RULES)[number];
export declare class ValidateMermaidSyntaxAuditor extends FileScanAuditor<MermaidSyntaxRuleId> {
    constructor(roots?: readonly string[], projectRoot?: string);
    private checkSpecialCharacters;
    protected scanFile(relPath: string, content: string): Promise<void>;
}
//# sourceMappingURL=validate_mermaid_syntax.d.ts.map