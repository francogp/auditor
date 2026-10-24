import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
export type ErrorSuppressionRuleId = 'no-empty-catch' | 'no-silent-promise-catch' | 'no-silent-mock-fallbacks' | 'strict-catch-narrowing';
export declare const ERROR_SUPPRESSION_RULES: readonly ErrorSuppressionRuleId[];
export declare class ErrorSuppressionAuditor extends FileScanAuditor<ErrorSuppressionRuleId> {
  constructor(options?: FileScanRootsOptions);
  protected scanFile(relPath: string, content: string): void;
  private forEachNonCommentMatch;
  private auditEmptyCatch;
  private auditSilentPromiseCatch;
  private auditSchemaFallbacks;
  private auditCatchNarrowing;
}