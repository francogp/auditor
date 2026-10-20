import { getAuditConfig } from "../auditConfigLoader.js";
import { isTestPath } from "../auditTestPredicates.js";
import { isExemptFile } from "../auditPathPredicates.js";
import "../auditConfig.js";
import { toPosixRelative } from "../auditCoverage.js";
import "../safePath.js";
import { collectRepositoryFiles } from "../auditorBase.js";
import { parseVueSfc as parseVueSfcBlocks } from "../vueSfcParser.js";
import path from "node:path";
import fs from "node:fs";
//#region src/core/refactor/refactorFileScanner.ts
/**
* src/core/refactor/refactorFileScanner.ts
*
* Shared filesystem scanner and text replacement utilities for refactoring engines.
* Strictly uses Node.js native standard library (node:path, node:fs) for 100% cross-platform safety.
*/
const DEFAULT_REFACTOR_EXTENSIONS = /* @__PURE__ */ new Set([
	".ts",
	".vue",
	".js"
]);
/**
* Checks if two path references resolve to the same underlying file in a cross-platform manner.
*/
function isSameFilePath(fileA, fileB, baseDir = process.cwd()) {
	const absA = path.isAbsolute(fileA) ? path.normalize(fileA) : path.resolve(baseDir, fileA);
	const absB = path.isAbsolute(fileB) ? path.normalize(fileB) : path.resolve(baseDir, fileB);
	return path.relative(absA, absB) === "" || absA.toLowerCase() === absB.toLowerCase();
}
/**
* Scans project code roots dynamically driven by audit.config.ts,
* respecting codeRoots, ignoreGlobs, test exclusions, and file exemptions.
*/
function scanProjectSourceFiles(dir, allowedExtensions = DEFAULT_REFACTOR_EXTENSIONS) {
	const normalizedDir = path.resolve(dir);
	if (!fs.existsSync(normalizedDir)) return [];
	const config = getAuditConfig(normalizedDir);
	const configuredRoots = config.paths.codeRoots ?? ["src", "scripts"];
	const roots = configuredRoots.some((r) => fs.existsSync(path.resolve(normalizedDir, r))) ? configuredRoots : ["."];
	const combinedIgnores = [
		...config.paths.ignoreGlobs ?? [],
		"node_modules/**",
		"dist/**",
		"scratch/**"
	];
	const seen = /* @__PURE__ */ new Set();
	const results = [];
	for (const root of roots) {
		const fullRoot = path.resolve(normalizedDir, root);
		if (!fs.existsSync(fullRoot)) continue;
		const collected = collectRepositoryFiles(fullRoot, normalizedDir, combinedIgnores, allowedExtensions);
		for (const absFile of collected) {
			const relPosix = toPosixRelative(normalizedDir, absFile);
			if (seen.has(relPosix)) continue;
			if (!config.paths.includeTestsInCodeAudit && isTestPath(relPosix)) continue;
			if (isExemptFile(relPosix, config)) continue;
			seen.add(relPosix);
			results.push(absFile);
		}
	}
	return results;
}
/**
* Extracts script content and line offset from TypeScript, JavaScript, or Vue SFC files.
*/
function extractFileScriptContent(filePath) {
	if (!fs.existsSync(filePath)) return null;
	const content = fs.readFileSync(filePath, "utf8");
	if (filePath.endsWith(".vue")) {
		const parsed = parseVueSfcBlocks(content);
		const activeScript = parsed.scripts.find((s) => s.isSetup) || parsed.scripts[0];
		if (!activeScript) return null;
		return {
			scriptContent: activeScript.content,
			lineOffset: activeScript.startLine - 1
		};
	}
	return {
		scriptContent: content,
		lineOffset: 0
	};
}
/**
* Iterates through non-empty lines of a source script (TS/JS/Vue SFC) providing the line and actual line number.
*/
function forEachSourceScriptLine(filePath, onLine) {
	const extracted = extractFileScriptContent(filePath);
	if (!extracted) return false;
	const { scriptContent, lineOffset } = extracted;
	const lines = scriptContent.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line) continue;
		onLine(line, i + lineOffset + 1, i, lines);
	}
	return true;
}
/**
* Applies a list of exact text replacements to content if the target file matches.
*/
function applyFileTextReplacements(initialContent, relFile, fullPath, baseDir, replacements) {
	if (!replacements || replacements.length === 0) return {
		content: initialContent,
		count: 0
	};
	let content = initialContent;
	let count = 0;
	for (const rep of replacements) {
		if (!isSameFilePath(rep.file, relFile, baseDir) && !isSameFilePath(rep.file, fullPath, baseDir)) continue;
		if (!content.includes(rep.original)) continue;
		content = content.replace(rep.original, rep.replacement);
		count++;
	}
	return {
		content,
		count
	};
}
/**
* Deterministically applies grouped text replacements to all targeted files across a project.
*/
function executePlanFileReplacements(baseDir, targetFiles, replacementGroups, customTransformers = []) {
	let filesChanged = 0;
	let changesApplied = 0;
	for (const relFile of targetFiles ?? []) {
		const fullPath = path.isAbsolute(relFile) ? path.normalize(relFile) : path.resolve(baseDir, relFile);
		if (!fs.existsSync(fullPath)) continue;
		let content = fs.readFileSync(fullPath, "utf8");
		const originalContent = content;
		for (const group of replacementGroups) {
			if (!group) continue;
			const res = applyFileTextReplacements(content, relFile, fullPath, baseDir, group);
			content = res.content;
			changesApplied += res.count;
		}
		for (const transform of customTransformers) {
			const res = transform(content, relFile, fullPath, baseDir);
			content = res.content;
			changesApplied += res.count;
		}
		if (content !== originalContent) {
			fs.writeFileSync(fullPath, content, "utf8");
			filesChanged++;
		}
	}
	return {
		filesChanged,
		changesApplied
	};
}
//#endregion
export { applyFileTextReplacements, executePlanFileReplacements, extractFileScriptContent, forEachSourceScriptLine, isSameFilePath, scanProjectSourceFiles };
