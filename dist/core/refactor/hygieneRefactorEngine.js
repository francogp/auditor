import { OxlintAuditor } from "../../suites/architecture/validate_oxlint.js";
import { BaseRefactorEngine } from "./baseRefactorEngine.js";
import { applyAstReplacementsAcrossFiles, createUnifiedAstSourceFile } from "../astScriptExtractor.js";
import fs from "node:fs";
import ts from "typescript";
// src/core/refactor/hygieneRefactorEngine.ts
/**
* src/core/refactor/hygieneRefactorEngine.ts
*
* CODEBASE HYGIENE REFACTORING ENGINE (Node.js 26+ Native)
*
* Provides deterministic discovery, Dirac micro-context extraction,
* and automated plan-based remediation for:
*   1. Explicit member accessibility (`@typescript-eslint/explicit-member-accessibility`)
*   2. Modern `globalThis` usage (`unicorn/prefer-global-this`)
*   3. Redundant `void` operator expressions (`eslint/no-void`)
*/
const TARGET_GLOBAL_NAMES = /* @__PURE__ */ new Set([
	"window",
	"self",
	"global"
]);
function isClassMemberCandidate(member) {
	return ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member) || ts.isConstructorDeclaration(member);
}
function hasExplicitAccessibility(member) {
	return (ts.canHaveModifiers(member) ? ts.getModifiers(member) || [] : []).some((m) => m.kind === ts.SyntaxKind.PublicKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword || m.kind === ts.SyntaxKind.PrivateKeyword);
}
function resolveMemberInsertPosition(member, sourceFile, sourceText) {
	let insertPos = member.getStart(sourceFile);
	const decorators = ts.canHaveDecorators(member) ? ts.getDecorators(member) || [] : [];
	if (decorators.length === 0) return insertPos;
	const lastDecorator = decorators[decorators.length - 1];
	if (!lastDecorator) return insertPos;
	insertPos = lastDecorator.getEnd();
	while (insertPos < sourceText.length && /\s/.test(sourceText[insertPos] || "")) {
		if (sourceText[insertPos] === "\n") {
			insertPos++;
			break;
		}
		insertPos++;
	}
	return insertPos;
}
function inspectClassMember(member, sourceFile, sourceText, filePath) {
	if (!isClassMemberCandidate(member)) return null;
	if (member.name && ts.isPrivateIdentifier(member.name)) return null;
	if (hasExplicitAccessibility(member)) return null;
	const insertPos = resolveMemberInsertPosition(member, sourceFile, sourceText);
	const startPos = member.getStart(sourceFile);
	const line = ts.getLineAndCharacterOfPosition(sourceFile, startPos).line + 1;
	const nameText = member.name ? member.name.getText(sourceFile) : "constructor";
	const snippet = sourceText.slice(startPos, Math.min(startPos + 40, sourceText.length)).replace(/\n[\s\S]*/, "");
	return {
		finding: {
			file: filePath,
			line,
			kind: "member-accessibility",
			identifier: nameText,
			originalSnippet: snippet,
			suggestedReplacement: `public ${snippet}`,
			explanation: `Class member "${nameText}" is missing explicit access modifier. Prepend "public" (or protected/private).`
		},
		replacement: {
			start: insertPos,
			end: insertPos,
			text: "public "
		}
	};
}
function isShadowedIdentifier(node) {
	let currentScope = node.parent;
	while (currentScope) {
		if (ts.isFunctionDeclaration(currentScope) || ts.isArrowFunction(currentScope) || ts.isFunctionExpression(currentScope) || ts.isMethodDeclaration(currentScope)) {
			if (currentScope.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === node.text)) return true;
		}
		currentScope = currentScope.parent;
	}
	return false;
}
function isPropertyOrBindingContext(node, parent) {
	if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
	if (ts.isPropertyDeclaration(parent) && parent.name === node) return true;
	if (ts.isMethodDeclaration(parent) && parent.name === node) return true;
	if (ts.isParameter(parent) && parent.name === node) return true;
	if (ts.isVariableDeclaration(parent) && parent.name === node) return true;
	if (ts.isBindingElement(parent) && parent.name === node) return true;
	if (ts.isImportSpecifier(parent)) return true;
	if (ts.isExportSpecifier(parent)) return true;
	if (ts.isTypeReferenceNode(parent)) return true;
	if (ts.isModuleDeclaration(parent)) return true;
	if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
	return false;
}
function inspectGlobalIdentifier(node, sourceFile, filePath) {
	const name = node.text;
	if (!TARGET_GLOBAL_NAMES.has(name)) return null;
	const parent = node.parent;
	if (parent && isPropertyOrBindingContext(node, parent)) return null;
	if (isShadowedIdentifier(node)) return null;
	const startPos = node.getStart(sourceFile);
	const line = ts.getLineAndCharacterOfPosition(sourceFile, startPos).line + 1;
	const replacementText = parent && ts.isTypeOfExpression(parent) ? `globalThis.${name}` : "globalThis";
	return {
		finding: {
			file: filePath,
			line,
			kind: "prefer-global-this",
			identifier: name,
			originalSnippet: name,
			suggestedReplacement: replacementText,
			explanation: `Prefer "globalThis" over environment-specific "${name}".`
		},
		replacement: {
			start: startPos,
			end: node.getEnd(),
			text: replacementText
		}
	};
}
function inspectVoidNode(node, sourceFile, filePath) {
	const startPos = node.getStart(sourceFile);
	const line = ts.getLineAndCharacterOfPosition(sourceFile, startPos).line + 1;
	const exprText = node.expression.getText(sourceFile);
	if (ts.isArrowFunction(node.parent) && node.parent.body === node) {
		const replacementText = `{\n    ${exprText};\n  }`;
		return {
			finding: {
				file: filePath,
				line,
				kind: "no-void",
				originalSnippet: node.getText(sourceFile),
				suggestedReplacement: replacementText,
				explanation: "Arrow function uses \"void\" in concise body. Convert to standard block statement."
			},
			replacement: {
				start: startPos,
				end: node.getEnd(),
				text: replacementText
			}
		};
	}
	return {
		finding: {
			file: filePath,
			line,
			kind: "no-void",
			originalSnippet: node.getText(sourceFile),
			suggestedReplacement: exprText,
			explanation: "Unnecessary unary \"void\" expression. Remove \"void\" operator."
		},
		replacement: {
			start: startPos,
			end: node.expression.getStart(sourceFile),
			text: ""
		}
	};
}
/**
* Inspects a file for code hygiene findings and prepares exact AST text replacements.
*/
function inspectHygieneFile(filePath, sourceText) {
	const { sourceFile } = createUnifiedAstSourceFile(filePath, sourceText);
	const findings = [];
	const replacements = [];
	function visit(node) {
		if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) for (const member of node.members) {
			const res = inspectClassMember(member, sourceFile, sourceText, filePath);
			if (res) {
				findings.push(res.finding);
				replacements.push(res.replacement);
			}
		}
		if (ts.isIdentifier(node)) {
			const res = inspectGlobalIdentifier(node, sourceFile, filePath);
			if (res) {
				findings.push(res.finding);
				replacements.push(res.replacement);
			}
		}
		if (ts.isVoidExpression(node)) {
			const res = inspectVoidNode(node, sourceFile, filePath);
			if (res) {
				findings.push(res.finding);
				replacements.push(res.replacement);
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return {
		findings,
		replacements
	};
}
var HygieneRefactorEngine = class HygieneRefactorEngine extends BaseRefactorEngine {
	toolId = "auditor-hygiene";
	configSectionKey = "oxlint";
	constructor(auditorOrOptions, _explicitConfig) {
		const auditor = auditorOrOptions instanceof OxlintAuditor ? auditorOrOptions : new OxlintAuditor({ projectRoot: typeof auditorOrOptions === "string" ? auditorOrOptions : auditorOrOptions?.projectRoot });
		super(auditor);
	}
	discoverInFile(filePath) {
		return HygieneRefactorEngine.discoverInFile(filePath);
	}
	createPlan(hygienePlanId, hygieneFindings) {
		return HygieneRefactorEngine.buildHygienePlan(hygienePlanId, hygieneFindings);
	}
	applyPlan(projectRoot, plan) {
		HygieneRefactorEngine.applyPlan(projectRoot, plan);
		return { modifiedFiles: plan.targetFiles };
	}
	/**
	* Scans a file to discover accessibility, globalThis, and void violations using TypeScript AST.
	*/
	static discoverInFile(filePath) {
		if (!fs.existsSync(filePath)) return [];
		const { findings } = inspectHygieneFile(filePath, fs.readFileSync(filePath, "utf-8"));
		return findings;
	}
	/**
	* Builds a declarative HygieneRefactorPlan from findings.
	*/
	static buildHygienePlan(planId, findings) {
		const targetFiles = Array.from(new Set(findings.map((f) => f.file)));
		const accessibilityInjections = [];
		const globalThisReplacements = [];
		const voidReplacements = [];
		for (const f of findings) if (f.kind === "member-accessibility") accessibilityInjections.push({
			file: f.file,
			line: f.line,
			originalSnippet: f.originalSnippet,
			replacementSnippet: f.suggestedReplacement
		});
		else if (f.kind === "prefer-global-this") globalThisReplacements.push({
			file: f.file,
			line: f.line,
			originalSnippet: f.originalSnippet,
			replacementSnippet: f.suggestedReplacement
		});
		else if (f.kind === "no-void") voidReplacements.push({
			file: f.file,
			line: f.line,
			originalSnippet: f.originalSnippet,
			replacementSnippet: f.suggestedReplacement
		});
		return {
			version: 1,
			planId,
			targetFiles,
			accessibilityInjections,
			globalThisReplacements,
			voidReplacements
		};
	}
	static createPlan(planId, findings) {
		return HygieneRefactorEngine.buildHygienePlan(planId, findings);
	}
	/**
	* Applies a HygieneRefactorPlan cleanly using AST replacements.
	*/
	static applyPlan(targetDir, plan) {
		return applyAstReplacementsAcrossFiles(targetDir, plan.targetFiles, (fullPath, sourceText) => {
			const { replacements } = inspectHygieneFile(fullPath, sourceText);
			return replacements;
		});
	}
};
export { HygieneRefactorEngine, inspectHygieneFile };
