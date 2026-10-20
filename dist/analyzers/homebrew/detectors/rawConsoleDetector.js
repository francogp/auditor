import { createLineDetector, isInsideStringLiteral } from "../homebrewTypes.js";
//#region src/analyzers/homebrew/detectors/rawConsoleDetector.ts
/**
* src/analyzers/homebrew/detectors/rawConsoleDetector.ts
*
* Detects direct uncoordinated console.log() calls inside sub-auditors and extensions
* instead of using BaseAuditor reporting methods or unifiedTheme box drawing.
*/
const rawConsoleDetector = createLineDetector({
	id: "raw-console",
	ruleId: "auditor-raw-console",
	ruleDescription: "Llamada directa a console.log",
	checkLine(line, _trimmed, _lineNum, context) {
		if (context.filePath.includes("/cli/") || context.filePath.startsWith("src/cli/")) return null;
		if (line.includes("// console-ok:")) return null;
		const match = /\bconsole\.(?:log|info)\s*\(/.exec(line);
		if (match) {
			if (isInsideStringLiteral(line, match.index)) return null;
			return "Llamada directa a 'console.log()' en subauditor o extensión. Usa 'this.addViolation()', 'this.context.setMetric()' o 'unifiedTheme' para tablas terminales.";
		}
		return null;
	}
});
//#endregion
export { rawConsoleDetector };
