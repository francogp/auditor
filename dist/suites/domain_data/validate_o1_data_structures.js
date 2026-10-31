import { normalizePosixPath } from "../../core/reportUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isTestPath } from "../../core/auditTestPredicates.js";
import "../../core/safePath.js";
import "../../core/auditConfig.js";
import { AuditedDocument } from "../../core/auditedDocument.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import ts from "typescript";
// src/suites/domain_data/validate_o1_data_structures.ts
/**
* scripts/auditors/domain_data/validate_o1_data_structures.ts
*
* O(1) DATA STRUCTURE & LINEAR SEARCH AUDITOR (Node.js 26+ Native)
* Scans codebase to detect anti-patterns of linear search O(N) and nested loops O(N^2)
* where an O(1) indexed data structure (Record, ReadonlySet, Map) is available.
*
* Rules:
*   1. o1-catalog-lookup: Linear scan (.find, .filter, .some, .findLast) on static catalogs
*   2. o1-linear-membership: Array constant .includes() instead of ReadonlySet.has().
*   3. o1-object-scan: Object.keys() / Object.values() linear search instead of key index.
*   4. o1-json-clone: JSON.parse(JSON.stringify(...)) anti-pattern instead of structuredClone or factory.
*   5. o1-redundant-spread-return: Redundant 'return [...arr]' instead of directly returning 'readonly T[]'.
*/
enableCompileCache();
const DEFAULT_O1_CATALOG_PATTERNS = [];
function getResolvedO1CatalogPatterns(projectRoot) {
	const configured = getAuditConfig(projectRoot).domain?.o1CatalogPatterns;
	if (configured && configured.length > 0) return configured.map((c) => ({
		name: c.name,
		pattern: typeof c.pattern === "string" ? new RegExp(c.pattern, "g") : c.pattern,
		alternative: c.alternative,
		definingFile: c.definingFile
	}));
	return DEFAULT_O1_CATALOG_PATTERNS;
}
const P_STATIC_ARRAY_INCLUDES = /(?:\(\s*)?\b([A-Z][A-Z0-9_]+_(?:IDS|LIST|TYPES|CATEGORIES|NAMES|KINDS|ORDER))(?:\s+as\s+[^)\s]+(?:\s+[^)\s]+)*)?(?:\s*\))?\.(?:includes|indexOf)\s*\(/g;
const P_OBJECT_SCAN_LOOKUP = /\bObject\.(?:keys|values|entries)\s*\([^)]+\)\.(?:find|findLast)\s*\(/g;
const P_JSON_CLONE = /\bJSON\.parse\s*\(\s*JSON\.stringify\s*\(/g;
const P_REDUNDANT_SPREAD_RETURN = /return\s*\[\s*\.\.\.([\w$.]+(?:\([^)]*\))?)\s*\]\s*;/g;
const O1_RULES = [
	"o1-catalog-lookup",
	"o1-linear-membership",
	"o1-object-scan",
	"o1-json-clone",
	"o1-redundant-spread-return"
];
function checkLineCatalogLookups(params) {
	for (const catalog of params.catalogPatterns) {
		if (params.normalizedPath.endsWith(catalog.definingFile)) continue;
		catalog.pattern.lastIndex = 0;
		if (catalog.pattern.test(params.lineText)) params.issues.push({
			ruleId: "o1-catalog-lookup",
			message: `Linear O(N) search on '${catalog.name}'. Use O(1) alternative: ${catalog.alternative}`,
			line: params.lineNumber,
			context: params.lineText.trim(),
			isWarning: false
		});
	}
}
function checkLinePatterns(params) {
	const { lineText, lineNumber, issues } = params;
	const trimmed = lineText.trim();
	P_STATIC_ARRAY_INCLUDES.lastIndex = 0;
	let match;
	while ((match = P_STATIC_ARRAY_INCLUDES.exec(lineText)) !== null) {
		const arrayName = match[1];
		issues.push({
			ruleId: "o1-linear-membership",
			message: `Linear O(N) membership check with '.includes()' on '${arrayName}'. Derive a 'ReadonlySet<T>' and use '.has()'`,
			line: lineNumber,
			context: trimmed,
			isWarning: false
		});
	}
	P_OBJECT_SCAN_LOOKUP.lastIndex = 0;
	if (P_OBJECT_SCAN_LOOKUP.test(lineText)) issues.push({
		ruleId: "o1-object-scan",
		message: "Linear search using 'Object.keys/values/entries().find()'. Index data directly in a Record/Map for O(1) key access",
		line: lineNumber,
		context: trimmed,
		isWarning: false
	});
	P_JSON_CLONE.lastIndex = 0;
	if (P_JSON_CLONE.test(lineText)) issues.push({
		ruleId: "o1-json-clone",
		message: "Forbidden 'JSON.parse(JSON.stringify(...))' deep clone Anti-pattern. Use native 'structuredClone(obj)' or 'cloneReactive(obj)'",
		line: lineNumber,
		context: trimmed,
		isWarning: false
	});
	P_REDUNDANT_SPREAD_RETURN.lastIndex = 0;
	const spreadMatch = P_REDUNDANT_SPREAD_RETURN.exec(lineText);
	if (spreadMatch && spreadMatch[1]) {
		const target = spreadMatch[1].trim();
		issues.push({
			ruleId: "o1-redundant-spread-return",
			message: `Redundant array spread 'return [...${target}]'. Return the collection directly typed as 'readonly T[]' to prevent unnecessary heap allocations and GC churn.`,
			line: lineNumber,
			context: trimmed,
			isWarning: false
		});
	}
}
function forEachUncommentedLine(content, callback) {
	const lines = content.split("\n");
	for (let index = 0; index < lines.length; index++) {
		const lineText = lines[index];
		const trimmed = lineText.trim();
		if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
		callback(lineText, index + 1);
	}
}
function scanAstForO1Issues(doc, ast, _filePath, normalizedPath, catalogPatterns, issues) {
	forEachUncommentedLine(doc.rawContent, (lineText, lineNumber) => {
		checkLineCatalogLookups({
			lineText,
			lineNumber,
			normalizedPath,
			catalogPatterns,
			issues
		});
	});
	const visit = (node) => {
		const { lineText } = doc.getNodeLineAndColumn(node, ast);
		const trimmed = lineText.trim();
		if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
		checkLinearMembership(node, ast, doc, issues);
		checkObjectScan(node, ast, doc, issues);
		checkJsonClone(node, ast, doc, issues);
		checkRedundantSpreadReturn(node, ast, doc, issues);
		ts.forEachChild(node, visit);
	};
	visit(ast);
}
function getCallMethodAndUnwrappedTarget(node) {
	if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
	let target = node.expression.expression;
	while (ts.isAsExpression(target) || ts.isParenthesizedExpression(target)) target = target.expression;
	return {
		methodName: node.expression.name.text,
		target
	};
}
function checkLinearMembership(node, ast, doc, issues) {
	const info = getCallMethodAndUnwrappedTarget(node);
	if (!info) return;
	if (info.methodName !== "includes" && info.methodName !== "indexOf") return;
	const leftText = info.target.getText(ast);
	const m = /\b([A-Z][A-Z0-9_]+_(?:IDS|LIST|TYPES|CATEGORIES|NAMES|KINDS|ORDER))\b/.exec(leftText);
	if (!m || !m[1]) return;
	const { line } = doc.getNodeLineAndColumn(node, ast);
	issues.push({
		ruleId: "o1-linear-membership",
		message: `Linear O(N) membership check with '.includes()' on '${m[1]}'. Derive a 'ReadonlySet<T>' and use '.has()'`,
		line,
		context: node.getText(ast).slice(0, 100).replace(/\n/g, "↵"),
		isWarning: false
	});
}
function checkObjectScan(node, ast, doc, issues) {
	const info = getCallMethodAndUnwrappedTarget(node);
	if (!info) return;
	if (info.methodName !== "find" && info.methodName !== "findLast") return;
	const leftExpr = info.target;
	if (!ts.isCallExpression(leftExpr) || !ts.isPropertyAccessExpression(leftExpr.expression)) return;
	const innerObj = leftExpr.expression.expression.getText(ast);
	const innerMethod = leftExpr.expression.name.text;
	if (innerObj !== "Object") return;
	if (innerMethod !== "keys" && innerMethod !== "values" && innerMethod !== "entries") return;
	const { line } = doc.getNodeLineAndColumn(node, ast);
	issues.push({
		ruleId: "o1-object-scan",
		message: "Linear search using 'Object.keys/values/entries().find()'. Index data directly in a Record/Map for O(1) key access",
		line,
		context: node.getText(ast).slice(0, 100).replace(/\n/g, "↵"),
		isWarning: false
	});
}
function checkJsonClone(node, ast, doc, issues) {
	if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
	if (node.expression.expression.getText(ast) !== "JSON" || node.expression.name.text !== "parse") return;
	if (node.arguments.length === 0) return;
	let arg0 = node.arguments[0];
	while (ts.isParenthesizedExpression(arg0) || ts.isAsExpression(arg0)) arg0 = arg0.expression;
	if (!ts.isCallExpression(arg0) || !ts.isPropertyAccessExpression(arg0.expression)) return;
	if (arg0.expression.expression.getText(ast) !== "JSON" || arg0.expression.name.text !== "stringify") return;
	const { line } = doc.getNodeLineAndColumn(node, ast);
	issues.push({
		ruleId: "o1-json-clone",
		message: "Forbidden 'JSON.parse(JSON.stringify(...))' deep clone Anti-pattern. Use native 'structuredClone(obj)' or 'cloneReactive(obj)'",
		line,
		context: node.getText(ast).slice(0, 100).replace(/\n/g, "↵"),
		isWarning: false
	});
}
function checkRedundantSpreadReturn(node, ast, doc, issues) {
	if (!ts.isReturnStatement(node) || !node.expression || !ts.isArrayLiteralExpression(node.expression)) return;
	if (node.expression.elements.length !== 1) return;
	const el = node.expression.elements[0];
	if (!el || !ts.isSpreadElement(el)) return;
	const spreadTarget = el.expression.getText(ast);
	const { line } = doc.getNodeLineAndColumn(node, ast);
	issues.push({
		ruleId: "o1-redundant-spread-return",
		message: `Redundant array spread 'return [...${spreadTarget}]'. Return the collection directly typed as 'readonly T[]' to prevent unnecessary heap allocations and GC churn.`,
		line,
		context: node.getText(ast).slice(0, 100).replace(/\n/g, "↵"),
		isWarning: false
	});
}
function scanFileForO1Issues(filePath, content, catalogPatterns = getResolvedO1CatalogPatterns()) {
	const doc = new AuditedDocument(filePath, content, filePath);
	const ast = doc.getAst();
	const normalizedPath = normalizePosixPath(filePath);
	if (ast) {
		const issues = [];
		scanAstForO1Issues(doc, ast, filePath, normalizedPath, catalogPatterns, issues);
		return issues;
	}
	const issues = [];
	forEachUncommentedLine(content, (lineText, lineNumber) => {
		checkLineCatalogLookups({
			lineText,
			lineNumber,
			normalizedPath,
			catalogPatterns,
			issues
		});
		checkLinePatterns({
			lineText,
			lineNumber,
			issues
		});
	});
	return issues;
}
var O1DataStructuresAuditor = class extends FileScanAuditor {
	constructor(options = {}) {
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options, (config) => config.paths.codeRoots ?? []);
		super({
			ruleFixers: {},
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(O1_RULES, {
				speed: "light",
				phase: "normal",
				md: false,
				ast: true,
				changedOnly: false,
				critical: false
			}),
			id: "validate_o1_data_structures",
			name: "O(1) Data Structure & Performance Auditor",
			description: "Linear O(N) search or cloning with JSON.parse",
			family: "domain_data",
			ruleIds: O1_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(O1_RULES, "contracts"),
			packageName: "O(1)",
			configKey: "domain",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "⚡",
			ruleDescriptions: {
				"o1-catalog-lookup": "Linear catalog lookup",
				"o1-linear-membership": "Linear .includes() search in array",
				"o1-object-scan": "Linear scan in Object.keys/values",
				"o1-json-clone": "Cloning via JSON.parse(JSON.stringify)",
				"o1-redundant-spread-return": "Redundant return with object spread"
			},
			ruleRemediations: {
				"o1-catalog-lookup": "📖 REMEDIATION GUIDE: o1-catalog-lookup\n1. Root Cause: Linear O(N) lookup detected on a catalog or static collection (e.g.: CATALOG.find(x => x.id === targetId)) in a hot path. As the catalog grows, lookup time scales linearly degrading performance.\n2. Diagnosis: Look for .find(), .filter(), or .some() operations on static catalog arrays.\n3. Canonical Solution: Index the catalog once in a Record<Id, Item> dictionary or Map<Id, Item> for constant time O(1) access: CATALOG_BY_ID[targetId].\n4. Example:\n   ❌ Incorrect: const item = ITEMS.find(i => i.id === requestedId);\n   ✅ Correct:   const ITEMS_BY_ID = new Map(ITEMS.map(i => [i.id, i]));\n                  const item = ITEMS_BY_ID.get(requestedId);",
				"o1-linear-membership": "📖 REMEDIATION GUIDE: o1-linear-membership\n1. Root Cause: Linear O(N) membership check detected via array.includes(val) or array.indexOf(val) on an options array in a loop or frequently invoked function.\n2. Diagnosis: Look for .includes() calls on collections or arrays on the indicated line.\n3. Canonical Solution: Convert the array to an immutable Set<T> and query membership with set.has(val) in O(1) time.\n4. Example:\n   ❌ Incorrect: Linear membership check in Array using array.includes(val) in O(N)\n   ✅ Correct:   Index in immutable Set or Map and check membership with set.has(val) in O(1)\n   - CLI Tool: Run \"npm run auditor:o1 inspect <file>\" to obtain automatic Dirac replacement suggestion.",
				"o1-object-scan": "📖 REMEDIATION GUIDE: o1-object-scan\n1. Root Cause: Object.keys(obj).includes(key) or Object.values(obj).find(...) used to check key existence in an object, allocating an array on the heap and scanning in O(N).\n2. Diagnosis: Look for Object.keys(...).includes(...) on the reported line.\n3. Canonical Solution: Check existence directly on the object with the \"in\" operator or via direct O(1) index access.\n4. Example:\n   ❌ Incorrect: if (Object.keys(registry).includes(targetKey)) { ... }\n   ✅ Correct:   if (targetKey in registry) { ... } // or registry[targetKey] !== undefined",
				"o1-json-clone": "📖 REMEDIATION GUIDE: o1-json-clone\n1. Root Cause: Use of JSON.parse(JSON.stringify(data)) anti-pattern to clone in-memory data structures. Computationally expensive, loses special types (Date, Map, Set, BigInt, RegExp, functions), and pressures the Garbage Collector.\n2. Diagnosis: Look for JSON.parse(JSON.stringify(...)) in the file.\n3. Canonical Solution: Use the native standard platform function structuredClone(data), or shallow clone with spread { ...obj } if only copying first-level properties.\n4. Example:\n   ❌ Incorrect: const copy = JSON.parse(JSON.stringify(gameState));\n   ✅ Correct:   const copy = structuredClone(gameState);",
				"o1-redundant-spread-return": "📖 REMEDIATION GUIDE: o1-redundant-spread-return\n1. Root Cause: A pure function ends with \"return [...arr];\" unnecessarily duplicating the array on the heap when the caller does not mutate the result.\n2. Diagnosis: Look for return [...array] in read-only functions.\n3. Canonical Solution: Type the return signature as \"readonly T[]\" and return the direct array reference (return arr;), eliminating memory allocation."
			},
			roots: targetRoots,
			allowedExtensions: /* @__PURE__ */ new Set([".ts", ".vue"]),
			projectRoot: effectiveRoot
		});
	}
	async runAudit(astContext) {
		if ((getAuditConfig(this.projectRoot).domain?.o1CatalogPatterns ?? []).length === 0) this.markRuleNotApplicable("o1-catalog-lookup", "No o1CatalogPatterns configurados en audit.config.ts");
		await super.runAudit(astContext);
	}
	scanFile(relPath, content) {
		const config = getAuditConfig(this.projectRoot);
		if (isTestPath(relPath) && !config.paths.includeTestsInCodeAudit) return;
		if (relPath.endsWith("validate_o1_data_structures.ts")) return;
		const issues = scanFileForO1Issues(relPath, content, getResolvedO1CatalogPatterns(this.projectRoot));
		for (const ruleId of O1_RULES) {
			const ruleIssues = issues.filter((i) => i.ruleId === ruleId);
			this.runSubAuditorSync(ruleId, () => {
				for (const issue of ruleIssues) this.addViolation({
					ruleId: issue.ruleId,
					severity: issue.isWarning ? "warning" : "error",
					file: relPath,
					line: issue.line,
					message: issue.message,
					context: issue.context
				});
			});
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new O1DataStructuresAuditor());
export { DEFAULT_O1_CATALOG_PATTERNS, O1DataStructuresAuditor, O1DataStructuresAuditor as ValidateO1DataStructuresAuditor, O1_RULES, P_JSON_CLONE, P_OBJECT_SCAN_LOOKUP, P_REDUNDANT_SPREAD_RETURN, P_STATIC_ARRAY_INCLUDES, getResolvedO1CatalogPatterns, scanFileForO1Issues };
