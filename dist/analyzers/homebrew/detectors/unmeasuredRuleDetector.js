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
import { scanRuleMeasurement } from "./ruleMeasurementScan.js";
export const unmeasuredRuleDetector = {
    id: 'unmeasured-rule',
    ruleId: 'auditor-unmeasured-rule',
    ruleDescription: 'Regla sin medición individual',
    detect(context) {
        const scan = scanRuleMeasurement(context);
        if (scan.hasDynamicMeasurement)
            return [];
        const reported = new Set();
        const findings = [];
        for (const site of scan.violations) {
            if (scan.measured.has(site.ruleId) || reported.has(site.ruleId))
                continue;
            reported.add(site.ruleId);
            findings.push({
                ruleId: 'auditor-unmeasured-rule',
                line: site.line,
                message: `La regla '${site.ruleId}' emite violaciones sin medición individual. Envuelve su ejecución en 'this.runSubAuditorSync('${site.ruleId}', ...)', 'await this.runSubAuditor('${site.ruleId}', ...)' o 'declareFileSubAuditor('${site.ruleId}', handler)'; un 'markRuleEvaluated' suelto no mide tiempo.`,
                context: site.ruleId,
                severity: 'error'
            });
        }
        return findings;
    }
};
//# sourceMappingURL=unmeasuredRuleDetector.js.map