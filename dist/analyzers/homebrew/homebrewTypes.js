//#region src/analyzers/homebrew/homebrewTypes.ts
const AUDITOR_HOMEBREW_RULES = [
	"auditor-manual-package-json",
	"auditor-manual-vue-sfc-regex",
	"auditor-manual-ts-ast",
	"auditor-raw-console",
	"auditor-manual-comment-stripping",
	"auditor-manual-brace-counting",
	"auditor-manual-file-walker",
	"auditor-homebrew-predicates",
	"auditor-manual-rule-timing",
	"auditor-hardcoded-config",
	"auditor-manual-step-logging",
	"auditor-unmeasured-rule",
	"auditor-redundant-rule-evaluated",
	"auditor-third-party-tool-contract",
	"auditor-inefficient-file-scan"
];
function createLineDetector(options) {
	return {
		id: options.id,
		ruleId: options.ruleId,
		ruleDescription: options.ruleDescription,
		detect(context) {
			if (context.filePath.includes("core/")) return [];
			const findings = [];
			context.lines.forEach((line, idx) => {
				const lineNum = idx + 1;
				const trimmed = line.trim();
				if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
				const result = options.checkLine(line, trimmed, lineNum, context);
				if (result) {
					if (typeof result === "string") findings.push({
						ruleId: options.ruleId,
						line: lineNum,
						message: result,
						context: trimmed,
						severity: "error"
					});
					else findings.push({
						ruleId: options.ruleId,
						line: lineNum,
						message: result.message,
						context: result.context ?? trimmed,
						severity: result.severity ?? "error"
					});
				}
			});
			return findings;
		}
	};
}
/**
* Checks whether an index within a line of code sits inside an open string literal.
*/
function isInsideStringLiteral(line, index) {
	const before = line.slice(0, index);
	const singleQuotes = (before.match(/'/g) || []).length % 2 === 1;
	const doubleQuotes = (before.match(/"/g) || []).length % 2 === 1;
	const backticks = (before.match(/`/g) || []).length % 2 === 1;
	return singleQuotes || doubleQuotes || backticks;
}
//#endregion
export { AUDITOR_HOMEBREW_RULES, createLineDetector, isInsideStringLiteral };
