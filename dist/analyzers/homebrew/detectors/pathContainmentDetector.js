import { createLineDetector } from "../homebrewTypes.js";
//#region src/analyzers/homebrew/detectors/pathContainmentDetector.ts
/**
* src/analyzers/homebrew/detectors/pathContainmentDetector.ts
*
* Detects manual startsWith('..') path escape checks
* instead of using canonical isPathContained() or safeResolve() from src/core/safePath.ts.
*/
const pathContainmentDetector = createLineDetector({
	id: "path-containment",
	ruleId: "auditor-manual-path-containment",
	ruleDescription: "Validación manual de rutas CWE-22",
	checkLine(line, _trimmed, _lineNum, context) {
		if (context.filePath.includes("validate_native_paths.ts")) return null;
		if ((line.includes("startsWith('..')") || line.includes("startsWith(\"..\")")) && (line.includes("relative(") || line.includes("path") || line.includes("file")) && !line.includes("isPathContained(")) return "Comprobación manual de contención o escape de ruta (CWE-22) con 'startsWith(\"..')'. Usa 'isPathContained(baseDir, targetPath)' o 'safeResolve()' de 'src/core/safePath.ts'.";
		return null;
	}
});
//#endregion
export { pathContainmentDetector };
