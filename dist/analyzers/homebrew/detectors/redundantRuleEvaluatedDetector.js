import { scanRuleMeasurement } from "./ruleMeasurementScan.js";
//#region src/analyzers/homebrew/detectors/redundantRuleEvaluatedDetector.ts
const redundantRuleEvaluatedDetector = {
	id: "redundant-rule-evaluated",
	ruleId: "auditor-redundant-rule-evaluated",
	ruleDescription: "Marca redundante de regla evaluada",
	detect(context) {
		const scan = scanRuleMeasurement(context);
		const findings = [];
		for (const site of scan.marks) {
			if (!scan.wrapped.has(site.ruleId)) continue;
			findings.push({
				ruleId: "auditor-redundant-rule-evaluated",
				line: site.line,
				message: `'markRuleEvaluated('${site.ruleId}')' es redundante: la regla ya se ejecuta con un wrapper de medición ('runSubAuditorSync', 'runSubAuditor' o 'declare*SubAuditor') que la marca como evaluada automáticamente. Elimina la llamada manual.`,
				context: site.ruleId,
				severity: "error"
			});
		}
		return findings;
	}
};
//#endregion
export { redundantRuleEvaluatedDetector };
