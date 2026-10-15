import { BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_dead_css.d.ts
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
export declare class DeadCssAuditor extends BaseAuditor<DeadCssRuleId> {
  constructor(projectRoot?: string);
  runAudit(): Promise<void>;
}
//#endregion