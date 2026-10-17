import fs from "node:fs";
import ts from "typescript";
//#region src/core/auditConfigAst.ts
/**
* src/core/auditConfigAst.ts
*
* AST PARSING & CONFIGURATION REWRITE UTILITIES (Node.js 26+ Native)
* Provides programmatic AST extraction and insertion for .auditor/audit.config.ts
* and .auditor/audit.config.json files.
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
function appendMissingSectionsFallback(configFilePath, code, sectionsToInsert) {
	const lastBrace = code.lastIndexOf("}");
	if (lastBrace === -1) return;
	const beforeClose = code.slice(0, lastBrace).trimEnd();
	const needsComma = !beforeClose.endsWith(",");
	const commaPos = beforeClose.length;
	const sectionLines = [];
	for (const [key, val] of Object.entries(sectionsToInsert)) sectionLines.push(`  ${key}: ${formatSectionObjectLiteral(val)},`);
	const updated = (needsComma ? code.slice(0, commaPos) + "," + code.slice(commaPos, lastBrace) : code.slice(0, lastBrace)) + ("\n" + sectionLines.join("\n") + "\n") + code.slice(lastBrace);
	fs.writeFileSync(configFilePath, updated, "utf8");
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
function appendMissingSectionsToJsonFile(configFilePath, sectionsToInsert) {
	try {
		const code = fs.readFileSync(configFilePath, "utf8");
		const json = JSON.parse(code);
		if (!json || typeof json !== "object") return;
		for (const [key, value] of Object.entries(sectionsToInsert)) Reflect.set(json, key, value);
		fs.writeFileSync(configFilePath, JSON.stringify(json, null, 2) + "\n", "utf8");
	} catch {}
}
function appendMissingSectionsToTsFile(configFilePath, sectionsToInsert) {
	const parsed = parseAuditConfigFileAst(configFilePath);
	if (!parsed) return;
	const { code, source, configObj } = parsed;
	if (!configObj) {
		appendMissingSectionsFallback(configFilePath, code, sectionsToInsert);
		return;
	}
	const existingProps = /* @__PURE__ */ new Map();
	for (const prop of configObj.properties) if (ts.isPropertyAssignment(prop)) {
		const propName = prop.name.getText(source).replace(/^['"]|['"]$/g, "");
		existingProps.set(propName, prop);
	}
	const inPlaceUpdates = [];
	const newAdditions = [];
	for (const [key, val] of Object.entries(sectionsToInsert)) {
		const existingProp = existingProps.get(key);
		if (existingProp) inPlaceUpdates.push({
			prop: existingProp,
			val
		});
		else newAdditions.push([key, val]);
	}
	let updatedCode = code;
	if (inPlaceUpdates.length > 0) {
		inPlaceUpdates.sort((a, b) => b.prop.initializer.getStart(source) - a.prop.initializer.getStart(source));
		for (const { prop, val } of inPlaceUpdates) {
			const start = prop.initializer.getStart(source);
			const end = prop.initializer.getEnd();
			updatedCode = updatedCode.slice(0, start) + formatSectionObjectLiteral(val) + updatedCode.slice(end);
		}
		fs.writeFileSync(configFilePath, updatedCode, "utf8");
	}
	if (newAdditions.length === 0) return;
	const reparsed = inPlaceUpdates.length > 0 ? parseAuditConfigFileAst(configFilePath) : parsed;
	if (!reparsed || !reparsed.configObj) return;
	const targetCode = reparsed.code;
	const targetObj = reparsed.configObj;
	const properties = targetObj.properties;
	let hasTrailingComma = false;
	if (properties.length > 0) {
		const endOfLastProp = properties[properties.length - 1].getEnd();
		const closeBracePos = targetCode.lastIndexOf("}", targetObj.getEnd() - 1);
		hasTrailingComma = targetCode.slice(endOfLastProp, closeBracePos).includes(",");
	}
	const closeBracePos = targetCode.lastIndexOf("}", targetObj.getEnd() - 1);
	if (closeBracePos === -1) return;
	let baseCode = targetCode;
	let effectiveCloseBracePos = closeBracePos;
	if (!hasTrailingComma && properties.length > 0) {
		const endOfLastProp = properties[properties.length - 1].getEnd();
		baseCode = targetCode.slice(0, endOfLastProp) + "," + targetCode.slice(endOfLastProp);
		effectiveCloseBracePos += 1;
	}
	const snippet = "\n" + newAdditions.map(([key, val]) => `  ${key}: ${formatSectionObjectLiteral(val)},`).join("\n") + "\n";
	const finalCode = baseCode.slice(0, effectiveCloseBracePos) + snippet + baseCode.slice(effectiveCloseBracePos);
	fs.writeFileSync(configFilePath, finalCode, "utf8");
}
function appendMissingSectionsToConfigFile(configFilePath, sectionsToInsert) {
	if (configFilePath.endsWith(".json")) {
		appendMissingSectionsToJsonFile(configFilePath, sectionsToInsert);
		return;
	}
	appendMissingSectionsToTsFile(configFilePath, sectionsToInsert);
}
//#endregion
export { appendMissingSectionsFallback, appendMissingSectionsToConfigFile, appendMissingSectionsToJsonFile, appendMissingSectionsToTsFile, dtoValueToTsExpression, findConfigObjectLiteral, formatSectionObjectLiteral, parseAuditConfigFileAst, printTsExpression };
