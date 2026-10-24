import { BaseAuditor } from "../../core/auditorBase.js";
export type DeadCssRuleId = 'dead-scoped-css';
export declare const DEAD_CSS_RULES: readonly DeadCssRuleId[];
export declare const DEFAULT_GLOBAL_UTILITY_CLASSES: Set<string>;
export declare function getEffectiveGlobalUtilityClasses(projectRoot?: string): ReadonlySet<string>;
export interface ParsedScopedCssRule {
  readonly line: number;
  readonly selector: string;
  readonly rawBlock: string;
}
export declare function extractClassNamesFromSelector(selector: string): string[];
export declare function extractScopedRulesFromVueContent(rawContent: string): ParsedScopedCssRule[];
export interface DeadCssAuditorOptions {
  readonly projectRoot?: string;
}
export declare class DeadCssAuditor extends BaseAuditor<DeadCssRuleId> {
  constructor(options?: DeadCssAuditorOptions);
  runAudit(): Promise<void>;
}