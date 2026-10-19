import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import { isTestPath } from "../../core/auditTestPredicates.js";
import "../../core/auditConfig.js";
import { AuditedDocument } from "../../core/auditedDocument.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import "../../core/safePath.js";
import { enableCompileCache } from "node:module";
import ts from "typescript";
//#region src/suites/domain_data/validate_o1_data_structures.ts
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
function getResolvedO1CatalogPatterns() {
	const configured = getAuditConfig().domain?.o1CatalogPatterns;
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
const ESCAPE_HATCHES = ["// o1-ok:", "// linear-search-ok:"];
function shouldIgnoreLine(line) {
	return ESCAPE_HATCHES.some((hatch) => line.includes(hatch));
}
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
function scanAstForO1Issues(doc, ast, _filePath, normalizedPath, catalogPatterns, issues) {
	const lines = doc.rawContent.split("\n");
	for (let index = 0; index < lines.length; index++) {
		const lineText = lines[index];
		const lineNumber = index + 1;
		const trimmed = lineText.trim();
		if (doc.hasEscapeHatch(lineNumber, "o1-catalog-lookup") || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
		for (const catalog of catalogPatterns) {
			if (normalizedPath.endsWith(catalog.definingFile)) continue;
			catalog.pattern.lastIndex = 0;
			if (catalog.pattern.test(lineText)) issues.push({
				ruleId: "o1-catalog-lookup",
				message: `Linear O(N) search on '${catalog.name}'. Use O(1) alternative: ${catalog.alternative}`,
				line: lineNumber,
				context: trimmed,
				isWarning: false
			});
		}
	}
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
	if (doc.hasEscapeHatchForNode(node, "o1-linear-membership", ast)) return;
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
	if (doc.hasEscapeHatchForNode(node, "o1-object-scan", ast)) return;
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
	if (doc.hasEscapeHatchForNode(node, "o1-json-clone", ast)) return;
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
	if (doc.hasEscapeHatchForNode(node, "o1-redundant-spread-return", ast)) return;
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
	const lines = content.split("\n");
	for (let index = 0; index < lines.length; index++) {
		const lineText = lines[index];
		const lineNumber = index + 1;
		const trimmed = lineText.trim();
		if (shouldIgnoreLine(lineText) || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
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
	}
	return issues;
}
var O1DataStructuresAuditor = class extends FileScanAuditor {
	constructor(roots, projectRoot) {
		const config = getAuditConfig(projectRoot);
		const effectiveRoots = roots ?? config.paths.codeRoots ?? [];
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createRuleCapabilities(O1_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: true,
				changedOnly: false,
				critical: false
			}),
			id: "validate_o1_data_structures",
			name: "O(1) Data Structure & Performance Auditor",
			description: "Búsqueda lineal O(N) o clonado con JSON.parse",
			family: "domain_data",
			ruleIds: O1_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(O1_RULES, "contracts"),
			packageName: "O(1)",
			configKey: "domain",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "⚡",
			ruleDescriptions: {
				"o1-catalog-lookup": "Búsqueda lineal en catálogo",
				"o1-linear-membership": "Búsqueda .includes() en array",
				"o1-object-scan": "Escaneo en Object.keys/values",
				"o1-json-clone": "Clonado con JSON.parse(stringify)",
				"o1-redundant-spread-return": "Retorno redundante con spread"
			},
			ruleRemediations: {
				"o1-catalog-lookup": "📖 GUÍA DE REMEDIACIÓN: o1-catalog-lookup\n1. Causa Raíz: Se detectó una búsqueda lineal O(N) sobre un catálogo o colección estática (ej: CATALOG.find(x => x.id === targetId)) en una ruta de ejecución frecuente. A medida que el catálogo crece, el costo temporal escala linealmente degradando el rendimiento.\n2. Diagnóstico: Busca operaciones .find(), .filter() o .some() sobre arrays estáticos de catálogo.\n3. Solución: Indexa el catálogo una sola vez en un diccionario Record<Id, Item> o Map<Id, Item> para acceder en tiempo constante O(1): CATALOG_BY_ID[targetId].\n4. Ejemplo:\n   ❌ Incorrecto: const item = ITEMS.find(i => i.id === requestedId);\n   ✅ Correcto:   const ITEMS_BY_ID = new Map(ITEMS.map(i => [i.id, i]));\n                  const item = ITEMS_BY_ID.get(requestedId);",
				"o1-linear-membership": "📖 GUÍA DE REMEDIACIÓN: o1-linear-membership\n1. Causa Raíz: Se detectó comprobación de pertenencia O(N) mediante array.includes(valor) o array.indexOf(valor) sobre un array de opciones en un bucle o función frecuente.\n2. Diagnóstico: Busca invocaciones de .includes() sobre colecciones o arrays en la línea señalada.\n3. Solución: Convierte el array en un Set<T> inmutable y consulta pertenencia con set.has(valor) en tiempo O(1).\n4. Ejemplo:\n   ❌ Incorrecto: Comprobar pertenencia lineal en un Array mediante array.includes(valor) en O(N)\n   ✅ Correcto:   Indexar en un Set o Map inmutable y comprobar pertenencia con set.has(valor) en O(1)\n5. Herramienta CLI: Ejecuta \"npm run auditor:o1 inspect <archivo>\" para obtener la sugerencia de reemplazo Dirac automática.",
				"o1-object-scan": "📖 GUÍA DE REMEDIACIÓN: o1-object-scan\n1. Causa Raíz: Se detectó el uso de Object.keys(obj).includes(key) o Object.values(obj).find(...) para comprobar existencia de una clave en un objeto, asignando un array en memoria y recorriéndolo en O(N).\n2. Diagnóstico: Busca Object.keys(...).includes(...) en la línea reportada.\n3. Solución: Comprueba existencia directamente en el objeto con el operador \"in\" o mediante indexación directa O(1).\n4. Ejemplo:\n   ❌ Incorrecto: if (Object.keys(registry).includes(targetKey)) { ... }\n   ✅ Correcto:   if (targetKey in registry) { ... } // o registry[targetKey] !== undefined",
				"o1-json-clone": "📖 GUÍA DE REMEDIACIÓN: o1-json-clone\n1. Causa Raíz: Uso del anti-patrón JSON.parse(JSON.stringify(data)) para clonar estructuras de datos en memoria. Es computacionalmente costoso, pierde tipos especiales (Date, Map, Set, BigInt, RegExp, funciones) y genera excesiva presión en el Garbage Collector.\n2. Diagnóstico: Busca JSON.parse(JSON.stringify(...)) en el archivo.\n3. Solución: Utiliza la función nativa estándar de la plataforma structuredClone(data), o shallow clone con spread { ...obj } si solo requieres clonar el primer nivel.\n4. Ejemplo:\n   ❌ Incorrecto: const copy = JSON.parse(JSON.stringify(gameState));\n   ✅ Correcto:   const copy = structuredClone(gameState);",
				"o1-redundant-spread-return": "📖 GUÍA DE REMEDIACIÓN: o1-redundant-spread-return\n1. Causa Raíz: Una función pura finaliza con \"return [...arr];\" duplicando innecesariamente el array en el heap cuando el consumidor no muta el resultado.\n2. Diagnóstico: Busca return [...array] en funciones de solo lectura.\n3. Solución: Tipa la firma de retorno como \"readonly T[]\" y devuelve la referencia directa al array (return arr;), eliminando la asignación de memoria."
			},
			roots: effectiveRoots,
			allowedExtensions: /* @__PURE__ */ new Set([".ts", ".vue"]),
			projectRoot
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
		const issues = scanFileForO1Issues(relPath, content, getResolvedO1CatalogPatterns());
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
//#endregion
export { DEFAULT_O1_CATALOG_PATTERNS, ESCAPE_HATCHES, O1DataStructuresAuditor, O1DataStructuresAuditor as ValidateO1DataStructuresAuditor, O1_RULES, P_JSON_CLONE, P_OBJECT_SCAN_LOOKUP, P_REDUNDANT_SPREAD_RETURN, P_STATIC_ARRAY_INCLUDES, getResolvedO1CatalogPatterns, scanFileForO1Issues, shouldIgnoreLine };
