import { FileScanAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_error_suppression.d.ts
export type ErrorSuppressionRuleId = 'no-empty-catch' | 'no-silent-promise-catch' | 'no-silent-mock-fallbacks' | 'strict-catch-narrowing';
export declare const ERROR_SUPPRESSION_RULES: readonly ErrorSuppressionRuleId[];
export declare class ErrorSuppressionAuditor extends FileScanAuditor<ErrorSuppressionRuleId> {
  constructor(roots?: readonly string[], projectRoot?: string);
  protected scanFile(relPath: string, content: string): void;
  private forEachNonCommentMatch;
  private auditEmptyCatch;
  private auditSilentPromiseCatch;
  private auditSchemaFallbacks;
  private auditCatchNarrowing;
}
//#endregion