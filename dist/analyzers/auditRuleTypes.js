import { normalizePosixPath } from "../core/reportUtils.js";
import { isTestPath } from "../core/auditTestPredicates.js";
import "../core/safePath.js";
//#region src/analyzers/auditRuleTypes.ts
/**
* packages/auditor/src/analyzers/auditRuleTypes.ts
*
* Core rule descriptors, violation schemas, and matching primitives
* for architectural audits.
*/
const AUDIT_SEVERITIES = ["error", "warning"];
function collectRuleTokens(descriptor) {
	const tokens = [];
	if (descriptor.id) tokens.push(descriptor.id.toLowerCase());
	if (descriptor.name) tokens.push(descriptor.name.toLowerCase());
	if (descriptor.category) tokens.push(descriptor.category.toLowerCase());
	if (descriptor.aliases) {
		for (const a of descriptor.aliases) if (a) tokens.push(a.toLowerCase());
	}
	return tokens;
}
function matchesRule(descriptor, selectedRules) {
	if (selectedRules.size === 0) return true;
	const tokens = collectRuleTokens(descriptor);
	for (const selected of selectedRules) for (const t of tokens) if (t === selected || t.includes(selected) || selected.includes(t)) return true;
	return false;
}
function normalizeFilePath(filePath) {
	return normalizePosixPath(filePath).toLowerCase();
}
function getLineAtMatch(content, matchIndex) {
	const lineStartPos = content.lastIndexOf("\n", matchIndex - 1) + 1;
	const lineEndPos = content.indexOf("\n", matchIndex);
	const line = lineEndPos === -1 ? content.slice(lineStartPos) : content.slice(lineStartPos, lineEndPos);
	return {
		line,
		lineStartPos,
		lineEndPos,
		trimmed: line.trim()
	};
}
function isCommentLine(trimmed) {
	return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}
function isTestOrNodeModules(filePath) {
	if (!filePath) return true;
	return filePath.includes("node_modules") || isTestPath(filePath);
}
//#endregion
export { AUDIT_SEVERITIES, getLineAtMatch, isCommentLine, isTestOrNodeModules, matchesRule, normalizeFilePath };
