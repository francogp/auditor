/**
 * src/analyzers/homebrew/detectors/unmeasuredRuleDetector.ts
 *
 * Detects rules that emit violations (`this.addViolation({ ruleId: 'x', ... })`) without ever
 * being measured individually: no `runSubAuditor(Sync)`, `evaluateRule(Sync)`, `declare*SubAuditor`,
 * `reportRuleDuration` or `markRuleNotApplicable` call references that rule id. Such rules show a
 * fake `(0 ms)` badge (or are stamped with a bare `markRuleEvaluated`) and break the Universal
 * Empirical Individual Timing Mandate. Typical legacy shapes: a rule helper invoked directly from
 * `scanFile`, or a monolithic `runAudit` that stamps rules up front and loops over violations without wrappers.
 */
import type { HomebrewDetector } from '../homebrewTypes.ts';
export declare const unmeasuredRuleDetector: HomebrewDetector;
//# sourceMappingURL=unmeasuredRuleDetector.d.ts.map