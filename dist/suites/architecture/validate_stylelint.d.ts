import { FindingSeverity, GitIgnoreRequirement, RuleFixContext } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
import stylelint, { LintResult, LinterResult } from "stylelint";
export declare const STYLELINT_RULES: readonly ["stylelint-issue", "css-duplicate-selectors", "css-duplicate-properties", "css-empty-blocks", "css-order-violation", "scss-syntax-issue", "scss-sass-collision-casing", "scss-strict-values"];
export type StylelintRuleId = (typeof STYLELINT_RULES)[number];
export declare function resolveStylelintConfigFile(projectRoot: string, configuredConfigFile?: string): string;
export declare function categorizeStylelintRule(ruleName: string | undefined): StylelintRuleId;
export declare function buildStylelintConfig(configFile: string, customRules?: Record<string, unknown>): stylelint.Config;
export declare function buildStylelintIgnoreGlobs(configIgnoreGlobs?: readonly string[], stylelintIgnoreGlobs?: readonly string[], exemptPaths?: readonly string[], exemptFiles?: readonly string[]): string[];
interface StylelintViolationPayload {
  ruleId: StylelintRuleId;
  severity: FindingSeverity;
  file: string;
  line: number;
  message: string;
  context: string;
  fixable?: boolean;
}
export declare function repairDeprecatedWordBreak(content: string): {
  modified: boolean;
  content: string;
};
export declare function repairDeprecatedCssPropertiesInRoots(projectRoot: string, roots: readonly string[]): number;
export declare const STYLELINT_BUILTIN_FIXABLE_RULES: readonly ["alpha-value-notation", "at-rule-empty-line-before", "at-rule-no-vendor-prefix", "color-function-alias-notation", "color-function-notation", "color-hex-length", "comment-empty-line-before", "comment-whitespace-inside", "custom-property-empty-line-before", "declaration-block-no-duplicate-properties", "declaration-block-no-redundant-longhand-properties", "declaration-empty-line-before", "declaration-property-value-keyword-no-deprecated", "display-notation", "font-family-name-quotes", "font-weight-notation", "function-calc-no-unspaced-operator", "function-name-case", "function-url-quotes", "hue-degree-notation", "import-notation", "keyframe-selector-notation", "length-zero-no-unit", "lightness-notation", "media-feature-name-no-vendor-prefix", "media-feature-range-notation", "property-layout-mappings", "property-no-vendor-prefix", "relative-selector-nesting-notation", "rule-empty-line-before", "selector-attribute-quotes", "selector-no-vendor-prefix", "selector-not-notation", "selector-pseudo-element-colon-notation", "selector-type-case", "shorthand-property-no-redundant-values", "unit-layout-mappings", "value-keyword-case", "value-keyword-layout-mappings", "value-no-vendor-prefix"];
export type StylelintBuiltinFixableRule = (typeof STYLELINT_BUILTIN_FIXABLE_RULES)[number];
export declare const STYLELINT_ORDER_FIXABLE_RULES: readonly ["order/order", "order/properties-order", "order/properties-alphabetical-order", "order/custom-properties-alphabetical-order"];
export type StylelintOrderFixableRule = (typeof STYLELINT_ORDER_FIXABLE_RULES)[number];
export declare function isStylelintRuleFixable(ruleName: string | undefined): boolean;
export declare function processStylelintResults(results: readonly LintResult[], projectRoot: string, isFixMode?: boolean): {
  violations: StylelintViolationPayload[];
  totalErrors: number;
  totalWarnings: number;
};
export declare function persistStylelintReport(projectRoot: string, suiteId: string, filesScanned: number, totals: {
  totalErrors: number;
  totalWarnings: number;
}, results: readonly LintResult[], durationMs: number): void;
export declare function fixStylelint(context: RuleFixContext<StylelintRuleId>): Promise<boolean>;
export interface StylelintAuditorOptions {
  readonly projectRoot?: string;
  readonly id?: string;
  readonly name?: string;
}
export declare class StylelintAuditor extends BaseAuditor<StylelintRuleId> {
  private lastLinterResult;
  static readonly gitIgnoreEntries: readonly GitIgnoreRequirement[];
  constructor(options?: StylelintAuditorOptions);
  getLastLinterResult(): LinterResult | null;
  runAudit(): Promise<void>;
}
export { StylelintAuditor as ValidateStylelintAuditor };