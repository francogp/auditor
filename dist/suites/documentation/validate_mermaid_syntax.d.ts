/**
 * @file validate_mermaid_syntax.ts
 * @description Sub-auditor that validates syntax and escapes in Mermaid diagrams within Markdown files
 * using the official modern Mermaid engine (mermaid.parse).
 */
import { FileScanAuditor } from '../../core/auditorBase.ts';
export declare const MERMAID_SYNTAX_RULES: readonly ["mermaid-syntax-error", "mermaid-unquoted-special-chars"];
export type MermaidSyntaxRuleId = (typeof MERMAID_SYNTAX_RULES)[number];
export interface MermaidValidationResult {
    valid: boolean;
    diagramType?: string;
    error?: {
        line: number;
        message: string;
    };
}
/**
 * Validates syntax of a Mermaid diagram block using the official Mermaid parser.
 */
export declare function validateMermaid(diagramCode: string): Promise<MermaidValidationResult>;
/**
 * Validates diagram and returns or throws an Error (for backward compatibility).
 */
export declare function validate(diagramCode: string, parseOptions?: {
    suppressErrors?: boolean;
}): Promise<{
    diagramType: string;
    valid: boolean;
} | false>;
export declare class ValidateMermaidSyntaxAuditor extends FileScanAuditor<MermaidSyntaxRuleId> {
    constructor(roots?: readonly string[], projectRoot?: string);
    private checkSpecialCharacters;
    protected scanFile(relPath: string, content: string): Promise<void>;
}
//# sourceMappingURL=validate_mermaid_syntax.d.ts.map