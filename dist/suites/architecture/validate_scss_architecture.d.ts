import { FileScanAuditor } from "../../core/auditorBase.js";
export declare const SCSS_ARCHITECTURE_RULES: readonly ["raw-css-in-sfc", "scss-deep-selector-abuse", "non-standard-spacing-unit", "missing-theme-token-usage", "excessive-scss-nesting", "scss-viewport-overflow-and-dvh", "scss-overflow-clip-margin-trap", "scss-prefer-user-invalid", "scss-focus-outline-removal", "typography-unclamped-viewport-font", "scss-flexbox-dead-properties", "scss-universal-expensive-selectors", "dark-mode-color-scheme-missing"];
export type ScssArchitectureRuleId = (typeof SCSS_ARCHITECTURE_RULES)[number];
export type ScssBlockKind = 'selector' | 'atrule';
export declare class ValidateScssArchitectureAuditor extends FileScanAuditor<ScssArchitectureRuleId> {
  constructor(options?: {
    projectRoot?: string;
    fix?: boolean;
    roots?: readonly string[];
  });
  protected scanFile(relPath: string, content: string): void;
  private auditStyleBlockRules;
  private auditRawCssInSfc;
  private auditScssDeepSelectorAbuse;
  private auditNonStandardSpacingUnit;
  private auditMissingThemeTokenUsage;
  private processScssLineBraces;
  private auditExcessiveScssNesting;
}