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
	try {
		const code = fs.readFileSync(configFilePath, "utf8");
		const json = JSON.parse(code);
		if (!json || typeof json !== "object") return;
		if (deepMergeMissingJson(json, sectionsToInsert)) fs.writeFileSync(configFilePath, JSON.stringify(json, null, 2) + "\n", "utf8");
	} catch {}
}
function collectMissingPropInsertions(code, source, objNode, missingProps, indent, insertions) {
	const existingPropMap = /* @__PURE__ */ new Map();
	for (const prop of objNode.properties) if (ts.isPropertyAssignment(prop)) {
		const name = prop.name.getText(source).replace(/^['"]|['"]$/g, "");
		existingPropMap.set(name, prop);
	}
	const propsToAppend = [];
	for (const [key, missingVal] of Object.entries(missingProps)) {
		if (missingVal === void 0) continue;
		const existing = existingPropMap.get(key);
		if (existing) {
			if (ts.isObjectLiteralExpression(existing.initializer) && typeof missingVal === "object" && missingVal !== null && !Array.isArray(missingVal)) collectMissingPropInsertions(code, source, existing.initializer, missingVal, indent + "  ", insertions);
		} else propsToAppend.push([key, missingVal]);
	}
	if (propsToAppend.length === 0) return;
	const formattedLines = propsToAppend.map(([k, v]) => {
		return `${indent}${/^[a-z_$][\w$]*$/i.test(k) ? k : `'${k}'`}: ${formatValueWithIndent(v, indent)}`;
	});
	const closeBracePos = code.lastIndexOf("}", objNode.getEnd() - 1);
	if (closeBracePos === -1) return;
	if (objNode.properties.length > 0) {
		const endOfLastProp = objNode.properties[objNode.properties.length - 1].getEnd();
		const commaPrefix = code.slice(endOfLastProp, closeBracePos).includes(",") ? "" : ",";
		const lastNewlineBeforeClose = code.lastIndexOf("\n", closeBracePos);
		const insertPos = lastNewlineBeforeClose !== -1 && lastNewlineBeforeClose >= endOfLastProp ? lastNewlineBeforeClose : closeBracePos;
		insertions.push({
			pos: insertPos,
			text: `${commaPrefix}\n${formattedLines.join(",\n")},`
		});
	} else {
		const parentIndent = indent.length >= 2 ? indent.slice(2) : "";
		insertions.push({
			pos: closeBracePos,
			text: `\n${formattedLines.join(",\n")},\n${parentIndent}`
		});
	}
}
function appendMissingSectionsToTsFile(configFilePath, sectionsToInsert) {
	const parsed = parseAuditConfigFileAst(configFilePath);
	if (!parsed) return;
	const { code, source, configObj } = parsed;
	if (!configObj) {
		appendMissingSectionsFallback(configFilePath, code, sectionsToInsert);
		return;
	}
	const insertions = [];
	collectMissingPropInsertions(code, source, configObj, sectionsToInsert, "  ", insertions);
	if (insertions.length === 0) return;
	insertions.sort((a, b) => b.pos - a.pos);
	let updatedCode = code;
	for (const ins of insertions) updatedCode = updatedCode.slice(0, ins.pos) + ins.text + updatedCode.slice(ins.pos);
	fs.writeFileSync(configFilePath, updatedCode, "utf8");
}
function appendMissingSectionsToConfigFile(configFilePath, sectionsToInsert) {
	if (configFilePath.endsWith(".json")) {
		appendMissingSectionsToJsonFile(configFilePath, sectionsToInsert);
		return;
	}
	appendMissingSectionsToTsFile(configFilePath, sectionsToInsert);
}
//#endregion
export { appendMissingSectionsFallback, appendMissingSectionsToConfigFile, appendMissingSectionsToJsonFile, appendMissingSectionsToTsFile, deepMergeMissingJson, dtoValueToTsExpression, findConfigObjectLiteral, formatSectionObjectLiteral, formatValueWithIndent, parseAuditConfigFileAst, printTsExpression };
