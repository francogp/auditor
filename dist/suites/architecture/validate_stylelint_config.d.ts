/**
 * src/suites/architecture/validate_stylelint_config.ts
 *
 * STYLELINT CONFIGURATION INTEGRITY VALIDATOR (Node.js 26+ Native)
 *
 * Validates that .stylelintrc.json:
 *   1. Physically exists in the project root.
 *   2. Configures the required 'stylelint-declaration-strict-value' plugin.
 *   3. Enforces the canonical 'scale-unlimited/declaration-strict-value' rule for
 *      z-index, font-size, and color to eliminate raw magic values in SCSS/CSS.
 *   4. Supports auto-repair in --fix mode.
 */
import 'stylelint-declaration-strict-value';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import type { AuditorConfigFileRequirement } from '../../core/auditContract.ts';
export type StylelintConfigRuleId = 'stylelint-config-missing' | 'stylelint-config-missing-plugin' | 'stylelint-config-missing-strict-value';
export declare const STYLELINT_CONFIG_RULES: readonly StylelintConfigRuleId[];
export declare const REQUIRED_STYLELINT_PLUGIN = "stylelint-declaration-strict-value";
export declare const REQUIRED_STRICT_VALUE_RULE = "scale-unlimited/declaration-strict-value";
export declare const REQUIRED_STRICT_PROPERTIES: readonly ["/color$/", "font-size", "z-index", "box-shadow", "border-radius", "font-family", "transition-duration", "animation-duration", "gap", "row-gap", "column-gap", "font-weight", "transition-timing-function"];
export declare const CANONICAL_IGNORE_AT_RULES: readonly ["@font-face"];
export declare const CANONICAL_IGNORE_VALUES: Readonly<Record<string, readonly string[]>>;
export declare function getMergedStrictProperties(config?: ReturnType<typeof getAuditConfig>): readonly string[];
export declare function getMergedIgnoreValues(config?: ReturnType<typeof getAuditConfig>): Record<string, readonly string[]>;
export declare function getMergedIgnoreAtRules(config?: ReturnType<typeof getAuditConfig>): readonly string[];
export declare function buildProjectStrictValueConfig(config?: ReturnType<typeof getAuditConfig>): unknown[];
export declare const CANONICAL_STRICT_VALUE_CONFIG: unknown[];
export declare const CANONICAL_STYLELINT_CONFIG_CONTENT: string;
export declare const STYLELINT_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<StylelintConfigRuleId>;
export declare class ValidateStylelintConfigAuditor extends BaseAuditor<StylelintConfigRuleId> {
    constructor(rootsOrOptions?: readonly string[] | {
        projectRoot?: string;
        fix?: boolean;
    }, maybeProjectRoot?: string);
    private auditPlugin;
    private auditStrictRule;
    runAudit(): Promise<void>;
}
export { ValidateStylelintConfigAuditor as StylelintConfigAuditor };
//# sourceMappingURL=validate_stylelint_config.d.ts.map