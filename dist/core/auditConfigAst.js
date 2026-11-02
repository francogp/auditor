import { deduplicateObjectLiteralProperties, findTargetAuditConfigObject, getNormalizedPropName, syncArrayElementsWithTsMorph, syncMissingPropsWithTsMorph, valueToTsMorphInitializer } from "./auditConfigAstMutation.js";
import { appendMissingSectionsToJsonFile, deepMergeMissingJson } from "./auditConfigJson.js";
import { Project, SyntaxKind } from "ts-morph";
// src/core/auditConfigAst.ts
/**
* src/core/auditConfigAst.ts
* AST parsing and configuration rewrite utilities for .auditor/audit.config.ts and .json.
*/
function mutateAuditConfigFileAst(configFilePath, mutator) {
	try {
		const sourceFile = new Project({
			skipAddingFilesFromTsConfig: true,
			skipFileDependencyResolution: true,
			compilerOptions: { allowJs: true }
		}).addSourceFileAtPath(configFilePath);
		const targetObj = findTargetAuditConfigObject(sourceFile);
		if (!targetObj || !mutator(targetObj, sourceFile)) return false;
		sourceFile.formatText({ indentSize: 2 });
		sourceFile.saveSync();
		return true;
	} catch {
		return false;
	}
}
function syncAuditorVersionInTsFile(configFilePath, version) {
	return mutateAuditConfigFileAst(configFilePath, (targetObj) => {
		const existingProp = targetObj.getProperty("auditorVersion");
		if (existingProp && existingProp.isKind(SyntaxKind.PropertyAssignment)) {
			if (existingProp.getInitializer()?.getText().replace(/^['"]|['"]$/g, "") === version) return false;
			existingProp.setInitializer(`'${version}'`);
			return true;
		}
		const nameProp = targetObj.getProperty("name");
		const idx = nameProp && nameProp.isKind(SyntaxKind.PropertyAssignment) ? nameProp.getChildIndex() + 1 : 0;
		targetObj.insertPropertyAssignment(idx, {
			name: "auditorVersion",
			initializer: `'${version}'`
		});
		return true;
	});
}
function appendMissingSectionsToConfigFile(configFilePath, sectionsToInsert) {
	if (configFilePath.endsWith(".json")) {
		appendMissingSectionsToJsonFile(configFilePath, sectionsToInsert);
		return;
	}
	mutateAuditConfigFileAst(configFilePath, (targetObj) => {
		const dedupMutated = deduplicateObjectLiteralProperties(targetObj);
		const syncMutated = syncMissingPropsWithTsMorph(targetObj, sectionsToInsert);
		return dedupMutated || syncMutated;
	});
}
export { appendMissingSectionsToConfigFile, appendMissingSectionsToJsonFile, deduplicateObjectLiteralProperties, deepMergeMissingJson, findTargetAuditConfigObject, getNormalizedPropName, mutateAuditConfigFileAst, syncArrayElementsWithTsMorph, syncAuditorVersionInTsFile, syncMissingPropsWithTsMorph, valueToTsMorphInitializer };
