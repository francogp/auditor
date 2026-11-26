import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
export declare const SCSS_ARCHITECTURE_RULES: readonly ["raw-css-in-sfc", "scss-deep-selector-abuse", "non-standard-spacing-unit", "missing-theme-token-usage", "excessive-scss-nesting", "scss-viewport-overflow-and-dvh", "scss-overflow-clip-margin-trap", "scss-prefer-user-invalid", "scss-focus-outline-removal", "typography-unclamped-viewport-font", "scss-flexbox-dead-properties", "scss-universal-expensive-selectors", "dark-mode-color-scheme-missing", "scss-transition-all", "scss-layout-property-animation", "scss-will-change-in-keyframes", "scss-gsap-transform-important", "scss-gsap-smooth-scroll", "scss-gsap-stagger-for-loop", "scss-gsap-auto-alpha-candidate", "scss-gsap-svg-stroke-animation"];
export type ScssArchitectureRuleId = (typeof SCSS_ARCHITECTURE_RULES)[number];
export type ScssBlockKind = 'selector' | 'atrule';
export declare class ValidateScssArchitectureAuditor extends FileScanAuditor<ScssArchitectureRuleId> {
  private readonly hasGsap;
  private gsapNotApplicableMarked;
  constructor(options?: FileScanRootsOptions);
  protected scanFile(relPath: string, content: string): void;
  private auditStyleBlockRules;
  private auditRawCssInSfc;
  private auditScssDeepSelectorAbuse;
  private auditNonStandardSpacingUnit;
  private auditMissingThemeTokenUsage;
  private processScssLineBraces;
  private auditExcessiveScssNesting;
}