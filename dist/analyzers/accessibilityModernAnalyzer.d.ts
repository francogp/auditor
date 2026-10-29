import ts from "typescript";
export declare const MODERN_ACCESSIBILITY_RULES: readonly ["a11y-no-positive-tabindex", "a11y-no-aria-hidden-focusable", "a11y-svg-accessibility", "a11y-iframe-title-and-scroll", "forms-identifier-input-type", "forms-autocomplete-hygiene", "html-dialog-popover-exclusivity"];
export type ModernAccessibilityRuleId = (typeof MODERN_ACCESSIBILITY_RULES)[number];
export interface ModernA11yFinding {
  readonly ruleId: ModernAccessibilityRuleId;
  readonly line: number;
  readonly message: string;
  readonly context: string;
  readonly fixable: boolean;
}
export interface ModernA11yAnalysisResult {
  readonly findings: readonly ModernA11yFinding[];
  readonly fixedContent?: string;
}
declare const INTERACTIVE_CONTAINER_TAGS_LIST: readonly ["button", "a", "label"];
export type InteractiveContainerTag = (typeof INTERACTIVE_CONTAINER_TAGS_LIST)[number];
export declare function analyzeModernAccessibility(templateContent: string, scriptAst: ts.SourceFile | undefined, lineOffset: number, enableFix: boolean): ModernA11yAnalysisResult;
export declare function fixViewportZoomLockContent(htmlContent: string): string | undefined;
export {};