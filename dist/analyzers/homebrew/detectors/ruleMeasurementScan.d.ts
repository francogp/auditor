/**
 * src/analyzers/homebrew/detectors/ruleMeasurementScan.ts
 *
 * Shared AST scan used by the rule-measurement detectors (`auditor-unmeasured-rule`,
 * `auditor-redundant-rule-evaluated`). Parses each inspected file once (cached per
 * inspection context) through the canonical SharedAstContext and cross-references:
 *   - violation sites:  `this.addViolation({ ruleId: 'literal', ... })`
 *   - evaluation wrappers (mark the rule evaluated AND time it): runSubAuditor(Sync),
 *     evaluateRule(Sync), declareSubAuditor, declareFileSubAuditor, declarePatternSubAuditor
 *   - other measurement sources: reportRuleDuration, recordRuleDuration, markRuleNotApplicable
 *   - explicit stamps: `this.markRuleEvaluated('literal')`
 *
 * Only string-literal rule ids are reasoned about. Whenever a measurement call receives a
 * non-literal rule id (e.g. a `for (const r of this.ruleIds)` loop) the scan reports
 * `hasDynamicMeasurement` so detectors abstain instead of guessing.
 */
import type { HomebrewInspectionContext } from '../homebrewTypes.ts';
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
//# sourceMappingURL=ruleMeasurementScan.d.ts.map