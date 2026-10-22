import { createLineDetector } from "../homebrewTypes.js";
//#region src/analyzers/homebrew/detectors/predicatesDetector.ts
/**
* src/analyzers/homebrew/detectors/predicatesDetector.ts
*
* Detects homebrew test path and repository identity predicates (.includes('.spec.'), endsWith('/auditor'))
* instead of canonical isTestPath() and isSelfProviderProject().
*/
const predicatesDetector = createLineDetector({
	id: "predicates",
	ruleId: "auditor-homebrew-predicates",
	ruleDescription: "Homebrew path or test predicates",
	checkLine(line, _trimmed, _lineNum, context) {
		const hasHomebrewTestCheck = (line.includes("includes('.spec.')") || line.includes("includes('.test.')") || line.includes("includes(\".spec.\")") || line.includes("includes(\".test.\")")) && !line.includes("isTestPath(") && !context.filePath.includes("auditTestPredicates");
		const hasHomebrewSelfRepoCheck = line.includes("endsWith('/auditor')") || line.includes("endsWith(\"/auditor\")");
		if (hasHomebrewTestCheck) return "Manual test path checking detected (.includes('.test.') / '.spec.'). Use canonical 'isTestPath(filePath)' from 'src/core/auditTestPredicates.ts'.";
		if (hasHomebrewSelfRepoCheck) return "Manual repository identity check (@francogp/auditor) detected. Use canonical 'isSelfProviderProject(projectRoot)' from 'src/core/auditProjectIdentity.ts'.";
		return null;
	}
});
//#endregion
export { predicatesDetector };
