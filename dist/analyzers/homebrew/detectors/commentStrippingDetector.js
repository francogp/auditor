import { createLineDetector } from "../homebrewTypes.js";
//#region src/analyzers/homebrew/detectors/commentStrippingDetector.ts
/**
* src/analyzers/homebrew/detectors/commentStrippingDetector.ts
*
* Detects homebrew regular expressions for stripping comments
* instead of using canonical stripComments() from src/core/scannerUtils.ts or AuditedDocument.
*/
const commentStrippingDetector = createLineDetector({
	id: "comment-stripping",
	ruleId: "auditor-manual-comment-stripping",
	ruleDescription: "Manual comment stripping",
	checkLine(line) {
		if (line.includes("replace(") && (line.includes("\\/\\*") || line.includes("\\/\\/")) && (line.includes("comment") || line.includes("''") || line.includes("\"\"") || line.includes("`"))) return "Regex casero para remover comentarios detectado. Usa la utilidad canónica 'stripComments(code)' o 'stripCommentsAndStrings(code)' de 'src/core/scannerUtils.ts'.";
		return null;
	}
});
//#endregion
export { commentStrippingDetector };
