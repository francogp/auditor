import { safeReadFileSync, tryOrNull } from "../safeUtils.js";
import { parseVueSfc as parseVueSfcBlocks } from "../vueSfcParser.js";
import { BaseRefactorEngine } from "./baseRefactorEngine.js";
import { ESTIMATED_TOKENS_PER_CHAR } from "./refactorContracts.js";
import { MagicNumbersAuditor as ValidateMagicNumbersAuditor, resolveSignedNumericLiteral } from "../../suites/architecture/validate_magic_numbers.js";
import { MagicNumberHarness } from "./magicNumberHarness.js";
import path from "node:path";
import fs from "node:fs";
import ts from "typescript";
// src/core/refactor/magicNumberExtractor.ts
/**
* src/core/refactor/magicNumberExtractor.ts
*
* CANONICAL POLYGLOT MAGIC LITERAL EXTRACTOR & SUPER-DIRAC BATCH COMPRESSOR
* Scans TS, Vue SFC (<script> & <style>), and SCSS files.
* Provides Zero-Token semantic AST inference, design token mapping, and compact batch clustering.
*/
const UNIVERSAL_SENTINELS = /* @__PURE__ */ new Set([
	-1,
	0,
	.5,
	1,
	2,
	3,
	4,
	5,
	10,
	24,
	60,
	100,
	360,
	1e3,
	1024
]);
const STANDARD_RADIX = /* @__PURE__ */ new Set([
	2,
	8,
	10,
	16,
	32,
	36
]);
var MagicNumberExtractor = class MagicNumberExtractor extends BaseRefactorEngine {
	toolId = "auditor-magic";
	configSectionKey = "constants";
	get allowedExtensions() {
		return /* @__PURE__ */ new Set([
			...this.auditor.allowedExtensions,
			".scss",
			".css"
		]);
	}
	existingConstants = [];
	cssVariables = /* @__PURE__ */ new Map();
	constructor(auditorOrOptions, _explicitConfig) {
		const auditor = auditorOrOptions instanceof ValidateMagicNumbersAuditor ? auditorOrOptions : new ValidateMagicNumbersAuditor(typeof auditorOrOptions === "string" ? { projectRoot: auditorOrOptions } : auditorOrOptions);
		super(auditor);
	}
	/**
	* Data catalog paths (paths.dataRoots) are exempt from magic number checks,
	* matching validate_magic_numbers suite behavior 1:1.
	*/
	shouldIncludeDataPaths() {
		return false;
	}
	/**
	* Discovers all candidate source files (TS, Vue SFC, SCSS) in a project
	* dynamically driven by audit.config.ts.
	*/
	static discoverScannableFiles(projectRoot) {
		return new MagicNumberExtractor({ projectRoot }).getScannableFiles().map((f) => path.normalize(f));
	}
	/**
	* Pre-indexes existing exported constants and CSS variables across the repository.
	*/
	indexProjectConstants(projectRoot = this.projectRoot) {
		this.existingConstants.length = 0;
		this.cssVariables.clear();
		const scannable = this.getScannableFiles();
		for (const rel of scannable) {
			const full = path.resolve(projectRoot, rel);
			if (rel.endsWith(".ts")) this.indexTsConstants(full);
			else if (rel.endsWith(".scss") || rel.endsWith(".css")) this.indexCssVariables(full);
		}
	}
	discoverInFile(filePath) {
		const relFile = path.isAbsolute(filePath) ? path.relative(this.projectRoot, filePath) : filePath;
		return this.scanFile(this.projectRoot, relFile);
	}
	createPlan(id, findings) {
		const targetFile = findings[0]?.file ?? "unknown";
		return this.createRefactorPlan(id, targetFile, findings);
	}
	applyPlan(projectRoot, plan) {
		MagicNumberHarness.execute(projectRoot, plan);
		return { modifiedFiles: plan.targetFiles };
	}
	indexVariableDeclaration(decl, isExported, absPath) {
		if (!ts.isIdentifier(decl.name) || !decl.initializer) return;
		const name = decl.name.text;
		if (name !== name.toUpperCase() || name.length < 3) return;
		if (ts.isNumericLiteral(decl.initializer)) this.existingConstants.push({
			symbol: name,
			value: parseFloat(decl.initializer.text),
			file: absPath,
			isExported,
			isCssVariable: false
		});
		else if (ts.isStringLiteral(decl.initializer)) this.existingConstants.push({
			symbol: name,
			value: decl.initializer.text,
			file: absPath,
			isExported,
			isCssVariable: false
		});
	}
	indexTsConstants(absPath) {
		tryOrNull(() => {
			const code = fs.readFileSync(absPath, "utf8");
			const sf = ts.createSourceFile(absPath, code, ts.ScriptTarget.Latest, true);
			const visit = (node) => {
				if (ts.isVariableStatement(node)) {
					const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
					for (const decl of node.declarationList.declarations) this.indexVariableDeclaration(decl, isExported, absPath);
				}
				ts.forEachChild(node, visit);
			};
			visit(sf);
		});
	}
	indexCssVariables(absPath) {
		const code = safeReadFileSync(absPath);
		if (!code) return;
		const varRegex = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
		let match;
		while ((match = varRegex.exec(code)) !== null) {
			const varName = match[1];
			const varValue = match[2].trim();
			this.cssVariables.set(varValue, varName);
			this.existingConstants.push({
				symbol: varName,
				value: varValue,
				file: absPath,
				isExported: true,
				isCssVariable: true
			});
		}
	}
	/**
	* Scans a target file for magic literals across TS, Vue SFC, and SCSS.
	*/
	scanFile(projectRoot, relFile) {
		const absPath = path.resolve(projectRoot, relFile);
		if (!fs.existsSync(absPath)) return [];
		const content = fs.readFileSync(absPath, "utf8");
		const items = [];
		if (relFile.endsWith(".ts") || relFile.endsWith(".tsx") || relFile.endsWith(".js")) this.scanTypeScriptCode(relFile, content, 0, "numeric-ts", items);
		else if (relFile.endsWith(".vue")) {
			const { scripts, styles } = parseVueSfcBlocks(content);
			for (const script of scripts) this.scanTypeScriptCode(relFile, script.content, script.contentStartIndex, "numeric-vue-script", items);
			for (const style of styles) this.scanScssCode(relFile, style.content, style.contentStartIndex, items);
		} else if (relFile.endsWith(".scss") || relFile.endsWith(".css")) this.scanScssCode(relFile, content, 0, items);
		return items;
	}
	scanTypeScriptCode(file, code, offsetDelta, kind, results) {
		const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
		const lines = code.split("\n");
		let counter = 1;
		const visit = (node) => {
			if (ts.isNumericLiteral(node)) {
				const { val, reportedNode } = resolveSignedNumericLiteral(node);
				if (!this.isExemptTsLiteral(node, reportedNode, val)) {
					const { line, character } = sf.getLineAndCharacterOfPosition(reportedNode.getStart(sf));
					const lineText = lines[line] ?? "";
					const startOffset = reportedNode.getStart(sf) + offsetDelta;
					const endOffset = reportedNode.getEnd() + offsetDelta;
					const enclosingSymbol = this.findEnclosingSymbol(reportedNode);
					const { role, candidateName } = this.inferSemanticRoleAndName(reportedNode, val, enclosingSymbol);
					const matching = this.existingConstants.find((c) => typeof c.value === "number" && Math.abs(c.value - val) < 1e-4);
					const isZeroToken = Boolean(matching || role !== "unclassified" && candidateName);
					results.push({
						id: `M${counter++}`,
						file,
						kind,
						line: line + 1,
						column: character + 1,
						startOffset,
						endOffset,
						rawValue: reportedNode.getText(sf),
						numericValue: val,
						lineSnippet: lineText.trim(),
						enclosingSymbol,
						semanticRole: role,
						autoCandidateName: candidateName ?? (matching ? matching.symbol : void 0),
						matchingExistingConstant: matching ? {
							symbol: matching.symbol,
							moduleSpecifier: matching.file
						} : void 0,
						isZeroTokenResolvable: isZeroToken
					});
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(sf);
	}
	scanScssCode(file, scssContent, offsetDelta, results) {
		const lines = scssContent.split("\n");
		let counter = 1;
		const zIndexRegex = /z-index\s*:\s*(-?\d+)\b/gi;
		let zMatch;
		while ((zMatch = zIndexRegex.exec(scssContent)) !== null) {
			const rawVal = zMatch[1];
			const numVal = parseInt(rawVal, 10);
			if (numVal !== 0 && numVal !== -1 && numVal !== 1) {
				const lineIdx = scssContent.slice(0, zMatch.index).split("\n").length - 1;
				const lineText = lines[lineIdx] ?? "";
				if (!lineText.includes("var(")) {
					const varMatch = this.cssVariables.get(rawVal);
					results.push({
						id: `SZ${counter++}`,
						file,
						kind: "z-index-scss",
						line: lineIdx + 1,
						column: 1,
						startOffset: zMatch.index + offsetDelta,
						endOffset: zMatch.index + zMatch[0].length + offsetDelta,
						rawValue: zMatch[0],
						numericValue: numVal,
						lineSnippet: lineText.trim(),
						semanticRole: "z-index-layer",
						autoCandidateName: varMatch ? `var(${varMatch})` : `var(--z-layer-${rawVal})`,
						matchingExistingConstant: varMatch ? {
							symbol: `var(${varMatch})`,
							isCssVariable: true
						} : void 0,
						isZeroTokenResolvable: Boolean(varMatch)
					});
				}
			}
		}
		const hexColorRegex = /#([0-9a-fA-F]{3,8})\b/g;
		let cMatch;
		while ((cMatch = hexColorRegex.exec(scssContent)) !== null) {
			const hexVal = cMatch[0].toLowerCase();
			const lineIdx = scssContent.slice(0, cMatch.index).split("\n").length - 1;
			const lineText = lines[lineIdx] ?? "";
			if (!lineText.includes("var(") && !lineText.includes("$")) {
				const varMatch = this.cssVariables.get(hexVal);
				results.push({
					id: `SC${counter++}`,
					file,
					kind: "color-scss",
					line: lineIdx + 1,
					column: 1,
					startOffset: cMatch.index + offsetDelta,
					endOffset: cMatch.index + cMatch[0].length + offsetDelta,
					rawValue: cMatch[0],
					lineSnippet: lineText.trim(),
					semanticRole: "color-token",
					autoCandidateName: varMatch ? `var(${varMatch})` : void 0,
					matchingExistingConstant: varMatch ? {
						symbol: `var(${varMatch})`,
						isCssVariable: true
					} : void 0,
					isZeroTokenResolvable: Boolean(varMatch)
				});
			}
		}
	}
	isExemptTsLiteral(_node, reported, val) {
		if (UNIVERSAL_SENTINELS.has(val)) return true;
		if (this.config.constants?.exemptMagicNumbers?.includes(val)) return true;
		let curr = reported.parent;
		while (curr) {
			if (ts.isVariableDeclaration(curr)) {
				const list = curr.parent;
				if (ts.isVariableDeclarationList(list) && list.flags & ts.NodeFlags.Const) return true;
			}
			if (ts.isPropertyDeclaration(curr) && curr.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword)) return true;
			if (ts.isEnumMember(curr) || ts.isTypeNode(curr)) return true;
			curr = curr.parent;
		}
		const p = reported.parent;
		if (!p) return false;
		if (STANDARD_RADIX.has(val) && ts.isCallExpression(p) && p.arguments[1] === reported) return true;
		if (ts.isElementAccessExpression(p) && p.argumentExpression === reported) return true;
		if (ts.isParameter(p) && p.initializer === reported) return true;
		if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression)) {
			const fnName = p.expression.name.text;
			if ([
				"toFixed",
				"toPrecision",
				"slice"
			].includes(fnName)) return true;
		}
		return false;
	}
	findEnclosingSymbol(node) {
		let curr = node.parent;
		while (curr) {
			if (ts.isFunctionDeclaration(curr) && curr.name) return curr.name.text;
			if (ts.isMethodDeclaration(curr) && ts.isIdentifier(curr.name)) return curr.name.text;
			if (ts.isVariableDeclaration(curr) && ts.isIdentifier(curr.name)) return curr.name.text;
			if (ts.isClassDeclaration(curr) && curr.name) return curr.name.text;
			curr = curr.parent;
		}
	}
	inferSemanticRoleAndName(node, _val, enclosingSymbol) {
		const parent = node.parent;
		if (!parent) return { role: "unclassified" };
		const timer = this.inferTimerRole(parent, node, enclosingSymbol);
		if (timer) return timer;
		const prop = this.inferPropertyRole(parent, node);
		if (prop) return prop;
		if (ts.isBinaryExpression(parent)) {
			const threshold = this.inferBinaryThresholdRole(parent, node);
			if (threshold) return threshold;
			const math = this.inferMathRole(parent, enclosingSymbol);
			if (math) return math;
		}
		return { role: "unclassified" };
	}
	inferTimerRole(parent, node, enclosingSymbol) {
		if (!ts.isCallExpression(parent)) return void 0;
		const callee = parent.expression.getText();
		if (["setTimeout", "setInterval"].includes(callee) && parent.arguments[1] === node) return {
			role: "timer-delay",
			candidateName: `${enclosingSymbol ? this.toScreamingSnake(enclosingSymbol) : "OPERATION"}_DELAY_MS`
		};
		if (callee === "delayedCall" && parent.arguments[0] === node) return {
			role: "timer-delay",
			candidateName: `${enclosingSymbol ? this.toScreamingSnake(enclosingSymbol) : "TWEEN"}_DELAY_SECONDS`
		};
	}
	inferPropertyRole(parent, node) {
		if (!ts.isPropertyAssignment(parent) || parent.initializer !== node || !ts.isIdentifier(parent.name)) return;
		const propName = parent.name.text;
		const propUpper = this.toScreamingSnake(propName);
		return {
			role: "property-value",
			candidateName: `DEFAULT_${propUpper}${(propName.toLowerCase().includes("timeout") || propName.toLowerCase().includes("delay")) && !propUpper.endsWith("_MS") ? "_MS" : ""}`
		};
	}
	inferBinaryThresholdRole(parent, node) {
		if (parent.right !== node) return void 0;
		const leftText = parent.left.getText().replace(/[^a-zA-Z0-9_]/g, "_");
		if (!leftText) return void 0;
		const op = parent.operatorToken.kind;
		let boundPrefix = "LIMIT";
		if (op === ts.SyntaxKind.LessThanToken || op === ts.SyntaxKind.LessThanEqualsToken) boundPrefix = "MAX";
		else if (op === ts.SyntaxKind.GreaterThanToken || op === ts.SyntaxKind.GreaterThanEqualsToken) boundPrefix = "MIN";
		const cleanLeft = this.toScreamingSnake(leftText).replace(/^_+|_+$/g, "");
		return {
			role: "binary-threshold",
			candidateName: `${boundPrefix}_${cleanLeft}`
		};
	}
	inferMathRole(parent, enclosingSymbol) {
		const op = parent.operatorToken.kind;
		if (op !== ts.SyntaxKind.AsteriskToken && op !== ts.SyntaxKind.SlashToken) return void 0;
		return {
			role: "math-formula",
			candidateName: `${enclosingSymbol ? this.toScreamingSnake(enclosingSymbol) : "CALC"}_MULTIPLIER`
		};
	}
	toScreamingSnake(str) {
		return str.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase().replace(/_+/g, "_");
	}
	/**
	* Generates Super-Dirac compact batch table packet.
	*/
	generateSuperDiracPacket(projectRoot, file, items) {
		const absPath = path.resolve(projectRoot, file);
		const fileContent = fs.existsSync(absPath) ? fs.readFileSync(absPath, "utf8") : "";
		const fullFileTokens = Math.round(fileContent.length * ESTIMATED_TOKENS_PER_CHAR);
		const clusteredMap = /* @__PURE__ */ new Map();
		for (const item of items) {
			const key = `${item.rawValue}::${item.semanticRole}::${item.enclosingSymbol || "global"}`;
			const existing = clusteredMap.get(key);
			if (existing) existing.items.push(item);
			else clusteredMap.set(key, {
				items: [item],
				candidate: item.autoCandidateName ?? "PENDING_NAME"
			});
		}
		const batchItems = Array.from(clusteredMap.entries()).map(([_, entry], idx) => {
			const first = entry.items[0];
			const locs = entry.items.map((i) => `L${i.line}`).join(",");
			return {
				id: `G${idx + 1}`,
				loc: `${path.basename(first.file)}:${locs}`,
				val: first.rawValue,
				role: first.semanticRole,
				fn: first.enclosingSymbol,
				expr: entry.items.length === 1 ? first.lineSnippet : `${first.lineSnippet} (x${entry.items.length})`,
				candidate: entry.candidate
			};
		});
		const zeroCount = items.filter((i) => i.isZeroTokenResolvable).length;
		const pendingCount = items.length - zeroCount;
		const batchJson = JSON.stringify(batchItems, null, 2);
		const batchTokens = Math.round(batchJson.length * ESTIMATED_TOKENS_PER_CHAR);
		const savings = fullFileTokens > 0 ? Math.max(0, Math.round((fullFileTokens - batchTokens) / fullFileTokens * 100)) : 0;
		return {
			file,
			totalItems: items.length,
			zeroTokenCount: zeroCount,
			pendingAmbiguousCount: pendingCount,
			fullFileTokensBaseline: fullFileTokens,
			superDiracBatchTokens: batchTokens,
			tokenSavingsPercent: savings,
			items: batchItems
		};
	}
	/**
	* Generates a fully-executable MagicRefactorPlan ready to be applied by MagicNumberHarness.
	*/
	createRefactorPlan(planId, file, items, options) {
		const targetLocation = options?.targetLocation ?? "local-file-header";
		const destinationFile = options?.destinationFile;
		const declarationsMap = /* @__PURE__ */ new Map();
		const replacements = [];
		for (const item of items) {
			const constName = item.matchingExistingConstant?.symbol ?? item.autoCandidateName ?? "CONSTANT_VALUE";
			if (!declarationsMap.has(constName) && !item.matchingExistingConstant) declarationsMap.set(constName, {
				name: constName,
				value: item.rawValue,
				targetLocation,
				destinationFile,
				isExported: targetLocation === "shared-constants-module"
			});
			replacements.push({
				startOffset: item.startOffset,
				endOffset: item.endOffset,
				replacement: constName,
				originalSnippet: String(item.rawValue)
			});
		}
		return {
			version: 1,
			planId,
			targetFiles: [file],
			declarations: Array.from(declarationsMap.values()),
			fileReplacements: { [file]: replacements }
		};
	}
};
export { MagicNumberExtractor };
