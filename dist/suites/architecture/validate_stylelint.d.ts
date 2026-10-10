/**
 * packages/auditor/src/suites/architecture/validate_stylelint.ts
 *
 * STYLELINT CSS & SCSS HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Audits stylesheets, component styles, and Vue 3 SFCs (<style scoped lang="scss">)
 * using the official Stylelint engine with stylelint-config-standard-scss,
 * stylelint-config-standard-vue, and stylelint-order.
 *
 * Performance:
 *   - Ephemeral content-hashed caching at scratch/cache/stylelint_cache.json
 *   - Multithreaded orchestration via audit_full master runner
 *   - Zero false positives on SCSS nesting, mixins, or scoped components
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* src/suites/architecture/validate_stylelint.ts
 *   npm run validate:stylelint
 */
import stylelint, { type LinterResult, type LintResult } from 'stylelint';
import { BaseAuditor } from '../../core/auditorBase.ts';
import type { GitIgnoreRequirement, FindingSeverity } from '../../core/auditContract.ts';
export declare const STYLELINT_RULES: readonly ["stylelint-issue", "css-duplicate-selectors", "css-duplicate-properties", "css-empty-blocks", "css-order-violation", "scss-syntax-issue", "scss-sass-collision-casing", "scss-strict-values"];
export type StylelintRuleId = (typeof STYLELINT_RULES)[number];
export declare function resolveStylelintConfigFile(projectRoot: string, configuredConfigFile?: string): string;
export declare function categorizeStylelintRule(ruleName: string | undefined): StylelintRuleId;
export declare function buildStylelintConfig(configFile: string, customRules?: Record<string, unknown>): stylelint.Config;
export declare function buildStylelintIgnoreGlobs(configIgnoreGlobs?: readonly string[], stylelintIgnoreGlobs?: readonly string[]): string[];
interface StylelintViolationPayload {
    ruleId: StylelintRuleId;
    severity: FindingSeverity;
    file: string;
    line: number;
    message: string;
    context: string;
    fixable?: boolean;
}
export declare const STYLELINT_BUILTIN_FIXABLE_RULES: readonly ["alpha-value-notation", "at-rule-empty-line-before", "at-rule-no-deprecated", "at-rule-no-vendor-prefix", "color-function-alias-notation", "color-function-notation", "color-hex-length", "comment-empty-line-before", "comment-whitespace-inside", "custom-property-empty-line-before", "declaration-block-no-duplicate-properties", "declaration-block-no-redundant-longhand-properties", "declaration-empty-line-before", "declaration-property-value-keyword-no-deprecated", "display-notation", "font-family-name-quotes", "font-weight-notation", "function-calc-no-unspaced-operator", "function-name-case", "function-url-quotes", "hue-degree-notation", "import-notation", "keyframe-selector-notation", "length-zero-no-unit", "lightness-notation", "media-feature-name-no-vendor-prefix", "media-feature-range-notation", "property-layout-mappings", "property-no-deprecated", "property-no-vendor-prefix", "relative-selector-nesting-notation", "rule-empty-line-before", "selector-attribute-quotes", "selector-no-deprecated", "selector-no-vendor-prefix", "selector-not-notation", "selector-pseudo-element-colon-notation", "selector-type-case", "shorthand-property-no-redundant-values", "unit-layout-mappings", "value-keyword-case", "value-keyword-layout-mappings", "value-no-vendor-prefix"];
export type StylelintBuiltinFixableRule = (typeof STYLELINT_BUILTIN_FIXABLE_RULES)[number];
export declare const STYLELINT_ORDER_FIXABLE_RULES: readonly ["order/order", "order/properties-order", "order/properties-alphabetical-order", "order/custom-properties-alphabetical-order"];
export type StylelintOrderFixableRule = (typeof STYLELINT_ORDER_FIXABLE_RULES)[number];
export declare function isStylelintRuleFixable(ruleName: string | undefined): boolean;
export declare function processStylelintResults(results: readonly LintResult[], projectRoot: string): {
    violations: StylelintViolationPayload[];
    totalErrors: number;
    totalWarnings: number;
};
export declare function persistStylelintReport(projectRoot: string, suiteId: string, filesScanned: number, totals: {
    totalErrors: number;
    totalWarnings: number;
}, results: readonly LintResult[], durationMs: number): void;
export interface StylelintAuditorOptions {
    projectRoot?: string;
    id?: string;
    name?: string;
}
export declare class StylelintAuditor extends BaseAuditor<StylelintRuleId> {
    private lastLinterResult;
    static readonly gitIgnoreEntries: readonly GitIgnoreRequirement[];
    constructor(options?: StylelintAuditorOptions);
    getLastLinterResult(): LinterResult | null;
    runAudit(): Promise<void>;
}
export {};
//# sourceMappingURL=validate_stylelint.d.ts.map