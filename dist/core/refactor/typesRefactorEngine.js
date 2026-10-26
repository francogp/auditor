import { BaseRefactorEngine } from "./baseRefactorEngine.js";
import { applyAstReplacementsAcrossFiles, createUnifiedAstSourceFile } from "../astScriptExtractor.js";
import { ValidateTypeAssertionHygieneAuditor } from "../../suites/architecture/validate_type_assertion_hygiene.js";
import fs from "node:fs";
import ts from "typescript";
// src/core/refactor/typesRefactorEngine.ts
/**
* src/core/refactor/typesRefactorEngine.ts
*
* TYPE ASSERTION & RETURN TYPE GOVERNANCE REFACTORING ENGINE (Node.js 26+ Native)
*
* Provides deterministic AST discovery, Dirac micro-context extraction,
* and automated plan-based remediation for:
*   1. `as any` and legacy `<any>` casts
*   2. Double assertions (`as unknown as Target`)
*   3. Missing explicit function return types (`@typescript-eslint/explicit-function-return-type`, TS7050)
*/
const AS_ANY_REGEX = /\bas\s+any\b/g;
const ANGLE_ANY_REGEX = /<any>\s*([a-zA-Z0-9_$.()]+)/g;
const DOUBLE_ASSERTION_REGEX = /\bas\s+(?:unknown|any)\s+as\s+([A-Za-z0-9_$.<>[\]|& ]+)/g;
const VOID_ACTION_CALL_NAMES = /* @__PURE__ */ new Set([
	"notify",
	"emit",
	"hide",
	"show",
	"save",
	"close",
	"open",
	"reset",
	"log",
	"warn",
	"error",
	"info"
]);
function isUntypedFunctionDeclaration(node) {
	return (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) && !node.type;
}
function resolveFunctionReturnTypeInsertRange(node, sourceFile, sourceText) {
	if (ts.isArrowFunction(node)) {
		const arrowStart = node.equalsGreaterThanToken.getStart(sourceFile);
		const match = sourceText.slice(0, arrowStart).match(/\s+$/);
		return {
			start: match && match.index !== void 0 ? match.index : arrowStart,
			end: arrowStart
		};
	}
	if (node.body) {
		const bodyStart = node.body.getStart(sourceFile);
		const match = sourceText.slice(0, bodyStart).match(/\s+$/);
		return {
			start: match && match.index !== void 0 ? match.index : bodyStart,
			end: bodyStart
		};
	}
	return null;
}
var TypesRefactorEngine = class TypesRefactorEngine extends BaseRefactorEngine {
	toolId = "auditor-types";
	configSectionKey = "types";
	constructor(auditorOrOptions, _explicitConfig) {
		const auditor = auditorOrOptions instanceof ValidateTypeAssertionHygieneAuditor ? auditorOrOptions : new ValidateTypeAssertionHygieneAuditor(typeof auditorOrOptions === "string" ? auditorOrOptions : auditorOrOptions?.projectRoot);
		super(auditor);
	}
	discoverInFile(filePath) {
		return TypesRefactorEngine.discoverInFile(filePath);
	}
	createPlan(typesPlanId, typesFindings) {
		return TypesRefactorEngine.buildTypeAssertionPlan(typesPlanId, typesFindings);
	}
	applyPlan(projectRoot, plan) {
		TypesRefactorEngine.applyPlan(projectRoot, plan);
		return { modifiedFiles: plan.targetFiles };
	}
	/**
	* Scans a file to discover type assertions and untyped functions using TypeScript AST.
	*/
	static discoverInFile(filePath) {
		if (!fs.existsSync(filePath)) return [];
		const sourceText = fs.readFileSync(filePath, "utf-8");
		const { sourceFile, textToParse } = createUnifiedAstSourceFile(filePath, sourceText);
		const findings = [];
		const lines = textToParse.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const actualLine = i + 1;
			DOUBLE_ASSERTION_REGEX.lastIndex = 0;
			let doubleMatch;
			if ((doubleMatch = DOUBLE_ASSERTION_REGEX.exec(line)) !== null) {
				const fullMatch = doubleMatch[0];
				const targetType = doubleMatch[1]?.trim() || "TargetType";
				findings.push({
					file: filePath,
					line: actualLine,
					kind: "double-assertion",
					originalSnippet: fullMatch,
					suggestedReplacement: `as ${targetType} /* verify narrowing */`,
					explanation: `Avoid double-casting (${fullMatch}). Use explicit type narrowing or domain-specific guards.`
				});
				continue;
			}
			AS_ANY_REGEX.lastIndex = 0;
			if (AS_ANY_REGEX.test(line)) {
				findings.push({
					file: filePath,
					line: actualLine,
					kind: "as-any",
					originalSnippet: "as any",
					suggestedReplacement: "as unknown",
					explanation: "Avoid loose \"as any\" assertions. Prefer \"as unknown\" or domain types to maintain compile-time safety."
				});
				continue;
			}
			ANGLE_ANY_REGEX.lastIndex = 0;
			let angleMatch;
			if ((angleMatch = ANGLE_ANY_REGEX.exec(line)) !== null) {
				const fullMatch = angleMatch[0];
				const expr = angleMatch[1] || "expr";
				findings.push({
					file: filePath,
					line: actualLine,
					kind: "as-any",
					originalSnippet: fullMatch,
					suggestedReplacement: `(${expr} as unknown)`,
					explanation: `Avoid legacy angle-bracket syntax "${fullMatch}". Use "as unknown" or specific interfaces.`
				});
				continue;
			}
		}
		function visit(node) {
			if (isUntypedFunctionDeclaration(node)) {
				const fnName = TypesRefactorEngine.resolveFunctionName(node, sourceFile);
				const inferredType = TypesRefactorEngine.inferFunctionReturnType(node, sourceFile);
				if (inferredType) {
					const startPos = node.getStart(sourceFile);
					const line = ts.getLineAndCharacterOfPosition(sourceFile, startPos).line + 1;
					const header = TypesRefactorEngine.getFunctionHeader(node, sourceFile);
					findings.push({
						file: filePath,
						line,
						kind: "missing-return-type",
						identifier: fnName,
						originalSnippet: header,
						suggestedReplacement: inferredType,
						explanation: `Function "${fnName}" lacks explicit return type. Inferred contract: "${inferredType}".`
					});
				}
			}
			ts.forEachChild(node, visit);
		}
		visit(sourceFile);
		return findings;
	}
	static resolveFunctionName(node, _sourceFile) {
		if ("name" in node && node.name && ts.isIdentifier(node.name)) return node.name.text;
		const parent = node.parent;
		if (parent) {
			if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
			if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
			if (ts.isPropertyDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
		}
		return "(anonymous)";
	}
	static getFunctionHeader(node, sourceFile) {
		const start = node.getStart(sourceFile);
		const bodyStart = node.body ? node.body.getStart(sourceFile) : node.getEnd();
		return sourceFile.text.slice(start, bodyStart).trim();
	}
	static inferFunctionReturnType(node, sourceFile) {
		const isAsync = TypesRefactorEngine.hasAsyncModifier(node);
		if (node.body && ts.isBlock(node.body)) {
			const returnExpressions = [];
			function findReturns(n) {
				if (n !== node && (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n))) return;
				if (ts.isReturnStatement(n)) {
					if (n.expression) returnExpressions.push(n.expression);
				}
				ts.forEachChild(n, findReturns);
			}
			findReturns(node.body);
			if (returnExpressions.length === 0) return isAsync ? "Promise<void>" : "void";
			const inferred = TypesRefactorEngine.inferMultipleReturns(returnExpressions, sourceFile);
			if (inferred) return isAsync ? `Promise<${inferred}>` : inferred;
			return null;
		}
		if (ts.isArrowFunction(node) && node.body && !ts.isBlock(node.body)) {
			const single = TypesRefactorEngine.inferExpressionType(node.body, sourceFile);
			if (single) return isAsync ? `Promise<${single}>` : single;
		}
		return null;
	}
	static hasAsyncModifier(node) {
		if (!("modifiers" in node) || !Array.isArray(node.modifiers)) return false;
		return node.modifiers.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
	}
	static inferPrimitiveKeywordType(expr) {
		if (expr.kind === ts.SyntaxKind.ThisKeyword) return "this";
		if (expr.kind === ts.SyntaxKind.NullKeyword) return "null";
		if (expr.kind === ts.SyntaxKind.UndefinedKeyword) return "undefined";
		return null;
	}
	static inferArrayLiteralType(expr, sourceFile) {
		if (expr.elements.length === 0) return null;
		const elemTypes = expr.elements.map((el) => TypesRefactorEngine.inferExpressionType(el, sourceFile));
		const first = elemTypes[0];
		if (first && elemTypes.every((t) => t === first)) return `${first}[]`;
		return null;
	}
	static inferObjectLiteralType(expr, sourceFile) {
		const propTypes = [];
		for (const prop of expr.properties) {
			if (!ts.isPropertyAssignment(prop)) return null;
			const name = prop.name.getText(sourceFile);
			const t = TypesRefactorEngine.inferExpressionType(prop.initializer, sourceFile);
			if (!t) return null;
			propTypes.push(`${name}: ${t}`);
		}
		return `{ ${propTypes.join("; ")} }`;
	}
	static inferCallExpressionType(expr) {
		const callName = TypesRefactorEngine.getCallName(expr);
		if (callName.startsWith("set") || callName.startsWith("toggle") || callName.startsWith("clear") || callName.startsWith("add") || callName.startsWith("remove") || VOID_ACTION_CALL_NAMES.has(callName)) return "void";
		return null;
	}
	static inferExpressionType(expr, sourceFile) {
		if (ts.isParenthesizedExpression(expr)) return TypesRefactorEngine.inferExpressionType(expr.expression, sourceFile);
		const primitive = TypesRefactorEngine.inferPrimitiveKeywordType(expr);
		if (primitive) return primitive;
		if (ts.isAsExpression(expr) || ts.isTypeAssertionExpression(expr)) return expr.type.getText(sourceFile);
		if (TypesRefactorEngine.isBooleanExpression(expr)) return "boolean";
		if (TypesRefactorEngine.isNumberExpression(expr)) return "number";
		if (TypesRefactorEngine.isStringExpression(expr)) return "string";
		if (ts.isArrayLiteralExpression(expr)) return TypesRefactorEngine.inferArrayLiteralType(expr, sourceFile);
		if (ts.isObjectLiteralExpression(expr)) return TypesRefactorEngine.inferObjectLiteralType(expr, sourceFile);
		if (ts.isCallExpression(expr)) return TypesRefactorEngine.inferCallExpressionType(expr);
		return null;
	}
	static isBooleanExpression(e) {
		if (ts.isParenthesizedExpression(e)) return TypesRefactorEngine.isBooleanExpression(e.expression);
		if (e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword) return true;
		if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) return true;
		if (ts.isBinaryExpression(e)) {
			const k = e.operatorToken.kind;
			if (k === ts.SyntaxKind.EqualsEqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsEqualsToken || k === ts.SyntaxKind.EqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsToken || k === ts.SyntaxKind.LessThanToken || k === ts.SyntaxKind.GreaterThanToken || k === ts.SyntaxKind.LessThanEqualsToken || k === ts.SyntaxKind.GreaterThanEqualsToken || k === ts.SyntaxKind.InKeyword || k === ts.SyntaxKind.InstanceOfKeyword) return true;
			if (k === ts.SyntaxKind.AmpersandAmpersandToken || k === ts.SyntaxKind.BarBarToken) return TypesRefactorEngine.isBooleanExpression(e.left) && TypesRefactorEngine.isBooleanExpression(e.right);
		}
		if (ts.isCallExpression(e)) {
			const name = TypesRefactorEngine.getCallName(e);
			if ([
				"Boolean",
				"includes",
				"has",
				"some",
				"every",
				"startsWith",
				"endsWith",
				"test",
				"isArray"
			].includes(name) || name.startsWith("is") || name.startsWith("has") || name.startsWith("can") || name.startsWith("should") || name.startsWith("check") || name.startsWith("matches")) return true;
		}
		return false;
	}
	static isNumberExpression(e) {
		if (ts.isParenthesizedExpression(e)) return TypesRefactorEngine.isNumberExpression(e.expression);
		if (ts.isNumericLiteral(e)) return true;
		if (ts.isPrefixUnaryExpression(e) && (e.operator === ts.SyntaxKind.MinusToken || e.operator === ts.SyntaxKind.PlusToken)) return TypesRefactorEngine.isNumberExpression(e.operand);
		if (ts.isBinaryExpression(e)) {
			const k = e.operatorToken.kind;
			if (k === ts.SyntaxKind.PlusToken) {
				if (!TypesRefactorEngine.isStringExpression(e.left) && !TypesRefactorEngine.isStringExpression(e.right)) return true;
			}
			if (k === ts.SyntaxKind.MinusToken || k === ts.SyntaxKind.AsteriskToken || k === ts.SyntaxKind.SlashToken || k === ts.SyntaxKind.PercentToken || k === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken || k === ts.SyntaxKind.GreaterThanGreaterThanToken || k === ts.SyntaxKind.LessThanLessThanToken || k === ts.SyntaxKind.BarToken || k === ts.SyntaxKind.AmpersandToken || k === ts.SyntaxKind.CaretToken) return true;
			if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) return TypesRefactorEngine.isNumberExpression(e.right);
		}
		if (ts.isCallExpression(e)) {
			const name = TypesRefactorEngine.getCallName(e);
			if ([
				"floor",
				"round",
				"ceil",
				"min",
				"max",
				"abs",
				"parseInt",
				"parseFloat",
				"Number",
				"getTime",
				"indexOf",
				"findIndex",
				"random"
			].includes(name) || name.endsWith("Count") || name.endsWith("Index") || name.endsWith("Level") || name.endsWith("Size")) return true;
		}
		if (ts.isPropertyAccessExpression(e)) {
			const name = e.name.text;
			if ([
				"length",
				"size",
				"count",
				"amount",
				"total",
				"index",
				"timestamp",
				"width",
				"height",
				"scale",
				"opacity"
			].includes(name)) return true;
		}
		return false;
	}
	static isStringExpression(e) {
		if (ts.isParenthesizedExpression(e)) return TypesRefactorEngine.isStringExpression(e.expression);
		if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isTemplateExpression(e)) return true;
		if (ts.isBinaryExpression(e)) {
			if (e.operatorToken.kind === ts.SyntaxKind.PlusToken) return TypesRefactorEngine.isStringExpression(e.left) || TypesRefactorEngine.isStringExpression(e.right);
		}
		if (ts.isCallExpression(e)) {
			const name = TypesRefactorEngine.getCallName(e);
			if ([
				"String",
				"join",
				"slice",
				"substring",
				"trim",
				"trimStart",
				"trimEnd",
				"toLowerCase",
				"toUpperCase",
				"replace",
				"replaceAll",
				"padStart",
				"padEnd",
				"toString"
			].includes(name) || name.startsWith("format") || name.endsWith("Name") || name.endsWith("Url") || name.endsWith("Text") || name.endsWith("Label")) return true;
		}
		return false;
	}
	static getCallName(e) {
		const expr = e.expression;
		if (ts.isIdentifier(expr)) return expr.text;
		if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
		return "";
	}
	static inferMultipleReturns(returnExpressions, sourceFile) {
		if (returnExpressions.length === 0) return null;
		const inferred = returnExpressions.map((e) => TypesRefactorEngine.inferExpressionType(e, sourceFile));
		const nonNullInferred = [];
		for (const t of inferred) {
			if (!t) return null;
			nonNullInferred.push(t);
		}
		const unique = Array.from(new Set(nonNullInferred));
		if (unique.length === 1) return unique[0];
		if (unique.length === 2 && (unique.includes("null") || unique.includes("undefined"))) return unique.join(" | ");
		return null;
	}
	/**
	* Creates a deterministic refactoring plan from findings.
	*/
	static buildTypeAssertionPlan(planId, findings) {
		const targetFiles = Array.from(new Set(findings.map((f) => f.file)));
		const assertionReplacements = [];
		const returnTypeInjections = [];
		for (const f of findings) if (f.kind === "as-any" || f.kind === "double-assertion") assertionReplacements.push({
			file: f.file,
			line: f.line,
			originalSnippet: f.originalSnippet,
			replacementSnippet: f.suggestedReplacement.replace(/\s*\/\*.*?\*\/\s*$/, "")
		});
		else if (f.kind === "missing-return-type") returnTypeInjections.push({
			file: f.file,
			line: f.line,
			originalHeader: f.originalSnippet,
			replacementHeader: f.suggestedReplacement
		});
		return {
			version: 1,
			planId,
			targetFiles,
			assertionReplacements,
			returnTypeInjections
		};
	}
	static createPlan(planId, findings) {
		return TypesRefactorEngine.buildTypeAssertionPlan(planId, findings);
	}
	static collectFileReplacements(fullPath, sourceText, plan) {
		const { sourceFile } = createUnifiedAstSourceFile(fullPath, sourceText);
		const replacements = [];
		const fileAssertions = plan.assertionReplacements?.filter((item) => item.file === fullPath || fullPath.endsWith(item.file)) || [];
		for (const item of fileAssertions) {
			let index = sourceText.indexOf(item.originalSnippet);
			while (index !== -1) {
				replacements.push({
					start: index,
					end: index + item.originalSnippet.length,
					text: item.replacementSnippet
				});
				index = sourceText.indexOf(item.originalSnippet, index + 1);
			}
		}
		const fileReturns = plan.returnTypeInjections?.filter((item) => item.file === fullPath || fullPath.endsWith(item.file)) || [];
		if (fileReturns.length > 0) {
			const lineToType = /* @__PURE__ */ new Map();
			for (const item of fileReturns) lineToType.set(item.line, item.replacementHeader);
			function visit(node) {
				if (isUntypedFunctionDeclaration(node)) {
					const startPos = node.getStart(sourceFile);
					const line = ts.getLineAndCharacterOfPosition(sourceFile, startPos).line + 1;
					const returnType = lineToType.get(line);
					if (returnType) {
						const range = resolveFunctionReturnTypeInsertRange(node, sourceFile, sourceText);
						if (range) replacements.push({
							start: range.start,
							end: range.end,
							text: `: ${returnType} `
						});
					}
				}
				ts.forEachChild(node, visit);
			}
			visit(sourceFile);
		}
		return replacements;
	}
	/**
	* Deterministically applies a TypesRefactorPlan across target source files.
	*/
	static applyPlan(targetDir, plan) {
		return applyAstReplacementsAcrossFiles(targetDir, plan.targetFiles, (fullPath, sourceText) => {
			return TypesRefactorEngine.collectFileReplacements(fullPath, sourceText, plan);
		});
	}
};
export { TypesRefactorEngine };
