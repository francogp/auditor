import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { AuditorConfigFileRequirement } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
import "stylelint-declaration-strict-value";
export type StylelintConfigRuleId = 'stylelint-config-missing' | 'stylelint-config-missing-plugin' | 'stylelint-config-missing-strict-value' | 'stylelint-config-missing-order';
export declare const STYLELINT_CONFIG_RULES: readonly StylelintConfigRuleId[];
export declare const REQUIRED_STYLELINT_PLUGIN = "stylelint-declaration-strict-value";
export declare const REQUIRED_ORDER_PLUGIN = "stylelint-order";
export declare const REQUIRED_STRICT_VALUE_RULE = "scale-unlimited/declaration-strict-value";
export declare const REQUIRED_ORDER_RULE = "order/order";
export declare const CANONICAL_ORDER_CONFIG: readonly unknown[];
export declare function validateOrderHasBlockPartitioning(order: unknown): {
  valid: boolean;
  reason?: string;
};
export declare const REQUIRED_STRICT_PROPERTIES: readonly ["/color$/", "font-size", "z-index", "box-shadow", "border-radius", "font-family", "transition-duration", "animation-duration", "gap", "row-gap", "column-gap", "font-weight", "transition-timing-function"];
export declare const CANONICAL_IGNORE_AT_RULES: readonly ["@font-face"];
export declare const CANONICAL_IGNORE_VALUES: Readonly<Record<string, readonly string[]>>;
export declare function getMergedStrictProperties(config?: ReturnType<typeof getAuditConfig>): readonly string[];
export declare function getMergedIgnoreValues(config?: ReturnType<typeof getAuditConfig>): Record<string, readonly string[]>;
export declare function getMergedIgnoreAtRules(config?: ReturnType<typeof getAuditConfig>): readonly string[];
export declare function buildProjectStrictValueConfig(config?: ReturnType<typeof getAuditConfig>): unknown[];
export declare const CANONICAL_STRICT_VALUE_CONFIG: unknown[];
export declare const AUDITOR_STYLELINT_EXTENDS_PATH = "./node_modules/@francogp/auditor/.stylelintrc.json";
export declare const CANONICAL_STYLELINT_CONFIG_CONTENT: string;
export declare const STYLELINT_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<StylelintConfigRuleId>;
export declare function extendsAuditorConfig(parsedConfig: Record<string, unknown>): boolean;
export interface StylelintConfigAuditorOptions {
  readonly projectRoot?: string;
}
export declare class ValidateStylelintConfigAuditor extends BaseAuditor<StylelintConfigRuleId> {
  constructor(options?: StylelintConfigAuditorOptions);
  private auditPlugin;
  private auditOrderRule;
  private auditStrictRule;
  runAudit(): Promise<void>;
}
export { ValidateStylelintConfigAuditor as StylelintConfigAuditor };