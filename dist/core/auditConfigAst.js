import { safeJsonParse, safeReadFileSync, tryCatchSync } from "./safeUtils.js";
import fs from "node:fs";
import ts from "typescript";
import { Project, SyntaxKind } from "ts-morph";
//#region src/core/auditConfigAst.ts
/**
* src/core/auditConfigAst.ts
*
* AST PARSING & CONFIGURATION REWRITE UTILITIES (Node.js 26+ Native)
* Provides programmatic AST extraction and insertion for .auditor/audit.config.ts
* and .auditor/audit.config.json files using official AST libraries (ts-morph and TypeScript).
*/
function dtoValueToTsExpression(value) {
	if (typeof value === "string") return ts.factory.createStringLiteral(value, true);
	if (typeof value === "number") {
		if (value < 0) return ts.factory.createPrefixUnaryExpression(ts.SyntaxKind.MinusToken, ts.factory.createNumericLiteral(Math.abs(value)));
		return ts.factory.createNumericLiteral(value);
	}
	if (typeof value === "boolean") return value ? ts.factory.createTrue() : ts.factory.createFalse();
	if (value === null || value === void 0) return ts.factory.createNull();
	if (Array.isArray(value)) {
		const elements = value.map((item) => dtoValueToTsExpression(item));
		const multiLine = value.length > 3 || value.some((item) => typeof item === "object" && item !== null);
		return ts.factory.createArrayLiteralExpression(elements, multiLine);
	}
	if (typeof value === "object") {
		const entries = Object.entries(value).filter(([, v]) => v !== void 0);
		const props = entries.map(([k, v]) => {
			const propName = /^[a-z_$][\w$]*$/i.test(k) ? ts.factory.createIdentifier(k) : ts.factory.createStringLiteral(k, true);
			return ts.factory.createPropertyAssignment(propName, dtoValueToTsExpression(v));
		});
		return ts.factory.createObjectLiteralExpression(props, entries.length > 0);
	}
	return ts.factory.createNull();
}
function printTsExpression(expr) {
	const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
	const dummySource = ts.createSourceFile("config.ts", "", ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
	return printer.printNode(ts.EmitHint.Expression, expr, dummySource).split("\n").map((line) => line.replace(/^( {4})+/, (m) => " ".repeat(m.length / 2))).join("\n");
}
function formatSectionObjectLiteral(value) {
	return printTsExpression(dtoValueToTsExpression(value)).split("\n").map((line, idx) => idx === 0 ? line : `  ${line}`).join("\n");
}
function findConfigObjectLiteral(source) {
	let configObj = null;
	const visit = (node) => {
		if (configObj) return;
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "defineAuditConfig" && node.arguments.length > 0 && ts.isObjectLiteralExpression(node.arguments[0])) {
			configObj = node.arguments[0];
			return;
		}
		if (ts.isExportAssignment(node) && ts.isObjectLiteralExpression(node.expression)) {
			configObj = node.expression;
			return;
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return configObj;
}
function appendMissingSectionsFallback(configFilePath, _code, sectionsToInsert) {
	appendMissingSectionsToTsFile(configFilePath, sectionsToInsert);
}
function parseAuditConfigFileAst(configFilePath) {
	try {
		const code = fs.readFileSync(configFilePath, "utf8");
		const source = ts.createSourceFile(configFilePath, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
		return {
			code,
			source,
			configObj: findConfigObjectLiteral(source)
		};
	} catch {
		return null;
	}
}
function formatValueWithIndent(value, indent) {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		const entries = Object.entries(value).filter(([, v]) => v !== void 0);
		if (entries.length === 0) return "{}";
		const subIndent = indent + "  ";
		return `{\n${entries.map(([k, v]) => {
			const safeKey = /^[a-z_$][\w$]*$/i.test(k) ? k : `'${k}'`;
			return `${subIndent}${safeKey}: ${formatValueWithIndent(v, subIndent)}`;
		}).join(",\n")}\n${indent}}`;
	}
	return printTsExpression(dtoValueToTsExpression(value));
}
function deepMergeMissingJson(target, missing) {
	let modified = false;
	for (const [key, val] of Object.entries(missing)) {
		if (val === void 0) continue;
		if (target[key] === void 0) {
			target[key] = val;
			modified = true;
		} else if (typeof target[key] === "object" && target[key] !== null && !Array.isArray(target[key]) && typeof val === "object" && val !== null && !Array.isArray(val)) {
			if (deepMergeMissingJson(target[key], val)) modified = true;
		}
	}
	return modified;
}
function appendMissingSectionsToJsonFile(configFilePath, sectionsToInsert) {
	const code = safeReadFileSync(configFilePath);
	if (!code) return;
	const json = safeJsonParse(code);
	if (!json || typeof json !== "object") return;
	if (deepMergeMissingJson(json, sectionsToInsert)) tryCatchSync(() => {
		fs.writeFileSync(configFilePath, JSON.stringify(json, null, 2) + "\n", "utf8");
	});
}
function valueToTsMorphInitializer(val) {
	if (typeof val === "string") return `'${val.replaceAll("'", "\\'")}'`;
	if (typeof val === "number" || typeof val === "boolean") return String(val);
	if (val === null || val === void 0) return "undefined";
	if (Array.isArray(val)) return `[${val.map((item) => valueToTsMorphInitializer(item)).join(", ")}]`;
	if (typeof val === "object") return `{\n${Object.entries(val).filter(([, v]) => v !== void 0).map(([k, v]) => {
		return `${/^[a-z_$][\w$]*$/i.test(k) ? k : `'${k.replaceAll("'", "\\'")}'`}: ${valueToTsMorphInitializer(v)}`;
	}).join(",\n")}\n}`;
	return "undefined";
}
function syncMissingPropsWithTsMorph(obj, missingProps) {
	let mutated = false;
	for (const [key, missingVal] of Object.entries(missingProps)) {
		if (missingVal === void 0) continue;
		const existing = obj.getProperty(key);
		if (existing && existing.isKind(SyntaxKind.PropertyAssignment)) {
			const init = existing.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
			if (init && typeof missingVal === "object" && missingVal !== null && !Array.isArray(missingVal)) {
				if (syncMissingPropsWithTsMorph(init, missingVal)) mutated = true;
				continue;
			}
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
	const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
	for (const call of callExpressions) if (call.getExpression().getText() === "defineAuditConfig") {
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
		if (!targetObj) return false;
		if (mutator(targetObj, sourceFile)) {
			sourceFile.formatText({ indentSize: 2 });
			sourceFile.saveSync();
			return true;
		}
		return false;
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
		if (nameProp && nameProp.isKind(SyntaxKind.PropertyAssignment)) {
			const idx = nameProp.getChildIndex();
			targetObj.insertPropertyAssignment(idx + 1, {
				name: "auditorVersion",
				initializer: `'${version}'`
			});
		} else targetObj.insertPropertyAssignment(0, {
			name: "auditorVersion",
			initializer: `'${version}'`
		});
		return true;
	});
}
function appendMissingSectionsToTsFile(configFilePath, sectionsToInsert) {
	mutateAuditConfigFileAst(configFilePath, (targetObj) => syncMissingPropsWithTsMorph(targetObj, sectionsToInsert));
}
function appendMissingSectionsToConfigFile(configFilePath, sectionsToInsert) {
	if (configFilePath.endsWith(".json")) {
		appendMissingSectionsToJsonFile(configFilePath, sectionsToInsert);
		return;
	}
	appendMissingSectionsToTsFile(configFilePath, sectionsToInsert);
}
//#endregion
export { appendMissingSectionsFallback, appendMissingSectionsToConfigFile, appendMissingSectionsToJsonFile, appendMissingSectionsToTsFile, deepMergeMissingJson, dtoValueToTsExpression, findConfigObjectLiteral, findTargetAuditConfigObject, formatSectionObjectLiteral, formatValueWithIndent, mutateAuditConfigFileAst, parseAuditConfigFileAst, printTsExpression, syncAuditorVersionInTsFile };
