import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
export type LineHeightRuleId = 'line-height-overlap';
export declare const TYPOGRAPHY_LINE_HEIGHT_RULES: readonly LineHeightRuleId[];
export declare class TypographyLineHeightAuditor extends FileScanAuditor<LineHeightRuleId> {
  private totalRulesChecked;
  constructor(options?: FileScanRootsOptions);
  private checkBlockLine;
  protected scanFile(relPath: string, content: string): void;
  runAudit(): Promise<void>;
}