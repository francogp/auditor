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
	ruleDescription: "Isolated TypeScript AST creation",
	checkLine(line, _trimmed, _lineNum, _context) {
		if (line.includes("ts.createSourceFile(")) return "Direct call to 'ts.createSourceFile()'. Use 'this.context.getAst()', 'SharedAstContext', 'FileScanAuditor' or 'AuditedDocument.getScriptAst()' to cache and unify the AST.";
		return null;
	}
});
//#endregion
export { tsAstDetector };
