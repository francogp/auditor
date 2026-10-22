import { FileScanAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_scss_architecture.d.ts
export declare const SCSS_ARCHITECTURE_RULES: readonly ["raw-css-in-sfc", "scss-deep-selector-abuse", "non-standard-spacing-unit", "missing-theme-token-usage", "excessive-scss-nesting"];
export type ScssArchitectureRuleId = (typeof SCSS_ARCHITECTURE_RULES)[number];
export declare class ValidateScssArchitectureAuditor extends FileScanAuditor<ScssArchitectureRuleId> {
  constructor(options?: {
    projectRoot?: string;
    fix?: boolean;
    roots?: readonly string[];
  });
  protected scanFile(relPath: string, content: string): void;
  private extractStyleBlocks;
  private auditRawCssInSfc;
  private auditScssDeepSelectorAbuse;
  private auditNonStandardSpacingUnit;
  private auditMissingThemeTokenUsage;
  private processScssLineBraces;
  private auditExcessiveScssNesting;
}
//#endregion