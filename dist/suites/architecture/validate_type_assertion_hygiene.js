import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isTestFileForCodeAudit } from "../../core/auditTestPredicates.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots, toPosixRelative } from "../../core/auditCoverage.js";
import { AuditedDocument } from "../../core/auditedDocument.js";
import { FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import "../../core/safePath.js";
import { enableCompileCache } from "node:module";
import ts from "typescript";
//#region src/suites/architecture/validate_type_assertion_hygiene.ts
/**
* packages/auditor/src/suites/architecture/validate_type_assertion_hygiene.ts
*
* TYPE ASSERTION HYGIENE & STRICT TYPING AUDITOR (Node.js 26+ Native)
*
* Enforces strict TypeScript assertion hygiene across codebase AST:
* 1. Zero 'as any' or 'any[]' casts.
* 2. Zero double casts ('as unknown as T').
* 3. Zero boolean literal type annotations (': true', ': false').
* 4. Zero floating asynchronous promises without await or void.
* 5. Zero broad array casts ('as string[]', 'as readonly string[]').
*/
enableCompileCache();
const TYPE_ASSERTION_RULES = [
	"type-assertion-zero-any",
	"type-assertion-double-cast",
	"type-assertion-boolean-literal",
	"type-assertion-floating-promise",
	"type-assertion-loose-array"
];
const EXTENSIONS = /* @__PURE__ */ new Set([".ts", ".vue"]);
const P_TYPECAST_INLINE_ANY = /\bas\s+any\b/g;
const P_TYPECAST_ARRAY_ANY_UNKNOWN = /\bas\s+(?:unknown|any)\[\]/g;
const P_TYPECAST_UNKNOWN = /\bas\s+unknown\s+as\b/g;
const P_DOUBLE_CAST_DOMAIN_ID = /\bas\s+(?:unknown|any)\s+as\s+[A-Z]\w*Id\b/g;
const P_BOOLEAN_LITERAL_TYPE_ANNOTATION = /\b(?:(?:export\s+)?const|let|var)\s+[A-Z_a-z]\w*\s*:\s*(?:true|false)\b|\b(?:export\s+)?type\s+[A-Z_a-z]\w*\s*=\s*(?:true|false)\s*;|^\s*(?:readonly\s+)?[A-Z_a-z]\w*\??:\s*(?:true|false)\s*;|\(\s*[A-Z_a-z]\w*\??:\s*(?:true|false)\b/gm;
const P_FLOATING_PROMISE = /^\s*(?!(?:await|void|return|const|let|var)\s)(?:[A-Z_a-z]\w*\.)?[a-z]\w*Async\s*\([^)]*\)\s*;/gm;
const P_TYPECAST_READONLY_STRING_ARRAY = /\bas\s+(?:readonly\s+)?string\[\]/g;
function isStringArrayType(typeNode) {
	if (ts.isArrayTypeNode(typeNode) && typeNode.elementType.kind === ts.SyntaxKind.StringKeyword) return true;
	if (ts.isTypeOperatorNode(typeNode) && typeNode.operator === ts.SyntaxKind.ReadonlyKeyword) return ts.isArrayTypeNode(typeNode.type) && typeNode.type.elementType.kind === ts.SyntaxKind.StringKeyword;
	return false;
}
function reportLooseArrayCast(node, doc, ast, issues) {
	if (doc.hasEscapeHatchForNode(node, "type-assertion-loose-array", ast)) return;
	const { line, column } = doc.getNodeLineAndColumn(node, ast);
	issues.push({
		ruleId: "type-assertion-loose-array",
		line,
		column,
		message: "Typecast `as string[]` or `as readonly string[]` widens domain collection — preserve literal types with `as const`",
		context: node.getText(ast).slice(0, 100).replace(/\n/g, "↵")
	});
}
function checkAsExpression(node, doc, ast, issues) {
	const typeNode = node.type;
	if (typeNode.kind === ts.SyntaxKind.AnyKeyword) {
		if (!doc.hasEscapeHatchForNode(node, "type-assertion-zero-any", ast)) {
			const { line, column } = doc.getNodeLineAndColumn(node, ast);
			issues.push({
				ruleId: "type-assertion-zero-any",
				line,
				column,
				message: "Type assertion `as any` degrades type safety — derive domain type or specify precise union",
				context: node.getText(ast).slice(0, 100).replace(/\n/g, "↵")
			});
		}
	} else if (ts.isArrayTypeNode(typeNode)) {
		const el = typeNode.elementType;
		if (el.kind === ts.SyntaxKind.AnyKeyword || el.kind === ts.SyntaxKind.UnknownKeyword) {
			if (!doc.hasEscapeHatchForNode(node, "type-assertion-zero-any", ast)) {
				const { line, column } = doc.getNodeLineAndColumn(node, ast);
				issues.push({
					ruleId: "type-assertion-zero-any",
					line,
					column,
					message: "Array typecast `as any[]` or `as unknown[]` degrades type safety",
					context: node.getText(ast).slice(0, 100).replace(/\n/g, "↵")
				});
			}
		} else if (el.kind === ts.SyntaxKind.StringKeyword) reportLooseArrayCast(node, doc, ast, issues);
	} else if (isStringArrayType(typeNode)) reportLooseArrayCast(node, doc, ast, issues);
	const inner = node.expression;
	if (ts.isAsExpression(inner)) {
		const innerType = inner.type;
		if (innerType.kind === ts.SyntaxKind.UnknownKeyword || innerType.kind === ts.SyntaxKind.AnyKeyword) {
			if (!doc.hasEscapeHatchForNode(node, "type-assertion-double-cast", ast)) {
				const { line, column } = doc.getNodeLineAndColumn(node, ast);
				issues.push({
					ruleId: "type-assertion-double-cast",
					line,
					column,
					message: "Double type assertion `as unknown as ...` bypasses type checker",
					context: node.getText(ast).slice(0, 100).replace(/\n/g, "↵")
				});
			}
		}
	}
}
function checkBooleanLiteralAnnotation(node, doc, ast, issues) {
	if (!ts.isVariableDeclaration(node) && !ts.isPropertyDeclaration(node) && !ts.isPropertySignature(node) && !ts.isParameter(node) && !ts.isTypeAliasDeclaration(node)) return;
	const typeNode = node.type;
	if (!typeNode) return;
	let isBoolLit = false;
	if (typeNode.kind === ts.SyntaxKind.LiteralType) {
		const lit = typeNode.literal;
		if (lit.kind === ts.SyntaxKind.TrueKeyword || lit.kind === ts.SyntaxKind.FalseKeyword) isBoolLit = true;
	} else if (typeNode.kind === ts.SyntaxKind.TrueKeyword || typeNode.kind === ts.SyntaxKind.FalseKeyword) isBoolLit = true;
	if (!isBoolLit) return;
	if (doc.hasEscapeHatchForNode(node, "type-assertion-boolean-literal", ast)) return;
	const { line, column } = doc.getNodeLineAndColumn(node, ast);
	issues.push({
		ruleId: "type-assertion-boolean-literal",
		line,
		column,
		message: "Type annotation with boolean literal `true` or `false` — use `boolean` type or domain state",
		context: node.getText(ast).slice(0, 100).replace(/\n/g, "↵")
	});
}
function checkFloatingPromise(node, doc, ast, issues) {
	if (!ts.isExpressionStatement(node)) return;
	const expr = node.expression;
	if (!ts.isCallExpression(expr)) return;
	let fnName = "";
	if (ts.isIdentifier(expr.expression)) fnName = expr.expression.text;
	else if (ts.isPropertyAccessExpression(expr.expression)) fnName = expr.expression.name.text;
	if (!fnName.endsWith("Async")) return;
	if (doc.hasEscapeHatchForNode(node, "type-assertion-floating-promise", ast)) return;
	const { line, column } = doc.getNodeLineAndColumn(node, ast);
	issues.push({
		ruleId: "type-assertion-floating-promise",
		line,
		column,
		message: "Floating Promise call `...Async()` without await or void — unhandled async execution",
		context: node.getText(ast).slice(0, 100).replace(/\n/g, "↵")
	});
}
var ValidateTypeAssertionHygieneAuditor = class extends FileScanAuditor {
	constructor(options) {
		const rootPath = typeof options === "string" ? options : options?.projectRoot;
		const cfg = getAuditConfig(rootPath);
		const codeRoots = typeof options === "object" && options?.roots ? options.roots : cfg.paths.codeRoots ?? [];
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createRuleCapabilities(TYPE_ASSERTION_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: true,
				changedOnly: false,
				critical: false
			}),
			id: "validate_type_assertion_hygiene",
			name: "TypeScript Assertion & Strict Typing Hygiene",
			description: "Prohíbe as any, doble casteo y promesas flotantes",
			family: "architecture",
			ruleIds: TYPE_ASSERTION_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(TYPE_ASSERTION_RULES, "contracts"),
			packageName: "Tipos",
			icon: "🛡️",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			ruleDescriptions: {
				"type-assertion-zero-any": "Prohibición de as any o any[]",
				"type-assertion-double-cast": "Prohibición de doble casteo as unknown as",
				"type-assertion-boolean-literal": "Prohibición de anotación literal true/false",
				"type-assertion-floating-promise": "Prohibición de promesa flotante sin await",
				"type-assertion-loose-array": "Prohibición de casteo a string[] o readonly"
			},
			ruleRemediations: {
				"type-assertion-zero-any": "📖 GUÍA DE REMEDIACIÓN: type-assertion-zero-any\n1. Causa Raíz: Se utilizó un type assertion `as any` o `as any[]`, lo que desactiva por completo el sistema de tipos de TypeScript y oculta errores en tiempo de compilación.\n2. Diagnóstico: Ubica la aserción `as any` en la línea reportada.\n3. Solución Canónica:\n   a) Reemplázala por el tipo estricto real o interfaz correspondiente.\n   b) Si los datos provienen de una fuente externa (API, JSON, localStorage), usa `unknown` y valida el esquema en tiempo de ejecución con Valibot o type guards.\n   c) Si es una librería externa sin tipar, tipifícala formalmente en `types/` o añade `// type-assertion-zero-any-ok: <justificación>`.\n4. Ejemplo:\n   ❌ Inseguro: `const user = payload as any;`\n   ✅ Seguro:   `const user: UserProfile = v.parse(UserProfileSchema, payload);`",
				"type-assertion-double-cast": "📖 GUÍA DE REMEDIACIÓN: type-assertion-double-cast\n1. Causa Raíz: Se aplicó un doble casteo `as unknown as T` o `as any as T` para forzar la compatibilidad entre dos tipos no solapados, eludiendo la seguridad del compilador.\n2. Diagnóstico: Inspecciona la expresión con doble casteo.\n3. Solución Canónica:\n   a) Modela adecuadamente la estructura de datos o usa una función adaptadora/conversora con validación.\n   b) Si es un mock en test, define un fixture parcial tipado con `Partial<T>` o factoría de pruebas.\n4. Ejemplo:\n   ❌ Inseguro: `const entity = raw as unknown as Entity;`\n   ✅ Seguro:   `const entity = toEntity(raw);`",
				"type-assertion-boolean-literal": "📖 GUÍA DE REMEDIACIÓN: type-assertion-boolean-literal\n1. Causa Raíz: Se anotó un campo o variable con el tipo literal `: true` o `: false` en lugar del tipo primitivo `: boolean`, impidiendo reasignaciones lógicas.\n2. Diagnóstico: Revisa la definición de tipo en la línea indicada.\n3. Solución Canónica: Cambia la anotación literal a `: boolean` (o usa uniones discriminadas tipadas si se trata de un patrón de estado finito).\n4. Ejemplo:\n   ❌ Incorrecto: `interface Config { isEnabled: true; }`\n   ✅ Correcto:   `interface Config { isEnabled: boolean; }`",
				"type-assertion-floating-promise": "📖 GUÍA DE REMEDIACIÓN: type-assertion-floating-promise\n1. Causa Raíz: Se invocó una función asíncrona (con sufijo `...Async()`) como una declaración de expresión sin prefijo `await` ni operador `void`, provocando que la promesa flote en segundo plano sin captura de errores.\n2. Diagnóstico: Ubica la llamada asíncrona sin await.\n3. Solución Canónica:\n   a) Antepón `await` si la función contenedora es asíncrona (`await service.saveAsync()`).\n   b) Si la ejecución fire-and-forget es deliberada, márcala explícitamente con `void` (`void service.logEventAsync();`).\n4. Ejemplo:\n   ❌ Promesa flotante: `doSaveAsync();`\n   ✅ Manejada:         `await doSaveAsync();` o `void doSaveAsync();`",
				"type-assertion-loose-array": "📖 GUÍA DE REMEDIACIÓN: type-assertion-loose-array\n1. Causa Raíz: Se utilizó `as string[]` o `as readonly string[]` en un array de literales, ensanchando la colección y destruyendo la inferencia de tipos literales de dominio.\n2. Diagnóstico: Examina el casteo del array en la línea señalada.\n3. Solución Canónica: Sustituye el casteo laxo por `as const` para preservar los tipos literales exactos y derivar el tipo unión correspondiente.\n4. Ejemplo:\n   ❌ Laxo:     Castear un array de literales mediante \"as string[]\"\n   ✅ Canónico: Aplicar \"as const\" para preservar los literales exactos (ej: as const satisfies readonly string[])"
			},
			coverage: {
				include: deriveCoverageFromRoots(codeRoots, EXTENSIONS).include,
				exclude: [
					"coverage/**",
					"dist/**",
					"scratch/**",
					".agents/**"
				]
			},
			roots: codeRoots,
			allowedExtensions: EXTENSIONS,
			extraIgnorePatterns: [
				"coverage/**",
				"dist/**",
				"scratch/**",
				".agents/**"
			],
			projectRoot: rootPath
		});
	}
	async scanFile(filePath, content) {
		const rel = toPosixRelative(this.projectRoot, filePath);
		if (isTestFileForCodeAudit(rel, this.projectRoot) || rel.includes("validate_type_assertion_hygiene.ts") || rel.includes("validate_domain_types.ts")) return;
		const doc = new AuditedDocument(filePath, content, filePath);
		const ast = doc.getAst();
		if (ast) {
			const issues = [];
			this.scanAst(doc, ast, issues);
			for (const rule of TYPE_ASSERTION_RULES) {
				const ruleIssues = issues.filter((i) => i.ruleId === rule);
				this.runSubAuditorSync(rule, () => {
					for (const issue of ruleIssues) this.addViolation({
						ruleId: issue.ruleId,
						severity: "error",
						file: rel,
						line: issue.line,
						column: issue.column,
						message: issue.message,
						context: issue.context
					});
				});
			}
			return;
		}
		this.scanRegexFallback(content, rel);
	}
	scanAst(doc, ast, issues) {
		const visit = (node) => {
			if (ts.isAsExpression(node)) checkAsExpression(node, doc, ast, issues);
			else {
				checkBooleanLiteralAnnotation(node, doc, ast, issues);
				checkFloatingPromise(node, doc, ast, issues);
			}
			ts.forEachChild(node, visit);
		};
		visit(ast);
	}
	scanRegexFallback(content, rel) {
		const lines = content.split("\n");
		const shouldReportCast = (_match, line) => !line.includes("// domain-ok:") && !line.includes("// any-ok:") && !line.includes("// type-ok:") && !line.includes("// no-domain:") && !line.includes("// open-record:");
		this.scanPattern(content, lines, rel, P_TYPECAST_INLINE_ANY, "type-assertion-zero-any", shouldReportCast, "Type assertion `as any` degrades type safety — derive domain type or specify precise union");
		this.scanPattern(content, lines, rel, P_TYPECAST_ARRAY_ANY_UNKNOWN, "type-assertion-zero-any", shouldReportCast, "Array typecast `as any[]` or `as unknown[]` degrades type safety");
		this.scanPattern(content, lines, rel, P_TYPECAST_UNKNOWN, "type-assertion-double-cast", (_match, line) => {
			if (line.includes("// domain-ok:") || line.includes("// cast-ok:") || line.includes("// double-cast-ok:")) return false;
			return true;
		}, "Double type assertion `as unknown as ...` bypasses type checker");
		this.scanPattern(content, lines, rel, P_DOUBLE_CAST_DOMAIN_ID, "type-assertion-double-cast", (_match, line) => {
			if (line.includes("// domain-ok:") || line.includes("// cast-ok:")) return false;
			return true;
		}, "Double type assertion `as unknown as [Domain]Id` bypasses type checking");
		this.scanPattern(content, lines, rel, P_BOOLEAN_LITERAL_TYPE_ANNOTATION, "type-assertion-boolean-literal", (_match, line) => {
			if (line.includes("// domain-ok:") || line.includes("// literal-ok:")) return false;
			return true;
		}, "Type annotation with boolean literal `true` or `false` — use `boolean` type or domain state");
		this.scanPattern(content, lines, rel, P_FLOATING_PROMISE, "type-assertion-floating-promise", (_match, line) => {
			if (line.includes("// promise-ok:") || line.includes("// void-ok:")) return false;
			return true;
		}, "Floating Promise call `...Async()` without await or void — unhandled async execution");
		this.scanPattern(content, lines, rel, P_TYPECAST_READONLY_STRING_ARRAY, "type-assertion-loose-array", (_match, line) => {
			if (line.includes("// domain-ok:") || line.includes("// array-ok:") || line.includes("// no-domain:") || line.includes("// type-ok:") || line.includes("// open-record:")) return false;
			return true;
		}, "Typecast `as string[]` or `as readonly string[]` widens domain collection — preserve literal types with `as const`");
	}
};
await FileScanAuditor.runCliIfMain(import.meta.url, new ValidateTypeAssertionHygieneAuditor());
//#endregion
export { TYPE_ASSERTION_RULES, ValidateTypeAssertionHygieneAuditor };
