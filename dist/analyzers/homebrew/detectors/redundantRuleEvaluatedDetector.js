/**
 * src/analyzers/homebrew/detectors/redundantRuleEvaluatedDetector.ts
 *
 * Detects explicit `this.markRuleEvaluated('x')` stamps for a rule that the same file already
 * runs through a measuring wrapper (`runSubAuditor(Sync)`, `evaluateRule(Sync)`,
 * `declare*SubAuditor`). Those wrappers mark the rule evaluated internally, so the extra stamp is
 * redundant boilerplate that the Universal Empirical Individual Timing Mandate prohibits.
 * A stamp for a rule that is NOT wrapped (external-tool pattern) is intentionally accepted.
 */
import { scanRuleMeasurement } from "./ruleMeasurementScan.js";
export const redundantRuleEvaluatedDetector = {
    id: 'redundant-rule-evaluated',
    ruleId: 'auditor-redundant-rule-evaluated',
    ruleDescription: 'Marca redundante de regla evaluada',
    detect(context) {
        const scan = scanRuleMeasurement(context);
        const findings = [];
        for (const site of scan.marks) {
            if (!scan.wrapped.has(site.ruleId))
                continue;
            findings.push({
                ruleId: 'auditor-redundant-rule-evaluated',
                line: site.line,
                message: `'markRuleEvaluated('${site.ruleId}')' es redundante: la regla ya se ejecuta con un wrapper de medición ('runSubAuditorSync', 'runSubAuditor' o 'declare*SubAuditor') que la marca como evaluada automáticamente. Elimina la llamada manual.`,
                context: site.ruleId,
                severity: 'error'
            });
        }
        return findings;
    }
};
//# sourceMappingURL=redundantRuleEvaluatedDetector.js.map