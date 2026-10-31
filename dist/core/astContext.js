import { tryCatchSync } from "./safeUtils.js";
import { normalizePosixPath } from "./reportUtils.js";
import "./safePath.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import ts from "typescript";
// src/core/astContext.ts
/**
* scripts/lib/astContext.ts
*
* SHARED AST ENGINE & REPOSITORY (Node.js 26+)
* Provides centralized, memoized TypeScript AST creation and caching across all sub-auditors:
*   1. Eliminates duplicate file parsing across concurrent or sequential audit suites.
*   2. Provides O(1) in-memory retrieval of pre-compiled ts.SourceFile objects.
*   3. Supports Vue Single File Components (SFC) script block extraction with line offset preservation.
*/
enableCompileCache();
var SharedAstContext = class {
	sourceFiles = /* @__PURE__ */ new Map();
	extractedScripts = /* @__PURE__ */ new Map();
	/**
	* Checks whether an AST for the given normalized file path is already in cache.
	*/
	hasSourceFile(filePath) {
		const norm = this.normalizePath(filePath);
		return this.sourceFiles.has(norm);
	}
	/**
	* Retrieves an existing ts.SourceFile or creates and caches it on-demand.
	* If content is omitted, the file is read synchronously from disk.
	*/
	getSourceFile(filePath, content) {
		const norm = this.normalizePath(filePath);
		const existing = this.sourceFiles.get(norm);
		if (existing) return existing;
		const rawContent = content !== void 0 ? content : fs.readFileSync(filePath, "utf-8");
		const isVue = norm.endsWith(".vue");
		let codeToParse = rawContent;
		if (isVue) {
			const extracted = this.extractScript(rawContent, norm);
			const linesBefore = Math.max(0, extracted.offsetLine - 1);
			codeToParse = "\n".repeat(linesBefore) + extracted.scriptContent;
		}
		const sf = ts.createSourceFile(path.basename(norm), codeToParse, ts.ScriptTarget.Latest, true, isVue ? ts.ScriptKind.TS : void 0);
		this.sourceFiles.set(norm, sf);
		return sf;
	}
	/**
	* Extracts the main `<script>` or `<script setup>` block from a Vue SFC.
	* Caches results to avoid repeated regex searches on the same component.
	*/
	extractScript(content, filePath) {
		const norm = this.normalizePath(filePath);
		const cached = this.extractedScripts.get(norm);
		if (cached) return cached;
		const setupMatch = content.match(/<script\b[^>]+?\bsetup\b[^>]*>([\s\S]*?)<\/script>/i);
		const standardMatch = content.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
		const match = setupMatch || standardMatch;
		if (!match || match.index === void 0) {
			const empty = {
				scriptContent: "",
				offsetLine: 0
			};
			this.extractedScripts.set(norm, empty);
			return empty;
		}
		const scriptContent = match[1] ?? "";
		const openTagLength = match[0].indexOf(scriptContent);
		const result = {
			scriptContent,
			offsetLine: (content.substring(0, match.index + Math.max(openTagLength, 0)).match(/\n/g) ?? []).length + 1
		};
		this.extractedScripts.set(norm, result);
		return result;
	}
	/**
	* Batch pre-parses and caches an array of files into the AST repository.
	*/
	preParseFiles(filePaths) {
		for (const file of filePaths) tryCatchSync(() => {
			this.getSourceFile(file);
		});
	}
	/**
	* Returns the count of unique AST SourceFiles currently in memory cache.
	*/
	get size() {
		return this.sourceFiles.size;
	}
	/**
	* Clears the AST repository cache to free memory.
	*/
	clear() {
		this.sourceFiles.clear();
		this.extractedScripts.clear();
	}
	normalizePath(p) {
		return normalizePosixPath(p);
	}
};
/**
* Creates a synthetic, empty ts.SourceFile for use with ts.Printer when printing generated AST nodes.
*/
function createSyntheticSourceFile(fileName = "synthetic.ts") {
	return ts.createSourceFile(fileName, "", ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
}
/**
* Helper to print an AST node using a synthetic source file.
*/
function printAstNode(node, printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }), hint = ts.EmitHint.Unspecified) {
	const dummy = createSyntheticSourceFile();
	return printer.printNode(hint, node, dummy);
}
function extractExportedConfigObjectLiteral(source) {
	const expr = source.statements.find(ts.isExportAssignment)?.expression;
	if (!expr) return null;
	if (ts.isObjectLiteralExpression(expr)) return expr;
	if (ts.isCallExpression(expr) && expr.arguments[0] && ts.isObjectLiteralExpression(expr.arguments[0])) return expr.arguments[0];
	return null;
}
function dtoValueToTsExpression(value) {
	if (typeof value === "string") return ts.factory.createStringLiteral(value, true);
	if (typeof value === "number") return value < 0 ? ts.factory.createPrefixUnaryExpression(ts.SyntaxKind.MinusToken, ts.factory.createNumericLiteral(Math.abs(value))) : ts.factory.createNumericLiteral(value);
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
function formatTsNodeTwoSpaceIndent(node, hint = ts.EmitHint.Unspecified) {
	return printAstNode(node, void 0, hint).split("\n").map((line) => line.replace(/^( {4})+/, (m) => " ".repeat(m.length / 2))).join("\n");
}
export { SharedAstContext, createSyntheticSourceFile, dtoValueToTsExpression, extractExportedConfigObjectLiteral, formatTsNodeTwoSpaceIndent, printAstNode };
