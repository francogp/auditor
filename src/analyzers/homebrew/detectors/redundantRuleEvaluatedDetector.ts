/**
 * src/analyzers/homebrew/detectors/redundantRuleEvaluatedDetector.ts
 *
 * Detects explicit `this.markRuleEvaluated('x')` stamps for a rule that the same file already
 * runs through a measuring wrapper (`runSubAuditor(Sync)`, `evaluateRule(Sync)`,
 * `declare*SubAuditor`). Those wrappers mark the rule evaluated internally, so the extra stamp is
 * redundant boilerplate that the Universal Empirical Individual Timing Mandate prohibits.
 * A stamp for a rule that is NOT wrapped (external-tool pattern) is intentionally accepted.
 */

import type { HomebrewDetector, HomebrewFinding } from '../homebrewTypes.ts';
import { scanRuleMeasurement } from './ruleMeasurementScan.ts';

export const redundantRuleEvaluatedDetector: HomebrewDetector = {
  id: 'redundant-rule-evaluated',
  ruleId: 'auditor-redundant-rule-evaluated',
  ruleDescription: 'Redundant evaluated rule mark',
  detect(context) {
    const scan = scanRuleMeasurement(context);
    const findings: HomebrewFinding[] = [];

    for (const site of scan.marks) {
      if (!scan.wrapped.has(site.ruleId)) continue;
      findings.push({
        ruleId: 'auditor-redundant-rule-evaluated',
        line: site.line,
        message: `'markRuleEvaluated('${site.ruleId}')' is redundant: the rule already executes within a timing wrapper ('runSubAuditorSync', 'runSubAuditor' or 'declare*SubAuditor') that marks it as evaluated automatically. Remove the manual call.`,
        context: site.ruleId,
        severity: 'error'
      });
    }

    return findings;
  }
};
