/**
 * src/analyzers/homebrew/detectors/redundantRuleEvaluatedDetector.ts
 *
 * Detects explicit `this.markRuleEvaluated('x')` stamps for a rule that the same file already
 * runs through a measuring wrapper (`runSubAuditor(Sync)`, `evaluateRule(Sync)`,
 * `declare*SubAuditor`). Those wrappers mark the rule evaluated internally, so the extra stamp is
 * redundant boilerplate that the Universal Empirical Individual Timing Mandate prohibits.
 * A stamp for a rule that is NOT wrapped (external-tool pattern) is intentionally accepted.
 */
import type { HomebrewDetector } from '../homebrewTypes.ts';
export declare const redundantRuleEvaluatedDetector: HomebrewDetector;
//# sourceMappingURL=redundantRuleEvaluatedDetector.d.ts.map