import { createLineDetector } from "../homebrewTypes.js";
//#region src/analyzers/homebrew/detectors/tsAstDetector.ts
/**
* src/analyzers/homebrew/detectors/tsAstDetector.ts
*
* Detects direct ts.createSourceFile() calls in sub-auditors and analyzers
* instead of leveraging SharedAstContext, this.context.getAst(), or AuditedDocument.getScriptAst().
*/
const tsAstDetector = createLineDetector({
	id: "ts-ast",
	ruleId: "auditor-manual-ts-ast",
	ruleDescription: "Creación aislada de AST TypeScript",
	checkLine(line, trimmed, lineNum, context) {
		if (trimmed.includes("ast-ok") || trimmed.includes("homebrew-ok")) return null;
		const prevLine = lineNum > 1 ? context.lines[lineNum - 2]?.trim() : "";
		if (prevLine && (prevLine.includes("ast-ok") || prevLine.includes("homebrew-ok"))) return null;
		if (line.includes("ts.createSourceFile(")) return "Llamada directa a 'ts.createSourceFile()'. Usa 'this.context.getAst()', 'SharedAstContext', 'FileScanAuditor' o 'AuditedDocument.getScriptAst()' para cachear y unificar el AST.";
		return null;
	}
});
//#endregion
export { tsAstDetector };
