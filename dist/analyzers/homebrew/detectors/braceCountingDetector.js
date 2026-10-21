import { createLineDetector } from "../homebrewTypes.js";
//#region src/analyzers/homebrew/detectors/braceCountingDetector.ts
/**
* src/analyzers/homebrew/detectors/braceCountingDetector.ts
*
* Detects manual brace or parenthesis depth counting loops
* instead of using canonical block helpers in src/core/scannerUtils.ts.
*/
const braceCountingDetector = createLineDetector({
	id: "brace-counting",
	ruleId: "auditor-manual-brace-counting",
	ruleDescription: "Homebrew brace or block counting",
	checkLine(line) {
		if (/\b(?:let|var)\s+(?:parenDepth|braceDepth|braceCount)\s*=\s*0\b/.test(line) || /\b(?:parenDepth|braceDepth)\+\+/.test(line)) return "Conteo manual de profundidad de llaves o paréntesis detectado. Usa helpers canónicos como 'findMatchingBrace()' o 'extractBlock()' de 'src/core/scannerUtils.ts'.";
		return null;
	}
});
//#endregion
export { braceCountingDetector };
