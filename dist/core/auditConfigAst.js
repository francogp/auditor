import { deduplicateObjectLiteralProperties, findTargetAuditConfigObject, getNormalizedPropName, syncArrayElementsWithTsMorph, syncMissingPropsWithTsMorph, valueToTsMorphInitializer } from "./auditConfigAstMutation.js";
import { appendMissingSectionsToJsonFile, deepMergeMissingJson } from "./auditConfigJson.js";
import fs from "node:fs";
import { Node, Project, SyntaxKind } from "ts-morph";
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
function mutateJsonConfigFile(configFilePath, mutator) {
	try {
		const text = fs.readFileSync(configFilePath, "utf8");
		const json = JSON.parse(text);
		const modified = mutator(json);
		if (modified) fs.writeFileSync(configFilePath, JSON.stringify(json, null, 2) + "\n", "utf8");
		return modified;
	} catch {
		return false;
	}
}
function migrateLegacyEslintSectionAst(configFilePath) {
	if (!fs.existsSync(configFilePath)) return false;
	if (configFilePath.endsWith(".json")) return mutateJsonConfigFile(configFilePath, (json) => {
		if (!("eslint" in json)) return false;
		json.oxlint = json.eslint;
		delete json.eslint;
		if (!("vitePlusConfig" in json)) json.vitePlusConfig = { enabled: true };
		return true;
	});
	return mutateAuditConfigFileAst(configFilePath, (targetObj) => {
		const eslintProp = targetObj.getProperty("eslint");
		if (!eslintProp) return false;
		if (Node.isPropertyAssignment(eslintProp)) eslintProp.getNameNode().replaceWithText("oxlint");
		if (!targetObj.getProperty("vitePlusConfig")) targetObj.addPropertyAssignment({
			name: "vitePlusConfig",
			initializer: "{ enabled: true }"
		});
		return true;
	});
}
function removeAuditConfigPropertyAst(configFilePath, propertyPath) {
	if (!fs.existsSync(configFilePath)) return false;
	if (configFilePath.endsWith(".json")) return mutateJsonConfigFile(configFilePath, (json) => {
		const parts = propertyPath.split(".");
		let cur = json;
		for (let i = 0; i < parts.length - 1; i++) {
			const sub = cur[parts[i]];
			if (typeof sub === "object" && sub !== null) cur = sub;
			else return false;
		}
		const lastKey = parts.at(-1);
		if (lastKey in cur) {
			delete cur[lastKey];
			return true;
		}
		return false;
	});
	return mutateAuditConfigFileAst(configFilePath, (targetObj) => {
		const parts = propertyPath.split(".");
		let currentObj = targetObj;
		for (const part of parts.slice(0, -1)) {
			if (!currentObj) return false;
			const prop = currentObj.getProperty(part);
			if (!prop || !Node.isPropertyAssignment(prop)) return false;
			currentObj = prop.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression) ?? null;
		}
		if (!currentObj) return false;
		const lastKey = parts.at(-1);
		const targetProp = currentObj.getProperty(lastKey);
		if (targetProp) {
			targetProp.remove();
			return true;
		}
		return false;
	});
}
export { appendMissingSectionsToConfigFile, appendMissingSectionsToJsonFile, deduplicateObjectLiteralProperties, deepMergeMissingJson, findTargetAuditConfigObject, getNormalizedPropName, migrateLegacyEslintSectionAst, mutateAuditConfigFileAst, removeAuditConfigPropertyAst, syncArrayElementsWithTsMorph, syncAuditorVersionInTsFile, syncMissingPropsWithTsMorph, valueToTsMorphInitializer };
