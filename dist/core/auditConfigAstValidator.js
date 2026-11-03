import { AUDIT_CONFIG_FILE } from "./auditConfigTypes.js";
import { unwrapExpression } from "./astContext.js";
import path from "node:path";
import fs from "node:fs";
import ts from "typescript";
// src/core/auditConfigAstValidator.ts
/**
* packages/auditor/src/core/auditConfigAstValidator.ts
*
* Single Source of Truth AST validator and schema enforcer for .auditor/audit.config.ts.
* Parses TypeScript AST to detect:
* 1. Duplicate keys in object literals (which silently overwrite earlier keys in JavaScript)
* 2. Duplicate entries in configuration arrays (redundant items in unique sets)
* 3. Declared subsystems missing explicit 'enabled: boolean' (strict schema / DTD conformance)
*/
/**
* Top-level entries in defineAuditConfig that are NOT toggleable subsystems
* and therefore do not require an `enabled: boolean` property.
*/
const SUBSYSTEMS_WITHOUT_ENABLED = /* @__PURE__ */ new Set([
	"name",
	"auditorVersion",
	"paths",
	"customFamilies",
	"extensions",
	"presets",
	"_rawConfig",
	"_rawPaths",
	"_declaredSubsystems"
]);
function getPropertyName(node, sourceFile) {
	if (!node.name) return null;
	if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) || ts.isNumericLiteral(node.name)) return node.name.text;
	return node.name.getText(sourceFile);
}
function resolvePrimitiveIdentity(expr) {
	if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
	if (ts.isNumericLiteral(expr)) return expr.text;
	if (expr.kind === ts.SyntaxKind.TrueKeyword) return "true";
	if (expr.kind === ts.SyntaxKind.FalseKeyword) return "false";
	if (ts.isIdentifier(expr)) return expr.text;
	return null;
}
function extractObjectPropertiesMap(obj, sourceFile) {
	const map = /* @__PURE__ */ new Map();
	for (const prop of obj.properties) if (ts.isPropertyAssignment(prop)) {
		const propName = getPropertyName(prop, sourceFile);
		if (!propName) continue;
		const init = unwrapExpression(prop.initializer);
		const primitive = resolvePrimitiveIdentity(init);
		map.set(propName, primitive !== null ? primitive : init.getText(sourceFile).replace(/\s+/g, " ").trim());
	} else if (ts.isShorthandPropertyAssignment(prop)) {
		const propName = getPropertyName(prop, sourceFile);
		if (propName) map.set(propName, prop.name.text);
	}
	return map;
}
const PRIMARY_IDENTITY_KEYS = [
	"glob",
	"id",
	"name",
	"pattern",
	"path",
	"file"
];
function buildSortedObjectIdentity(props) {
	return [...props.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join(";");
}
function resolveObjectLiteralIdentity(obj, sourceFile) {
	const props = extractObjectPropertiesMap(obj, sourceFile);
	const policy = props.get("policy");
	const glob = props.get("glob");
	if (policy && glob) return `${policy}:${glob}`;
	for (const key of PRIMARY_IDENTITY_KEYS) {
		const val = props.get(key);
		if (val) return val;
	}
	if (props.size > 0) return buildSortedObjectIdentity(props);
	return obj.getText(sourceFile).replace(/\s+/g, " ").trim();
}
function getArrayItemIdentity(element, sourceFile) {
	const unwrapped = unwrapExpression(element);
	const primitive = resolvePrimitiveIdentity(unwrapped);
	if (primitive !== null) return primitive;
	if (ts.isObjectLiteralExpression(unwrapped)) return resolveObjectLiteralIdentity(unwrapped, sourceFile);
	return element.getText(sourceFile).replace(/\s+/g, " ").trim();
}
/**
* Parses and analyzes the TypeScript AST of .auditor/audit.config.ts to detect:
* - Duplicate properties in object literals
* - Duplicate entries in array collections
* - Missing 'enabled' in declared subsystems
*/
function validateAuditConfigAst(sourceText, fileName = AUDIT_CONFIG_FILE) {
	const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
	const violations = [];
	let rootObj = null;
	ts.forEachChild(sourceFile, function visit(node) {
		if (ts.isCallExpression(node)) {
			const fnText = node.expression.getText(sourceFile);
			if ((fnText === "defineAuditConfig" || fnText.endsWith(".defineAuditConfig")) && node.arguments.length > 0) {
				const firstArg = node.arguments[0];
				if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
					rootObj = firstArg;
					return;
				}
			}
		}
		ts.forEachChild(node, visit);
	});
	if (!rootObj) return violations;
	function checkObject(objNode, currentPath, isRoot = false) {
		const seenKeys = /* @__PURE__ */ new Map();
		for (const prop of objNode.properties) {
			if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop) && !ts.isMethodDeclaration(prop)) continue;
			const key = getPropertyName(prop, sourceFile);
			if (!key) continue;
			const pos = sourceFile.getLineAndCharacterOfPosition(prop.getStart(sourceFile));
			const line = pos.line + 1;
			const col = pos.character + 1;
			const fullPath = currentPath ? `${currentPath}.${key}` : key;
			if (seenKeys.has(key)) {
				const orig = seenKeys.get(key);
				violations.push({
					ruleId: "audit-config-duplicate-key",
					key,
					path: fullPath,
					line,
					col,
					originalLine: orig.line,
					originalCol: orig.col,
					message: `Duplicate property '${key}' in object '${currentPath || "root"}' on line ${line}:${col} (originally declared on line ${orig.line}:${orig.col}). Duplicate keys silently overwrite earlier declarations in JavaScript object literals.`
				});
			} else seenKeys.set(key, {
				line,
				col
			});
			if (ts.isPropertyAssignment(prop)) {
				const init = unwrapExpression(prop.initializer);
				if (ts.isObjectLiteralExpression(init)) {
					if (isRoot && !SUBSYSTEMS_WITHOUT_ENABLED.has(key)) {
						if (!init.properties.some((p) => {
							if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) return getPropertyName(p, sourceFile) === "enabled";
							return false;
						})) violations.push({
							ruleId: "audit-config-missing-enabled",
							key,
							path: fullPath,
							line,
							col,
							message: `Subsystem '${key}' declared on line ${line}:${col} is missing explicit 'enabled: true' (or 'false'). All declared subsystems must explicitly specify their enabled status.`
						});
					}
					checkObject(init, fullPath, false);
				} else if (ts.isArrayLiteralExpression(init)) checkArray(init, fullPath);
			}
		}
	}
	function checkArray(arrNode, currentPath) {
		const seenElements = /* @__PURE__ */ new Map();
		for (const el of arrNode.elements) {
			const itemKey = getArrayItemIdentity(el, sourceFile);
			const pos = sourceFile.getLineAndCharacterOfPosition(el.getStart(sourceFile));
			const line = pos.line + 1;
			const col = pos.character + 1;
			if (seenElements.has(itemKey)) {
				const orig = seenElements.get(itemKey);
				violations.push({
					ruleId: "audit-config-duplicate-entry",
					key: itemKey,
					path: currentPath,
					line,
					col,
					originalLine: orig.line,
					originalCol: orig.col,
					message: `Duplicate entry '${itemKey}' in array '${currentPath}' on line ${line}:${col} (originally declared on line ${orig.line}:${orig.col}). Redundant array entries are prohibited.`
				});
			} else seenElements.set(itemKey, {
				line,
				col
			});
		}
	}
	checkObject(rootObj, "", true);
	return violations;
}
/**
* Asserts that the configuration file does not contain duplicate property keys.
* Throws a loud descriptive Error if duplicate keys are detected, preventing
* JavaScript/Node runtime from silently overwriting earlier configurations.
*/
function assertNoDuplicateKeysInAuditConfig(sourceText, filePath = AUDIT_CONFIG_FILE) {
	const duplicateKeys = validateAuditConfigAst(sourceText, filePath).filter((v) => v.ruleId === "audit-config-duplicate-key");
	if (duplicateKeys.length > 0) {
		const linesDesc = duplicateKeys.map((d) => `• '${d.path}' on line ${d.line}:${d.col} (originally declared on line ${d.originalLine}:${d.originalCol})`).join("\n");
		throw new Error(`[AuditConfig Syntax Error] Duplicate property keys detected in ${filePath}:\n${linesDesc}\n\nIn JavaScript object literals, duplicate keys silently overwrite earlier declarations and destroy configurations.\nPlease merge the duplicate entries into a single block to proceed.`);
	}
}
/**
* Asserts that the configuration file on disk does not contain duplicate keys.
*/
function assertNoDuplicateKeysInAuditConfigFile(configPath) {
	if (!fs.existsSync(configPath)) return;
	assertNoDuplicateKeysInAuditConfig(fs.readFileSync(configPath, "utf-8"), path.basename(configPath));
}
export { SUBSYSTEMS_WITHOUT_ENABLED, assertNoDuplicateKeysInAuditConfig, assertNoDuplicateKeysInAuditConfigFile, getArrayItemIdentity, validateAuditConfigAst };
