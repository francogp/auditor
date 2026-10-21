import { scanRuleMeasurement } from "./ruleMeasurementScan.js";
//#region src/analyzers/homebrew/detectors/redundantRuleEvaluatedDetector.ts
const redundantRuleEvaluatedDetector = {
	id: "redundant-rule-evaluated",
	ruleId: "auditor-redundant-rule-evaluated",
	ruleDescription: "Redundant evaluated rule mark",
	detect(context) {
		const scan = scanRuleMeasurement(context);
		const findings = [];
		for (const site of scan.marks) {
			if (!scan.wrapped.has(site.ruleId)) continue;
			findings.push({
				ruleId: "auditor-redundant-rule-evaluated",
				line: site.line,
				message: `'markRuleEvaluated('${site.ruleId}')' is redundant: the rule already executes within a timing wrapper ('runSubAuditorSync', 'runSubAuditor' or 'declare*SubAuditor') that marks it as evaluated automatically. Remove the manual call.`,
				context: site.ruleId,
				severity: "error"
			});
		}
		return findings;
	}
};
//#endregion
export { redundantRuleEvaluatedDetector };
