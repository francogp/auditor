// src/core/suppressionDirectives.ts
/**
* packages/auditor/src/core/suppressionDirectives.ts
*
* Centralized registry and matcher for forbidden ESLint directives
* and prohibited linter/type suppressions across static analyzers and Oxlint plugins.
*/
const FORBIDDEN_ESLINT_DIRECTIVE_PATTERN = /\/\*[\s*]*eslint-disable[\s\S]*?\*\/|\/\/\s*eslint-disable(?:-next-line|-line)?\b/g;
const FORBIDDEN_LINTER_SUPPRESSION_PATTERN = /\/\*[\s*]*(?:oxlint-disable|@ts-ignore|@ts-nocheck)[\s\S]*?\*\/|\/\/\s*(?:oxlint-disable(?:-next-line|-line)?|@ts-ignore|@ts-nocheck|fallow-ignore-file)\b/g;
function buildEslintDirectiveMessage(directive) {
	return `ESLint directive detected ('${directive.trim()}'). ESLint is NOT used in this repository; all linting is performed exclusively by Oxlint (vp lint). ESLint directives are strictly prohibited.`;
}
function buildSuppressionDirectiveMessage(directive) {
	return `Linter/type suppression directive detected ('${directive.trim()}'). Suppressing rules is strictly prohibited by architecture. Refactor the code cleanly.`;
}
const FORBIDDEN_SUPPRESSION_MESSAGE = "Linter/type suppression directive detected. Suppressing rules is strictly prohibited by architecture. Refactor the code cleanly.";
/**
* Calculates 1-based line number for a character offset in text.
*/
function offsetToLine(content, offset) {
	let line = 1;
	for (let i = 0; i < offset && i < content.length; i++) if (content.charCodeAt(i) === 10) line++;
	return line;
}
/**
* Strips string literals preserving original character offsets and line breaks.
*/
function stripStringLiteralsPreservingOffsets(content) {
	return content.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`[\s\S]*?`/g, (match) => match.replace(/[^\r\n]/g, " "));
}
/**
* Finds all forbidden ESLint directives and linter suppressions in text.
* Accurately calculates line numbers even for multiline block comments.
* Automatically strips string literals preserving offsets to eliminate false positives in tests and constants.
*/
function findForbiddenSuppressions(content, options = { stripStrings: true }) {
	const matches = [];
	const textToScan = options.stripStrings !== false ? stripStringLiteralsPreservingOffsets(content) : content;
	const eslintRegex = new RegExp(FORBIDDEN_ESLINT_DIRECTIVE_PATTERN.source, "g");
	let match;
	while ((match = eslintRegex.exec(textToScan)) !== null) {
		const raw = match[0];
		const line = offsetToLine(content, match.index);
		matches.push({
			type: "eslint",
			match: raw,
			line,
			message: buildEslintDirectiveMessage(raw)
		});
	}
	const suppRegex = new RegExp(FORBIDDEN_LINTER_SUPPRESSION_PATTERN.source, "g");
	while ((match = suppRegex.exec(textToScan)) !== null) {
		const raw = match[0];
		const line = offsetToLine(content, match.index);
		matches.push({
			type: "suppression",
			match: raw,
			line,
			message: buildSuppressionDirectiveMessage(raw)
		});
	}
	return matches.sort((a, b) => a.line - b.line);
}
export { FORBIDDEN_ESLINT_DIRECTIVE_PATTERN, FORBIDDEN_LINTER_SUPPRESSION_PATTERN, FORBIDDEN_SUPPRESSION_MESSAGE, buildEslintDirectiveMessage, buildSuppressionDirectiveMessage, findForbiddenSuppressions, offsetToLine, stripStringLiteralsPreservingOffsets };
