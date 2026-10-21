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

import type { HomebrewDetector, HomebrewFinding } from '../homebrewTypes.ts';
import { scanRuleMeasurement } from './ruleMeasurementScan.ts';

export const unmeasuredRuleDetector: HomebrewDetector = {
  id: 'unmeasured-rule',
  ruleId: 'auditor-unmeasured-rule',
  ruleDescription: 'Unmeasured individual rule',
  detect(context) {
    const scan = scanRuleMeasurement(context);
    if (scan.hasDynamicMeasurement) return [];

    const reported = new Set<string>();
    const findings: HomebrewFinding[] = [];

    for (const site of scan.violations) {
      if (scan.measured.has(site.ruleId) || reported.has(site.ruleId)) continue;
      reported.add(site.ruleId);
      findings.push({
        ruleId: 'auditor-unmeasured-rule',
        line: site.line,
        message: `Rule '${site.ruleId}' emits violations without individual timing measurement. Wrap its execution in 'this.runSubAuditorSync('${site.ruleId}', ...)', 'await this.runSubAuditor('${site.ruleId}', ...)' or 'declareFileSubAuditor('${site.ruleId}', handler)'; a standalone 'markRuleEvaluated' does not record elapsed time.`,
        context: site.ruleId,
        severity: 'error'
      });
    }

    return findings;
  }
};
