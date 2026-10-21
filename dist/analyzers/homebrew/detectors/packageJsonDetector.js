import { createLineDetector } from "../homebrewTypes.js";
//#region src/analyzers/homebrew/detectors/packageJsonDetector.ts
/**
* src/analyzers/homebrew/detectors/packageJsonDetector.ts
*
* Detects manual reading or JSON parsing of package.json instead of canonical getPackageJson().
*/
const packageJsonDetector = createLineDetector({
	id: "package-json",
	ruleId: "auditor-manual-package-json",
	ruleDescription: "Manual package.json reading",
	checkLine(line) {
		if ((line.includes("readFileSync(") && line.includes("package.json") || line.includes("JSON.parse(") && line.includes("package.json") && !line.includes("getPackageJson") || /readFileSync\([^)]*\)/.test(line) && line.includes("pkgPath")) && !line.includes("getPackageJson(")) return "Lectura manual de 'package.json' detectada. Usa la utilidad canónica 'getPackageJson(projectRoot)' de 'src/core/packageJson.ts'.";
		return null;
	}
});
//#endregion
export { packageJsonDetector };
