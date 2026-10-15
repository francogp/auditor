import { FileScanAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_typography_line_height.d.ts
export type LineHeightRuleId = 'line-height-overlap';
export declare const TYPOGRAPHY_LINE_HEIGHT_RULES: readonly LineHeightRuleId[];
export declare class TypographyLineHeightAuditor extends FileScanAuditor<LineHeightRuleId> {
  private totalRulesChecked;
  constructor(roots?: readonly string[], projectRoot?: string);
  private checkBlockLine;
  protected scanFile(relPath: string, content: string): void;
  runAudit(): Promise<void>;
}
//#endregion