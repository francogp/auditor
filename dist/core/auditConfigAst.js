import { safeJsonParse, safeReadFileSync, tryCatchSync } from "./safeUtils.js";
import fs from "node:fs";
import { Project, SyntaxKind } from "ts-morph";
// src/core/auditConfigAst.ts
/**
* src/core/auditConfigAst.ts
* AST parsing and configuration rewrite utilities for .auditor/audit.config.ts and .json.
*/
function isPlainRecord(val) {
	return typeof val === "object" && val !== null && !Array.isArray(val);
}
function deepMergeMissingJson(target, missing) {
	let modified = false;
	for (const [key, val] of Object.entries(missing)) {
		if (val === void 0) continue;
		const curr = target[key];
		if (curr === void 0) {
			target[key] = val;
			modified = true;
		} else if (isPlainRecord(curr) && isPlainRecord(val) && deepMergeMissingJson(curr, val)) modified = true;
	}
	return modified;
}
function appendMissingSectionsToJsonFile(configFilePath, sectionsToInsert) {
	const code = safeReadFileSync(configFilePath);
	if (!code) return;
	const json = safeJsonParse(code);
	if (!isPlainRecord(json)) return;
	if (deepMergeMissingJson(json, sectionsToInsert)) tryCatchSync(() => {
		fs.writeFileSync(configFilePath, JSON.stringify(json, null, 2) + "\n", "utf8");
	});
}
function valueToTsMorphInitializer(val) {
	if (typeof val === "string") return `'${val.replaceAll("'", "\\'")}'`;
	if (typeof val === "number" || typeof val === "boolean") return String(val);
	if (val === null || val === void 0) return "undefined";
	if (Array.isArray(val)) return `[${val.map((item) => valueToTsMorphInitializer(item)).join(", ")}]`;
	if (isPlainRecord(val)) return `{\n${Object.entries(val).filter(([, v]) => v !== void 0).map(([k, v]) => {
		return `${/^[a-z_$][\w$]*$/i.test(k) ? k : `'${k.replaceAll("'", "\\'")}'`}: ${valueToTsMorphInitializer(v)}`;
	}).join(",\n")}\n}`;
	return "undefined";
}
function syncMissingPropsWithTsMorph(obj, missingProps) {
	let mutated = false;
	for (const [key, missingVal] of Object.entries(missingProps)) {
		if (missingVal === void 0) continue;
		const existing = obj.getProperty(key);
		if (existing?.isKind(SyntaxKind.PropertyAssignment)) {
			const init = existing.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
			if (init && isPlainRecord(missingVal) && syncMissingPropsWithTsMorph(init, missingVal)) mutated = true;
			continue;
		}
		if (!existing) {
			const safeName = /^[a-z_$][\w$]*$/i.test(key) ? key : JSON.stringify(key);
			obj.addPropertyAssignment({
				name: safeName,
				initializer: valueToTsMorphInitializer(missingVal)
			});
			mutated = true;
		}
	}
	return mutated;
}
function findTargetAuditConfigObject(sourceFile) {
	for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) if (call.getExpression().getText() === "defineAuditConfig") {
		const arg = call.getArguments()[0];
		if (arg && arg.isKind(SyntaxKind.ObjectLiteralExpression)) return arg;
	}
	const expr = sourceFile.getDescendantsOfKind(SyntaxKind.ExportAssignment)[0]?.getExpression();
	if (expr && expr.isKind(SyntaxKind.ObjectLiteralExpression)) return expr;
	return sourceFile.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)[0];
}
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
	mutateAuditConfigFileAst(configFilePath, (targetObj) => syncMissingPropsWithTsMorph(targetObj, sectionsToInsert));
}
export { appendMissingSectionsToConfigFile, appendMissingSectionsToJsonFile, deepMergeMissingJson, findTargetAuditConfigObject, mutateAuditConfigFileAst, syncAuditorVersionInTsFile };
