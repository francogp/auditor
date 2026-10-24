import { createLineDetector, isInsideStringLiteral } from "../homebrewTypes.js";
// src/analyzers/homebrew/detectors/rawConsoleDetector.ts
/**
* src/analyzers/homebrew/detectors/rawConsoleDetector.ts
*
* Detects direct uncoordinated console.log() calls inside sub-auditors and extensions
* instead of using BaseAuditor reporting methods or unifiedTheme box drawing.
*/
const rawConsoleDetector = createLineDetector({
	id: "raw-console",
	ruleId: "auditor-raw-console",
	ruleDescription: "Direct call to console.log",
	checkLine(line, _trimmed, _lineNum, context) {
		if (context.filePath.includes("/cli/") || context.filePath.startsWith("src/cli/")) return null;
		const match = /\bconsole\.(?:log|info)\s*\(/.exec(line);
		if (match) {
			if (isInsideStringLiteral(line, match.index)) return null;
			return "Direct call to 'console.log()' in sub-auditor or extension. Use 'this.addViolation()', 'this.context.setMetric()' or 'unifiedTheme' for terminal tables.";
		}
		return null;
	}
});
export { rawConsoleDetector };
