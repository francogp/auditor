import { HomebrewInspectionContext } from "../homebrewTypes.js";
export interface RuleSite {
  readonly ruleId: string;
  readonly line: number;
}
export interface RuleMeasurementScan {
  readonly violations: readonly RuleSite[];
  readonly marks: readonly RuleSite[];
  /** Rule ids measured by a wrapper or a duration/applicability report. */
  readonly measured: ReadonlySet<string>;
  /** Rule ids evaluated by a wrapper that also marks them evaluated internally. */
  readonly wrapped: ReadonlySet<string>;
  readonly hasDynamicMeasurement: boolean;
}
declare const EVALUATION_WRAPPER_METHOD_NAMES: readonly ["runSubAuditor", "runSubAuditorSync", "evaluateRule", "evaluateRuleSync", "declareSubAuditor", "declareFileSubAuditor", "declarePatternSubAuditor"];
export type EvaluationWrapperMethod = (typeof EVALUATION_WRAPPER_METHOD_NAMES)[number];
declare const REPORTING_METHOD_NAMES: readonly ["reportRuleDuration", "recordRuleDuration", "markRuleNotApplicable"];
export type ReportingMethod = (typeof REPORTING_METHOD_NAMES)[number];
export declare function scanRuleMeasurement(context: HomebrewInspectionContext): RuleMeasurementScan;
export {};