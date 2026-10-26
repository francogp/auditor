import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import ts from "typescript";
// src/core/astScriptExtractor.ts
/**
* src/core/astScriptExtractor.ts
*
* UNIFIED 1:1 AST SCRIPT EXTRACTOR & CODE MUTATION ENGINE (Node.js 26+ Native)
*
* Provides coordinate-preserving script extraction for TypeScript and Vue Single File Components (SFC).
* Non-script content (templates, styles, markup) is masked with spaces while preserving line breaks (`\n`),
* guaranteeing 100% 1:1 character offset, line, and column parity between the parsed AST and the file on disk.
*/
enableCompileCache();
const VUE_SCRIPT_BLOCK_REGEX = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
/**
* Extracts script content from a source string.
* For .vue files, masks non-script regions into spaces while preserving line breaks,
* ensuring character offsets computed by TypeScript AST match the original file on disk.
*/
function extractUnifiedScriptBuffer(sourceText, isVue) {
	if (!isVue) return sourceText;
	let result = "";
	let lastIndex = 0;
	VUE_SCRIPT_BLOCK_REGEX.lastIndex = 0;
	let match;
	while ((match = VUE_SCRIPT_BLOCK_REGEX.exec(sourceText)) !== null) {
		const fullMatchStart = match.index;
		const contentStart = fullMatchStart + (match[0].indexOf(">") + 1);
		const contentEnd = fullMatchStart + match[0].lastIndexOf("<\/script>");
		for (let i = lastIndex; i < contentStart; i++) result += sourceText[i] === "\n" ? "\n" : " ";
		result += sourceText.slice(contentStart, contentEnd);
		lastIndex = contentEnd;
	}
	for (let i = lastIndex; i < sourceText.length; i++) result += sourceText[i] === "\n" ? "\n" : " ";
	return result;
}
/**
* Creates a ts.SourceFile with 1:1 coordinate parity with the disk file.
*/
function createUnifiedAstSourceFile(filePath, sourceText) {
	const isVue = filePath.endsWith(".vue");
	const textToParse = extractUnifiedScriptBuffer(sourceText, isVue);
	return {
		sourceFile: ts.createSourceFile(filePath, textToParse, ts.ScriptTarget.Latest, true, isVue ? ts.ScriptKind.TS : void 0),
		textToParse,
		isVue
	};
}
/**
* Applies a list of text replacements to a source text string.
* Automatically deduplicates and sorts replacements in descending offset order (bottom-to-top),
* ensuring node edits do not shift token coordinates of preceding modifications.
*/
function applyAstReplacements(sourceText, replacements) {
	if (replacements.length === 0) return sourceText;
	const sorted = [...replacements].sort((a, b) => {
		if (b.start !== a.start) return b.start - a.start;
		return b.end - a.end;
	});
	const filtered = [];
	let lastStart = Infinity;
	for (const rep of sorted) if (rep.end <= lastStart) {
		filtered.push(rep);
		lastStart = rep.start;
	}
	let updated = sourceText;
	for (const rep of filtered) updated = updated.slice(0, rep.start) + rep.text + updated.slice(rep.end);
	return updated;
}
/**
* Deterministically applies AST replacements across a list of target files.
*/
function applyAstReplacementsAcrossFiles(targetDir, targetFiles, computeReplacements) {
	let filesChanged = 0;
	let changesApplied = 0;
	for (const relFile of targetFiles) {
		const fullPath = path.isAbsolute(relFile) ? relFile : path.resolve(targetDir, relFile);
		if (!fs.existsSync(fullPath)) continue;
		const sourceText = fs.readFileSync(fullPath, "utf-8");
		const replacements = computeReplacements(fullPath, sourceText);
		if (replacements.length === 0) continue;
		const updated = applyAstReplacements(sourceText, replacements);
		if (updated !== sourceText) {
			fs.writeFileSync(fullPath, updated, "utf-8");
			filesChanged++;
			changesApplied += replacements.length;
		}
	}
	return {
		filesChanged,
		changesApplied
	};
}
export { applyAstReplacements, applyAstReplacementsAcrossFiles, createUnifiedAstSourceFile, extractUnifiedScriptBuffer };
