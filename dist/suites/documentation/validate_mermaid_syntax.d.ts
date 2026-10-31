import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
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
export declare class ValidateMermaidSyntaxAuditor extends FileScanAuditor<MermaidSyntaxRuleId> {
  constructor(options?: FileScanRootsOptions);
  private fixMermaidLine;
  private checkSpecialCharacters;
  private validateDiagramBlock;
  private processMermaidContentLine;
  protected scanFile(relPath: string, content: string): Promise<void>;
}