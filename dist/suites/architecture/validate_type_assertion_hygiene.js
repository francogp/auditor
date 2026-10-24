import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isTestFileForCodeAudit } from "../../core/auditTestPredicates.js";
import { toPosixRelative } from "../../core/safePath.js";
import "../../core/auditConfig.js";
import { getEffectiveIgnoreGlobs } from "../../core/canonicalIgnoreRegistry.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { AuditedDocument } from "../../core/auditedDocument.js";
import { FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import ts from "typescript";
// src/suites/architecture/validate_type_assertion_hygiene.ts
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
		const { line, column } = doc.getNodeLineAndColumn(node, ast);
		issues.push({
			ruleId: "type-assertion-zero-any",
			line,
			column,
			message: "Type assertion `as any` degrades type safety — derive domain type or specify precise union",
			context: node.getText(ast).slice(0, 100).replace(/\n/g, "↵")
		});
	} else if (ts.isArrayTypeNode(typeNode)) {
		const el = typeNode.elementType;
		if (el.kind === ts.SyntaxKind.AnyKeyword || el.kind === ts.SyntaxKind.UnknownKeyword) {
			const { line, column } = doc.getNodeLineAndColumn(node, ast);
			issues.push({
				ruleId: "type-assertion-zero-any",
				line,
				column,
				message: "Array typecast `as any[]` or `as unknown[]` degrades type safety",
				context: node.getText(ast).slice(0, 100).replace(/\n/g, "↵")
			});
		} else if (el.kind === ts.SyntaxKind.StringKeyword) reportLooseArrayCast(node, doc, ast, issues);
	} else if (isStringArrayType(typeNode)) reportLooseArrayCast(node, doc, ast, issues);
	const inner = node.expression;
	if (ts.isAsExpression(inner)) {
		const innerType = inner.type;
		if (innerType.kind === ts.SyntaxKind.UnknownKeyword || innerType.kind === ts.SyntaxKind.AnyKeyword) {
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
		const typeIgnores = Array.from(getEffectiveIgnoreGlobs(rootPath, { extraGlobs: [...cfg.types?.ignoreGlobs ?? [], ...cfg.types?.exemptPaths ?? []] }));
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
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
			description: "Prohibits as any, double casting, and floating promises",
			family: "architecture",
			ruleIds: TYPE_ASSERTION_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(TYPE_ASSERTION_RULES, "contracts"),
			packageName: "Types",
			icon: "🛡️",
			configKey: "types",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			ruleDescriptions: {
				"type-assertion-zero-any": "Prohibition of as any or any[]",
				"type-assertion-double-cast": "Prohibition of double cast as unknown as",
				"type-assertion-boolean-literal": "Literal true/false annotation banned",
				"type-assertion-floating-promise": "Floating promise without await banned",
				"type-assertion-loose-array": "Prohibition of cast to string[] or readonly"
			},
			ruleRemediations: {
				"type-assertion-zero-any": "📖 REMEDIATION GUIDE: type-assertion-zero-any\n1. Root Cause: A type assertion `as any` or `as any[]` was used, which completely disables TypeScript type checking and masks compile-time errors.\n2. Diagnosis: Locate the `as any` assertion at the reported line.\n3. Canonical Solution:\n   a) Replace it with the real strict type or corresponding interface.\n   b) If the data comes from an external source (API, JSON, localStorage), use `unknown` and validate at runtime via Valibot schemas or type guards.\n   c) If this is an untyped third-party library, declare an ambient module type definition in `src/types/`.\n4. Example / Auto-fix command:\n   ❌ Insecure: `const user = payload as any;`\n   ✅ Secure:   `const user: UserProfile = v.parse(UserProfileSchema, payload);`",
				"type-assertion-double-cast": "📖 REMEDIATION GUIDE: type-assertion-double-cast\n1. Root Cause: A double cast `as unknown as T` or `as any as T` was applied to force compatibility between non-overlapping types, bypassing compiler safety.\n2. Diagnosis: Inspect the expression with the double cast.\n3. Canonical Solution:\n   a) Properly model the data structure or use an adapter/converter function with validation.\n   b) If mocking in tests, define a typed partial fixture with `Partial<T>` or a test factory.\n4. Example / Auto-fix command:\n   ❌ Insecure: `const entity = raw as unknown as Entity;`\n   ✅ Secure:   `const entity = toEntity(raw);`",
				"type-assertion-boolean-literal": "📖 REMEDIATION GUIDE: type-assertion-boolean-literal\n1. Root Cause: A field or variable was annotated with literal type `: true` or `: false` instead of primitive `: boolean`, preventing valid boolean reassignment.\n2. Diagnosis: Check the type definition at the reported line.\n3. Canonical Solution: Change literal annotation to `: boolean` (or use typed discriminated unions for finite state patterns).\n4. Example / Auto-fix command:\n   ❌ Incorrect: `interface Config { isEnabled: true; }`\n   ✅ Correct:   `interface Config { isEnabled: boolean; }`",
				"type-assertion-floating-promise": "📖 REMEDIATION GUIDE: type-assertion-floating-promise\n1. Root Cause: An asynchronous function (with suffix `...Async()`) was invoked as an expression statement without `await` or `void`, causing the Promise to float unhandled in the background.\n2. Diagnosis: Locate the async invocation without await.\n3. Canonical Solution:\n   a) Prepend `await` if the containing function is async (`await service.saveAsync()`).\n   b) If intentional fire-and-forget execution, mark explicitly with `void` (`void service.logEventAsync();`).\n4. Example / Auto-fix command:\n   ❌ Floating Promise: `doSaveAsync();`\n   ✅ Handled:          `await doSaveAsync();` or `void doSaveAsync();`",
				"type-assertion-loose-array": "📖 REMEDIATION GUIDE: type-assertion-loose-array\n1. Root Cause: `as string[]` or `as readonly string[]` was used on a literal array, widening the collection and destroying domain literal type inference.\n2. Diagnosis: Examine the array cast at the reported line.\n3. Canonical Solution: Replace the loose array cast with `as const` to preserve exact literal types and derive corresponding union types.\n4. Example / Auto-fix command:\n   ❌ Loose:     Casting a literal array via `as string[]`\n   ✅ Canonical: Apply `as const satisfies readonly string[]`"
			},
			coverage: {
				include: deriveCoverageFromRoots(codeRoots, EXTENSIONS).include,
				exclude: typeIgnores
			},
			roots: codeRoots,
			allowedExtensions: EXTENSIONS,
			extraIgnorePatterns: typeIgnores,
			projectRoot: rootPath
		});
	}
	async scanFile(filePath, content) {
		const rel = toPosixRelative(this.projectRoot, filePath);
		if (isTestFileForCodeAudit(rel, this.projectRoot) || this.isPathExempt(rel)) return;
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
		this.scanPattern(content, lines, rel, P_TYPECAST_INLINE_ANY, "type-assertion-zero-any", () => true, "Type assertion `as any` degrades type safety — derive domain type or specify precise union");
		this.scanPattern(content, lines, rel, P_TYPECAST_ARRAY_ANY_UNKNOWN, "type-assertion-zero-any", () => true, "Array typecast `as any[]` or `as unknown[]` degrades type safety");
		this.scanPattern(content, lines, rel, P_TYPECAST_UNKNOWN, "type-assertion-double-cast", () => true, "Double type assertion `as unknown as ...` bypasses type checker");
		this.scanPattern(content, lines, rel, P_DOUBLE_CAST_DOMAIN_ID, "type-assertion-double-cast", () => true, "Double type assertion `as unknown as [Domain]Id` bypasses type checking");
		this.scanPattern(content, lines, rel, P_BOOLEAN_LITERAL_TYPE_ANNOTATION, "type-assertion-boolean-literal", () => true, "Type annotation with boolean literal `true` or `false` — use `boolean` type or domain state");
		this.scanPattern(content, lines, rel, P_FLOATING_PROMISE, "type-assertion-floating-promise", () => true, "Floating Promise call `...Async()` without await or void — unhandled async execution");
		this.scanPattern(content, lines, rel, P_TYPECAST_READONLY_STRING_ARRAY, "type-assertion-loose-array", () => true, "Typecast `as string[]` or `as readonly string[]` widens domain collection — preserve literal types with `as const`");
	}
};
await FileScanAuditor.runCliIfMain(import.meta.url, new ValidateTypeAssertionHygieneAuditor());
export { TYPE_ASSERTION_RULES, ValidateTypeAssertionHygieneAuditor };
