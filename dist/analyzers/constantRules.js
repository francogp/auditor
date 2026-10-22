import { getAuditConfig } from "../core/auditConfigLoader.js";
import { isInCodeRoots } from "../core/auditCodeRoots.js";
import { isExemptFile } from "../core/auditPathPredicates.js";
import "../core/auditConfig.js";
import { isTestOrNodeModules, normalizeFilePath } from "./auditRuleTypes.js";
//#region src/analyzers/constantRules.ts
/**
* packages/auditor/src/analyzers/constantRules.ts
*
* Architecture rules for constant naming hygiene, numeric suffixes, and redundant aliases.
*/
function isAuditableCodeFile(filePath, config = getAuditConfig()) {
	if (!filePath) return false;
	return isInCodeRoots(filePath, config) && !isExemptFile(filePath, config);
}
const DEFAULT_ALLOWED_NUMERIC_CONSTANT_PREFIXES = [
	"GEN_",
	"ISO_",
	"UTF_8",
	"BASE_64",
	"RGB_",
	"RGBA_",
	"WASM_",
	"HTML_5",
	"CSS_3",
	"HTTP_",
	"D3_"
];
function isConstantNameExemptFromNumericSuffixCheck(constName, config = getAuditConfig()) {
	if (!constName || /^\d/.test(constName)) return true;
	return [...config.domain?.allowedNumericConstantPrefixes?.length ? config.domain.allowedNumericConstantPrefixes : DEFAULT_ALLOWED_NUMERIC_CONSTANT_PREFIXES, ...config.constants?.allowedNumericPrefixes ?? []].some((prefix) => constName.startsWith(prefix) || constName.includes(prefix));
}
const noAliasConstants = {
	regex: /\bconst\s+([A-Z0-9_]{3,})(?:\s*:\s*[^=;\r\n]+)?\s*=\s*([A-Z0-9_][A-Z0-9_.]*)(?:\s+as\s+[^;\r\n]+)?\s*(?:;\s*)?$/gm,
	message: (match) => `Constant alias detected: '${match.trim()}'. Initializing a constant with another existing constant or constant property to create a duplicate intermediate alias is PROHIBITED. Use the canonical origin constant directly.`,
	severity: "error",
	check: (content, match, filePath) => {
		if (!filePath) return false;
		if (normalizeFilePath(filePath).includes("node_modules")) return false;
		const constA = match[1];
		const constB = match[2];
		if (!constA || !constB || constA === constB) return false;
		const afterMatch = content.substring(match.index + match[0].length);
		if (afterMatch.trimStart().startsWith(".") || afterMatch.trimStart().startsWith("(")) return false;
		if (/^[\d_]+$/.test(constB) || /^\d/.test(constB)) return false;
		return true;
	}
};
const noLiteralSuffixInConstantName = {
	regex: /\b([A-Z0-9_]+_(\d{2,}))\b/g,
	message: (match) => `Constant with raw numeric suffix detected: '${match}'. Including numeric literals at the end of constant names (e.g. _100, _600, _10000) is PROHIBITED. Use semantic, descriptive names.`,
	severity: "error",
	check: (_content, match, filePath) => {
		if (isTestOrNodeModules(filePath)) return false;
		return !isConstantNameExemptFromNumericSuffixCheck(match[1] || "");
	}
};
const badConstantNames = {
	regex: /^\s*(?:export\s+)?const\s+([A-Z0-9_]+?_\d+)\b/gm,
	message: (match) => `Nombre de constante antipatrón detectado en declaración: '${match.trim()}'. Está PROHIBIDO incluir el valor numérico en el nombre de la constante (ej: usa MAX_RETRY_COUNT en lugar de MAX_RETRY_COUNT_LIMIT). Describe el propósito semántico o la intención de dominio.`,
	severity: "error",
	check: (_content, match, filePath) => {
		if (isTestOrNodeModules(filePath)) return false;
		return !isConstantNameExemptFromNumericSuffixCheck(match[1] || "");
	},
	fixable: false
};
//#endregion
export { DEFAULT_ALLOWED_NUMERIC_CONSTANT_PREFIXES, badConstantNames, isAuditableCodeFile, isConstantNameExemptFromNumericSuffixCheck, noAliasConstants, noLiteralSuffixInConstantName };
