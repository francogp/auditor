import { scanRuleMeasurement } from "./ruleMeasurementScan.js";
// src/analyzers/homebrew/detectors/unmeasuredRuleDetector.ts
const unmeasuredRuleDetector = {
	id: "unmeasured-rule",
	ruleId: "auditor-unmeasured-rule",
	ruleDescription: "Unmeasured individual rule",
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
				message: `Rule '${site.ruleId}' emits violations without individual timing measurement. Wrap its execution in 'this.runSubAuditorSync('${site.ruleId}', ...)', 'await this.runSubAuditor('${site.ruleId}', ...)' or 'declareFileSubAuditor('${site.ruleId}', handler)'; a standalone 'markRuleEvaluated' does not record elapsed time.`,
				context: site.ruleId,
				severity: "error"
			});
		}
		return findings;
	}
};
export { unmeasuredRuleDetector };
