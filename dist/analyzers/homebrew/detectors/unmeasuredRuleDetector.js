import { scanRuleMeasurement } from "./ruleMeasurementScan.js";
//#region src/analyzers/homebrew/detectors/unmeasuredRuleDetector.ts
const unmeasuredRuleDetector = {
	id: "unmeasured-rule",
	ruleId: "auditor-unmeasured-rule",
	ruleDescription: "Regla sin medición individual",
	detect(context) {
		const scan = scanRuleMeasurement(context);
		if (scan.hasDynamicMeasurement) return [];
		const reported = /* @__PURE__ */ new Set();
		const findings = [];
		for (const site of scan.violations) {
			if (scan.measured.has(site.ruleId) || reported.has(site.ruleId)) continue;
			reported.add(site.ruleId);
			findings.push({
				ruleId: "auditor-unmeasured-rule",
				line: site.line,
				message: `La regla '${site.ruleId}' emite violaciones sin medición individual. Envuelve su ejecución en 'this.runSubAuditorSync('${site.ruleId}', ...)', 'await this.runSubAuditor('${site.ruleId}', ...)' o 'declareFileSubAuditor('${site.ruleId}', handler)'; un 'markRuleEvaluated' suelto no mide tiempo.`,
				context: site.ruleId,
				severity: "error"
			});
		}
		return findings;
	}
};
//#endregion
export { unmeasuredRuleDetector };
