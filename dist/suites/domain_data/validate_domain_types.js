import { normalizePosixPath } from "../../core/reportUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { matchesAnyRoot } from "../../core/auditRootMatcher.js";
import { isTestPath } from "../../core/auditTestPredicates.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import "../../core/safePath.js";
import { AuditedDocument } from "../../core/auditedDocument.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
import { isPositionInsideFunctionParams, stripComments } from "../../core/scannerUtils.js";
import { isCommentLine } from "../../analyzers/auditRuleTypes.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs/promises";
import ts from "typescript";
//#region src/suites/domain_data/validate_domain_types.ts
/**
* packages/auditor/src/suites/domain_data/validate_domain_types.ts
*
* DOMAIN TYPE INTEGRITY AUDITOR (Node.js 26+ Native)
* Detects finite-domain values declared with loose runtime structures or
* broad string types instead of strict TypeScript domain contracts.
*
* Enforces:
*   1. Zero loose collections for finite domains (new Set, new Map without domain union).
*   2. Zero string literal arrays without `as const`.
*   3. Zero raw `string` fields, aliases or wildcard string sinks in contracts.
*   4. Zero ambiguous unions mixing empty-string sentinels with null/undefined.
*   5. Nominal compile-time safety for domain IDs via Brand<string, "IdName">.
*/
enableCompileCache();
const ROOT = process.cwd();
const EXTENSIONS = /* @__PURE__ */ new Set([".ts", ".vue"]);
const DEFAULT_TEST_PATH_MARKERS = [".test.", ".spec."];
const DOMAIN_COLLECTION_CONTEXT_WINDOW_CHARS = 80;
const CANONICAL_INFRA_ID_WHITELIST = [
	"suiteId",
	"ruleId",
	"runId",
	"buildId",
	"eslintRuleId",
	"candidate_id",
	"requiredSuiteId",
	"rule_id",
	"timerId",
	"wallClockTimerId",
	"intervalId",
	"timeoutId",
	"tickerId",
	"backgroundTickerId",
	"shortId"
];
const CANONICAL_TEXTUAL_PROPERTY_NAMES = [
	"title",
	"description",
	"name",
	"label",
	"summary",
	"text",
	"prose",
	"message",
	"notes",
	"details",
	"reason",
	"comment",
	"bio",
	"prompt",
	"url",
	"path",
	"uri",
	"pattern",
	"formula",
	"icon",
	"query",
	"help",
	"content",
	"body",
	"caption",
	"placeholder",
	"strategy",
	"interactions",
	"duration",
	"scope",
	"consequence",
	"prefix",
	"suffix"
];
const TEXTUAL_SUFFIXES = [
	"name",
	"description",
	"title",
	"label",
	"text",
	"summary",
	"formula",
	"hint",
	"prose",
	"message",
	"notes",
	"prompt",
	"details",
	"reason",
	"comment",
	"bio",
	"caption",
	"url",
	"uri",
	"path",
	"query",
	"strategy",
	"interactions",
	"duration",
	"scope",
	"consequence"
];
const DOMAIN_IDENTIFIER_SUFFIXES = [
	"id",
	"status",
	"category",
	"mode",
	"kind",
	"phase",
	"state",
	"tier",
	"rarity",
	"code"
];
function isTextualProperty(propName, userTextualFields = []) {
	const lowerProp = propName.toLowerCase();
	const isDomainIdentifier = DOMAIN_IDENTIFIER_SUFFIXES.some((suffix) => lowerProp === suffix || lowerProp.endsWith(suffix) && !lowerProp.endsWith("valid"));
	for (const name of CANONICAL_TEXTUAL_PROPERTY_NAMES) if (lowerProp === name.toLowerCase()) return true;
	for (const custom of userTextualFields) {
		const lowerCustom = custom.toLowerCase();
		if (lowerCustom.endsWith("*")) {
			const prefix = lowerCustom.slice(0, -1);
			if (lowerProp.startsWith(prefix)) return true;
		} else if (lowerCustom.startsWith("*")) {
			const suffix = lowerCustom.slice(1);
			if (lowerProp.endsWith(suffix)) return true;
		} else if (lowerProp === lowerCustom) return true;
	}
	if (isDomainIdentifier) return false;
	for (const suffix of TEXTUAL_SUFFIXES) if (lowerProp.endsWith(suffix)) return true;
	if (lowerProp.startsWith("hint") || lowerProp.startsWith("lore") || lowerProp.startsWith("flavor") || lowerProp.startsWith("dialogue") || lowerProp.startsWith("quote")) return true;
	return false;
}
function isExemptDomainCastTarget(castTarget) {
	if (/^T[A-Z]/.test(castTarget)) return true;
	const config = getAuditConfig();
	const infraList = [...CANONICAL_INFRA_ID_WHITELIST, ...config.domain.infraIdWhitelist ?? []].map((id) => id.toLowerCase().replace(/_/g, ""));
	const lowerTarget = castTarget.toLowerCase().replace(/_/g, "");
	return infraList.some((infra) => lowerTarget.includes(infra));
}
const isFunctionParameterContext = isPositionInsideFunctionParams;
const DOMAIN_TYPES_RULES = [
	"domain-naked-string-primitive",
	"domain-untyped-collection",
	"domain-ambiguous-union",
	"domain-unbranded-id",
	"domain-chained-literal-comparison"
];
const P_SET_STRING = /\bnew\s+Set\s*(?:<[^>]+>\s*)?\(\s*\[\s*['"`]/g;
const P_MAP_STRING = /\bnew\s+Map\s*(?:<[^>]+>\s*)?\(\s*\[\s*\[\s*['"`]/g;
const P_LITERAL_ARRAY_DECL = /\b(?:(?:export\s+)?const|let|var)\s+([A-Z_a-z]\w*)\s*(?::\s*(?:readonly\s+)?(?:string\[\]|Array\s*<\s*string\s*>|ReadonlyArray\s*<\s*string\s*>)\s*)?=\s*\[\s*['"`][\s\S]*?\](?:\s+as\s+const)?/g;
const P_TYPED_STRING_ARRAY_DECL = /\b(?:(?:export\s+)?const|let|var)\s+([A-Z_a-z]\w*)\s*:\s*(?:readonly\s+)?(?:string\[\]|Array\s*<\s*string\s*>|ReadonlyArray\s*<\s*string\s*>)/g;
const P_TYPE_ALIAS_STRING = /\b(?:export\s+)?type\s+\w+\s*=\s*string\s*;/g;
const P_STRING_SINK_UNION = /\b(?:export\s+)?type\s+\w+\s*=(?=[^;\n]*['"`][^'"`]+['"`])[^;\n]*\|\s*string\s*;/g;
const P_FIELD_WILDCARD_STRING_UNION = /^\s*(?:readonly\s+)?([A-Z_a-z]\w*)\??:(?!\s*string\b)[^;\n]*\|\s*string\b[^;\n]*[;,]?/gm;
const P_INLINE_LITERAL_UNION_PROPERTY = /^\s*(?:readonly\s+)?([A-Z_a-z]\w*)\??:\s*(?:'[^']+'|"[^"]+")(?:\s*\|\s*(?:'[^']+'|"[^"]+"))+/gm;
const P_OPEN_STRING_INTERSECTION = /\b(?:export\s+)?type\s+\w+\s*=[^;\n]*string\s*&\s*\{\s*\}[^;\n]*;/g;
const P_RECORD_STRING_KEY = /\bRecord\s*<\s*string\s*,/g;
const P_RECORD_PROPERTY_KEY = /\bRecord\s*<\s*PropertyKey\s*,/g;
const P_INDEX_SIGNATURE = /\[\s*\w+\s*:\s*string\s*\]\s*:/g;
const P_DOMAIN_STRING_FIELD = /^\s*(?:readonly\s+)?([A-Z_a-z]\w*)\??:\s*string(?:\[\])?\s*[;,]?/gm;
const P_FINITE_DOMAIN_PHASE_STRING = /^\s*(?:readonly\s+)?(?:phase|remediationPhase)\??:\s*string(?:\[\])?\s*[;,]?/gm;
const P_AMBIGUOUS_EMPTY_NULL_TYPE_ALIAS = /^\s*(?:export\s+)?type\s+\w+\s*=[^;\n'"`]*(?:''|""|``)[^;\n]*\|\s*(?:null|undefined)[^;\n]*;|^\s*(?:export\s+)?type\s+\w+\s*=[^;\n]*(?:null|undefined)[^;\n]*\|\s*(?:''|""|``)[^;\n]*;/gm;
const P_AMBIGUOUS_EMPTY_NULL_FIELD = /^\s*(?:readonly\s+)?\w+\??:\s*(?:[^\s;][^;\n'"`]*)?(?:''|""|``)[^;\n]*\|\s*(?:null|undefined)[^;\n]*[;,]?|^\s*(?:readonly\s+)?\w+\??:\s*(?:[^\s;][^;\n]*)?(?:null|undefined)[^;\n]*\|\s*(?:''|""|``)[^;\n]*[;,]?/gm;
const P_TYPECAST_INLINE_DOMAIN_ID = /\bas\s+(?:[A-Z]\w*Id|keyof\s+typeof\s+[A-Z_a-z]\w*)\b/g;
const P_OBJECT_KEYS_CAST = /\bObject\.(?:keys|entries)\s*\([^)]+\)\s+as\s+(?:\([|\w\s]+\)|[A-Za-z]\w*)\[\]/g;
const P_INLINE_ANONYMOUS_OBJECT_PARAM = /\(\s*[A-Za-z0-9_$,\s]*\b[A-Z_a-z]\w*\??\s*:\s*\{\s*(?:readonly\s+)?[A-Z_a-z]\w*\??\s*:\s*(?:string|number|boolean|unknown|any|[A-Z]\w*)(?:\[\])?\s*[,;]\s*(?:readonly\s+)?[A-Z_a-z]\w*\??\s*:[^\n}]*\}\s*[,)]/g;
const P_UNBRANDED_DOMAIN_ID_ALIAS = /\b(?:export\s+)?type\s+[A-Z]\w*Id\s*=\s*string\s*;/g;
const P_PARAM_WILDCARD_STRING_UNION = /\b([a-z_]\w*)\s*\??:\s*([A-Z]\w*)\s*\|\s*string\b/g;
const P_PARAM_DOMAIN_ID_NULLABLE = /\b(\w{2,}[iI]d)\s*:\s*[A-Z]\w*Id\s*\|\s*(?:null|undefined)\b|\b(\w{2,}[iI]d)\s*:\s*(?:null|undefined)\s*\|\s*[A-Z]\w*Id\b/g;
const P_DOMAIN_TYPE_NULLABLE = /\b(?:export\s+)?type\s+[A-Z]\w*Id\s*=[^;\n]*\|\s*(?:null|undefined)\b/g;
function toRepoPath(filePath) {
	return normalizePosixPath(path.relative(ROOT, filePath));
}
function isTestFile(file) {
	if (getAuditConfig().paths.includeTestsInCodeAudit) return false;
	return isTestPath(file);
}
function isContractFile(file) {
	const config = getAuditConfig();
	const contractRoots = [...config.paths.typesRoots ?? [], ...config.paths.dataRoots ?? []];
	const norm = normalizePosixPath(file);
	return matchesAnyRoot(norm, contractRoots) || file.endsWith(".d.ts");
}
function isAmbientDeclarationFile(file) {
	return file.endsWith(".d.ts");
}
function isOpenUnknownDictionary(line) {
	return /Record\s*<\s*string\s*,\s*unknown\s*>|\[\s*\w+\s*:\s*string\s*\]\s*:\s*unknown/.test(line);
}
function findMatches(content, file, pattern, label, severity, ruleId, filter, ruleFilter) {
	if (ruleFilter && ruleId !== ruleFilter) return [];
	const findings = [];
	const lines = content.split("\n");
	pattern.lastIndex = 0;
	let match;
	while ((match = pattern.exec(content)) !== null) {
		const leadingWs = match[0].match(/^\s*\n/)?.[0] ?? "";
		const matchStart = match.index + leadingWs.length;
		const before = content.slice(0, matchStart);
		const lineNum = (before.match(/\n/g) ?? []).length + 1;
		const col = matchStart - before.lastIndexOf("\n");
		const line = lines[lineNum - 1] ?? "";
		if (isCommentLine(line) || isTestFile(file)) continue;
		if (filter && !filter(match, line, file)) continue;
		findings.push({
			file,
			line: lineNum,
			col,
			pattern: label,
			snippet: match[0].slice(0, 100).replace(/\n/g, "↵"),
			severity: typeof severity === "function" ? severity(match, line, file) : severity,
			ruleId
		});
	}
	return findings;
}
function auditDomainCollectionsAst(doc, ast, rel, ruleFilter) {
	if (ruleFilter && ruleFilter !== "domain-untyped-collection") return [];
	const findings = [];
	const NON_DOMAIN_SET_PATTERN = /\b\w*(?:FLAGS|DIRS|ROOTS|PATHS|COMMANDS|TAGS|ELEMENTS|SELECTORS|TOKENS|KEYWORDS|CHARS|GLOBS|FILES|EXTENSIONS|EXTS|NAMES|KEYS|WORDS|ALIASES|SKILLS|SKIP|VARIANTS|CLASSES|BUILTINS|PACKAGES|ENTRIES|LINES|CHUNKS|ATTRIBUTES|PROPERTIES|PROPS|OBJECTS|SPECIFIERS|BUILDERS|METHODS|DELIMITERS|MEMBERS|PATTERNS|SYMBOLS|OPERATORS|IDENTIFIERS|GLOBALS|FUNCTIONS|MODULES|API|BOOLEANS|RUNNERS|LANGS|TABLES|RULES|BINS|TARGETS)\b/i;
	function isExemptCollectionName(node) {
		let p = node.parent;
		while (p && !ts.isStatement(p)) {
			if (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p)) {
				const name = p.name.getText(ast);
				if (name === "allowedExtensions" || NON_DOMAIN_SET_PATTERN.test(name)) return true;
			}
			p = p.parent;
		}
		return false;
	}
	function hasExplicitDomainType(node, containerName) {
		if (node.typeArguments && node.typeArguments.length > 0) {
			const typeText = node.typeArguments[0].getText(ast).trim();
			if (typeText !== "string" && typeText !== "any" && typeText !== "unknown") return true;
		}
		let p = node.parent;
		while (p && !ts.isStatement(p)) {
			if (ts.isVariableDeclaration(p) && p.type) {
				const varTypeText = p.type.getText(ast).trim();
				const hasContainer = varTypeText.includes(`${containerName}<`);
				const isBanned = varTypeText.includes(`${containerName}<string`) || varTypeText.includes(`${containerName}<any`) || varTypeText.includes(`${containerName}<unknown`);
				if (hasContainer && !isBanned) return true;
			}
			p = p.parent;
		}
		return false;
	}
	function getLiteralCollectionArg(node, kind) {
		if (!node.arguments || node.arguments.length === 0) return null;
		const arg0 = node.arguments[0];
		if (!arg0 || !ts.isArrayLiteralExpression(arg0)) return null;
		if (hasExplicitDomainType(node, kind)) return null;
		return arg0;
	}
	function auditSetDomainCollection(node) {
		const arg0 = getLiteralCollectionArg(node, "Set");
		if (!arg0) return;
		if (!arg0.elements.some((el) => ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el))) return;
		if (arg0.elements.length > 0 && arg0.elements.every((el) => {
			if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) return el.text.startsWith(".");
			return true;
		})) return;
		reportUntypedCollection(node, "Set used as finite-domain storage/validator without domain type parameter. Specify canonical type generic (e.g. `new Set<DomainId>([...])`) or derive from `as const` tuple.");
	}
	function reportUntypedCollection(node, pattern) {
		if (isExemptCollectionName(node)) return;
		const { line, column } = doc.getNodeLineAndColumn(node, ast);
		findings.push({
			file: rel,
			line,
			col: column,
			pattern,
			snippet: node.getText(ast).slice(0, 100).replace(/\n/g, "↵"),
			severity: "ERROR",
			ruleId: "domain-untyped-collection"
		});
	}
	function auditMapDomainCollection(node) {
		const arg0 = getLiteralCollectionArg(node, "Map");
		if (!arg0) return;
		if (!arg0.elements.some((el) => {
			if (ts.isArrayLiteralExpression(el) && el.elements.length > 0) {
				const k = el.elements[0];
				return k && (ts.isStringLiteral(k) || ts.isNoSubstitutionTemplateLiteral(k));
			}
			return false;
		})) return;
		reportUntypedCollection(node, "Map with string/domain keys used as finite-domain map without domain key type parameter. Specify canonical type generic (e.g. `new Map<DomainId, V>([...])`) or use typed object/Record with union keys.");
	}
	function visit(node) {
		if (ts.isNewExpression(node)) {
			const callee = node.expression.getText(ast);
			if (callee === "Set") auditSetDomainCollection(node);
			else if (callee === "Map") auditMapDomainCollection(node);
		}
		ts.forEachChild(node, visit);
	}
	visit(ast);
	return findings;
}
function isRootOrExpression(node) {
	let current = node;
	while (current.parent && ts.isParenthesizedExpression(current.parent)) current = current.parent;
	const parent = current.parent;
	return !(parent && ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.BarBarToken);
}
function flattenOrChain(expr) {
	const list = [];
	function collect(e) {
		const unwrapped = ts.isParenthesizedExpression(e) ? e.expression : e;
		if (ts.isBinaryExpression(unwrapped) && unwrapped.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
			collect(unwrapped.left);
			collect(unwrapped.right);
		} else list.push(unwrapped);
	}
	collect(expr);
	return list;
}
function extractVariableIdentifier(expr) {
	if (ts.isIdentifier(expr)) return expr.text;
	if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) return `${expr.expression.text}.${expr.name.text}`;
	return null;
}
function extractLiteralEquality(expr) {
	const unwrapped = ts.isParenthesizedExpression(expr) ? expr.expression : expr;
	if (!ts.isBinaryExpression(unwrapped)) return null;
	const op = unwrapped.operatorToken.kind;
	if (op !== ts.SyntaxKind.EqualsEqualsEqualsToken && op !== ts.SyntaxKind.EqualsEqualsToken) return null;
	let varExpr = null;
	let litExpr = null;
	if (ts.isStringLiteral(unwrapped.left) || ts.isNoSubstitutionTemplateLiteral(unwrapped.left)) {
		litExpr = unwrapped.left;
		varExpr = unwrapped.right;
	} else if (ts.isStringLiteral(unwrapped.right) || ts.isNoSubstitutionTemplateLiteral(unwrapped.right)) {
		litExpr = unwrapped.right;
		varExpr = unwrapped.left;
	}
	if (!varExpr || !litExpr) return null;
	const varName = extractVariableIdentifier(varExpr);
	if (!varName) return null;
	return {
		varName,
		literal: litExpr.text
	};
}
function collectEqualitiesByVar(leaves) {
	const equalitiesByVar = /* @__PURE__ */ new Map();
	for (const leaf of leaves) {
		const item = extractLiteralEquality(leaf);
		if (item) {
			const set = equalitiesByVar.get(item.varName) ?? /* @__PURE__ */ new Set();
			set.add(item.literal);
			equalitiesByVar.set(item.varName, set);
		}
	}
	return equalitiesByVar;
}
function inspectChainedBinaryNode(node, doc, ast, rel, findings) {
	const equalitiesByVar = collectEqualitiesByVar(flattenOrChain(node));
	const config = getAuditConfig();
	const exemptTokens = new Set(config.domain.exemptComparisonTokens ?? []);
	for (const [varName, literals] of equalitiesByVar) {
		if (literals.size < 3) continue;
		if (Array.from(literals).every((l) => l.length === 1 || l.startsWith(".") || l.startsWith("-") || exemptTokens.has(l))) continue;
		const { line, column } = doc.getNodeLineAndColumn(node, ast);
		const snippet = node.getText(ast).slice(0, 100).replace(/\n/g, "↵");
		findings.push({
			file: rel,
			line,
			col: column,
			pattern: `Chained literal comparison on "${varName}" (${literals.size} options: ${Array.from(literals).map((l) => `"${l}"`).join(", ")})`,
			snippet,
			severity: "ERROR",
			ruleId: "domain-chained-literal-comparison"
		});
	}
}
function auditChainedLiteralComparisonsAst(doc, ast, rel, ruleFilter) {
	if (ruleFilter && ruleFilter !== "domain-chained-literal-comparison") return [];
	const findings = [];
	const visit = (node) => {
		if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarBarToken && isRootOrExpression(node)) inspectChainedBinaryNode(node, doc, ast, rel, findings);
		ts.forEachChild(node, visit);
	};
	visit(ast);
	return findings;
}
function auditFileContent(filePath, content, ruleFilter) {
	const rel = toRepoPath(filePath);
	if (rel.endsWith("validate_domain_types.ts")) return [];
	const findings = [];
	const doc = new AuditedDocument(filePath, content, filePath);
	const ast = doc.getAst();
	if (ast) {
		findings.push(...auditDomainCollectionsAst(doc, ast, rel, ruleFilter));
		findings.push(...auditChainedLiteralComparisonsAst(doc, ast, rel, ruleFilter));
	} else {
		findings.push(...findMatches(content, rel, P_SET_STRING, "Set used as finite-domain storage/validator (use `as const` array + derived type)", "ERROR", "domain-untyped-collection", (match, line) => {
			if (/\ballowedExtensions\s*:\s*new\s+Set/.test(line)) return false;
			const NON_DOMAIN_SET_PATTERN = /\b\w*(?:FLAGS|DIRS|ROOTS|PATHS|COMMANDS|TAGS|ELEMENTS|SELECTORS|TOKENS|KEYWORDS|CHARS|GLOBS|FILES|EXTENSIONS|NAMES|KEYS|WORDS|ALIASES|SKILLS|SKIP|VARIANTS|CLASSES|BUILTINS|PACKAGES|ENTRIES|LINES|CHUNKS|ATTRIBUTES|PROPERTIES)\b/i;
			if (NON_DOMAIN_SET_PATTERN.test(line)) return false;
			if (/\bnew\s+Set\s*(?:<[^>]+>\s*)?\(\s*\[\s*['"`]\.[a-zA-Z0-9]/.test(line)) return false;
			if (line.includes("--")) return false;
			const matchIdx = match.index;
			const prefix = content.slice(Math.max(0, matchIdx - 80), matchIdx);
			if (/allowedExtensions\s*:\s*$/i.test(prefix.trim())) return false;
			if (NON_DOMAIN_SET_PATTERN.test(prefix.trim())) return false;
			const suffix = content.slice(matchIdx, matchIdx + 80);
			if (/\bnew\s+Set\s*(?:<[^>]+>\s*)?\(\s*\[\s*['"`]\.[a-zA-Z0-9]/.test(suffix)) return false;
			return true;
		}));
		findings.push(...findMatches(content, rel, P_MAP_STRING, "Map with string/domain keys used as finite-domain map (use typed object/Record with union keys)", "ERROR", "domain-untyped-collection"));
	}
	const NON_DOMAIN_COLLECTION_REGEX = /\b(?:let|const|var)\s+\w*(?:lines|parts|chunks|words|tokens|classes|errors|warnings|achievements|logs|results|missing|args|flags|files|entries|rows|queries|messages|diffs|patterns|findings|details|dirs|paths|roots|globs|labels|violations|items|commands|scripts|headers|steps|rules|types|extensions|modules|sections|subtitles|names|codes|tags|candidates|res|list|arr|output|buffer|elements|records|sources|targets|params|values|keys|props|attributes|variants|aliases|skills)\b/i;
	const isExemptCollectionLine = (line) => {
		const cleanLine = stripComments(line).trim();
		if (NON_DOMAIN_COLLECTION_REGEX.test(cleanLine)) return true;
		if (/=\s*\[\s*\]\s*;?$/.test(cleanLine) || /=\s*\[\s*\.\.\./.test(cleanLine) || /=\s*(?:Array\.from|Object\.keys|Object\.values|Object\.entries)\b/.test(cleanLine)) return true;
		return false;
	};
	findings.push(...findMatches(content, rel, P_LITERAL_ARRAY_DECL, "String literal array without `as const` — potential untyped domain. Declare with `as const satisfies readonly DomainType[]` or type with semantic type elements (e.g. `readonly DisplayText[]`).", "ERROR", "domain-untyped-collection", (match, line) => {
		if (match[0].includes("as const")) return false;
		return !isExemptCollectionLine(line);
	}));
	findings.push(...findMatches(content, rel, P_TYPED_STRING_ARRAY_DECL, "Raw `string[]` array type annotation — use `readonly DisplayText[]` for user text, derive from an `as const` tuple, or type as a canonical domain collection.", "ERROR", "domain-untyped-collection", (_match, line) => !isExemptCollectionLine(line)));
	findings.push(...findMatches(content, rel, P_TYPE_ALIAS_STRING, "`type X = string` alias has zero nominal type safety — use `type X = (typeof X_VALUES)[number]` or `type X = Brand<string, \"X\">`", "ERROR", "domain-naked-string-primitive"));
	findings.push(...findMatches(content, rel, P_STRING_SINK_UNION, "Domain-like type union ends with `| string` (open string sink) — defeats TypeScript exhaustiveness checking", "ERROR", "domain-naked-string-primitive"));
	findings.push(...findMatches(content, rel, P_FIELD_WILDCARD_STRING_UNION, "Contract property has union with `| string` (e.g. `category: MyCategory | string`) — defeats nominal safety", "ERROR", "domain-naked-string-primitive", (_match, line, file) => isContractFile(file) && !isOpenUnknownDictionary(line)));
	findings.push(...findMatches(content, rel, P_INLINE_LITERAL_UNION_PROPERTY, "Inline string literal union in property declaration — extract to a named canonical domain type alias", "ERROR", "domain-naked-string-primitive", (_match, _line, file) => isContractFile(file)));
	findings.push(...findMatches(content, rel, P_OPEN_STRING_INTERSECTION, "Open string intersection `string & {}` found — use a strict closed union or nominal Branded type", "ERROR", "domain-naked-string-primitive"));
	if (isContractFile(rel)) {
		findings.push(...findMatches(content, rel, P_RECORD_STRING_KEY, "Open `Record<string, ...>` in type/data contract is prohibited. Replace with `Record<DomainId, T>`, `Partial<Record<BrandedId, T>>`, or `JsonObject` at external JSON boundaries. Import from `@francogp/auditor`.", (_match, line, file) => isOpenUnknownDictionary(line) || isAmbientDeclarationFile(file) ? "WARN" : "ERROR", "domain-naked-string-primitive"));
		findings.push(...findMatches(content, rel, P_INDEX_SIGNATURE, "Open string index signature in type/data contract — use explicit domain keys, Branded Types, or JsonObject. Import from `@francogp/auditor`.", (_match, line, file) => isOpenUnknownDictionary(line) || isAmbientDeclarationFile(file) ? "WARN" : "ERROR", "domain-naked-string-primitive"));
		findings.push(...findMatches(content, rel, P_RECORD_PROPERTY_KEY, "Record<PropertyKey, ...> in type/data contract is an open keyspace — use a finite union key", "ERROR", "domain-naked-string-primitive"));
	}
	findings.push(...findMatches(content, rel, P_DOMAIN_STRING_FIELD, "Raw `string` field in type/data contract is prohibited. Replace with `DisplayText` for UI labels, `LocalizedText` for translations, `HexColor` for color codes (#...), `AssetUri` for paths/URLs, `IsoDateString` for dates, or a strict domain union/branded type. Import from `@francogp/auditor`.", "ERROR", "domain-naked-string-primitive", (match, _line, file) => {
		if (!isContractFile(file) || isAmbientDeclarationFile(file)) return false;
		if (isFunctionParameterContext(content, match.index)) return false;
		if (isTextualProperty((match[1] || "").trim(), getAuditConfig().domain?.textualFields)) return false;
		return true;
	}));
	findings.push(...findMatches(content, rel, P_FINITE_DOMAIN_PHASE_STRING, "Finite domain property `phase` typed as raw `string` — use canonical `RemediationPhaseId` or `AuditExecutionPhase` union", "ERROR", "domain-naked-string-primitive"));
	findings.push(...findMatches(content, rel, P_AMBIGUOUS_EMPTY_NULL_TYPE_ALIAS, "Ambiguous type alias mixes empty-string sentinel with null/undefined", "ERROR", "domain-ambiguous-union"));
	findings.push(...findMatches(content, rel, P_AMBIGUOUS_EMPTY_NULL_FIELD, "Ambiguous field type mixes empty-string sentinel with null/undefined", "ERROR", "domain-ambiguous-union", (_match, _line, file) => isContractFile(file)));
	findings.push(...findMatches(content, rel, P_UNBRANDED_DOMAIN_ID_ALIAS, "Unbranded domain ID alias detected — domain IDs should consume Brand<string, \"IdName\"> for nominal compile-time safety", "ERROR", "domain-unbranded-id"));
	findings.push(...findMatches(content, rel, P_TYPECAST_INLINE_DOMAIN_ID, "Inline type assertion `as DomainId` used to force dynamic string into domain type — use boundary guard `isDomainId()` or `requireDomainId()`", "ERROR", "domain-naked-string-primitive", (_match, line) => {
		if (/\bfunction\s+(?:is|require)[A-Z_a-z]\w*/.test(line) || /\bis[A-Z_a-z]\w*\s*=\s*/.test(line)) return false;
		return !isExemptDomainCastTarget(_match[0].replace(/^as\s+/, "").trim());
	}));
	findings.push(...findMatches(content, rel, P_OBJECT_KEYS_CAST, "Type assertion on `Object.keys(...)` or `Object.entries(...)` to `as DomainId[]` — use typed helper or `isDomainId` filtering", "ERROR", "domain-naked-string-primitive", (_match, line) => {
		if (/\bfunction\s+is[A-Z_a-z]\w*/.test(line)) return false;
		return !isExemptDomainCastTarget(_match[0].replace(/^Object\.(?:keys|entries)\s*\([^)]+\)\s+as\s+/, "").replace(/\[\]$/, "").trim());
	}));
	findings.push(...findMatches(content, rel, P_INLINE_ANONYMOUS_OBJECT_PARAM, "Inline anonymous object type in function parameter prohibited — define a named interface or type contract", "ERROR", "domain-naked-string-primitive", (_match, line) => !line.includes("withDefaults")));
	findings.push(...findMatches(content, rel, P_PARAM_WILDCARD_STRING_UNION, "Function parameter mixes domain type with loose `| string` — require strict domain type", "ERROR", "domain-naked-string-primitive", (match) => {
		if (!isFunctionParameterContext(content, match.index)) return false;
		const typeName = match[2] ?? "";
		if (/Auditor|Engine|Config|Harness|Options/.test(typeName)) return false;
		return true;
	}));
	findings.push(...findMatches(content, rel, P_PARAM_DOMAIN_ID_NULLABLE, "Domain ID parameter is nullable — use undefined optional param `id?: DomainId` or explicit null-handling object", "ERROR", "domain-naked-string-primitive", (match, line) => {
		const matchedText = match[0] ?? "";
		const idName = (match[1] || match[2] || "").trim();
		const typeName = matchedText.replace(/^[a-z_]\w*\s*:\s*/i, "").replace(/\s*\|\s*(?:null|undefined)/, "").replace(/(?:null|undefined)\s*\|\s*/, "").trim();
		if (isExemptDomainCastTarget(idName) || isExemptDomainCastTarget(typeName)) return false;
		if (/(?:timer|timeout|interval|suite|rule|run|build)id/i.test(idName) || /(?:timer|timeout|interval|suite|rule|run|build)id/i.test(typeName)) return false;
		if (line.trim().startsWith("private ") || line.trim().startsWith("protected ") || line.trim().startsWith("public ") || line.trim().startsWith("readonly ")) return false;
		if (line.includes("defineProps") || line.includes("defineEmits")) return false;
		return isFunctionParameterContext(content, match.index);
	}));
	findings.push(...findMatches(content, rel, P_DOMAIN_TYPE_NULLABLE, "Domain ID type alias includes null/undefined — domain types must represent valid present entities", "ERROR", "domain-naked-string-primitive"));
	return ruleFilter ? findings.filter((f) => f.ruleId === ruleFilter) : findings;
}
async function auditFile(filePath, ruleFilter) {
	return auditFileContent(filePath, await fs.readFile(filePath, "utf8"), ruleFilter);
}
var DomainTypesAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options, (config) => config.paths.includeTestsInCodeAudit ? [...config.paths.codeRoots ?? [], ...config.paths.testRoots ?? []] : config.paths.codeRoots ?? []);
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(DOMAIN_TYPES_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: true,
				changedOnly: false,
				critical: true
			}),
			id: "validate_domain_types",
			name: "Domain Types Integrity Audit",
			description: "Raw string usage instead of domain types",
			family: "domain_data",
			ruleIds: DOMAIN_TYPES_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(DOMAIN_TYPES_RULES, "contracts"),
			packageName: "Domain",
			configKey: "domain",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "🔒",
			ruleDescriptions: {
				"domain-naked-string-primitive": "Raw string in domain contracts",
				"domain-untyped-collection": "Set, Map, or Array without as const",
				"domain-ambiguous-union": "Union with empty string and null",
				"domain-unbranded-id": "ID alias without nominal Brand",
				"domain-chained-literal-comparison": "Chained literal comparisons"
			},
			ruleRemediations: {
				"domain-naked-string-primitive": "📖 REMEDIATION GUIDE: domain-naked-string-primitive\n1. Root Cause: Primitive \"string\" was used in a domain contract property (interface, DTO, type, or state). Naked strings undermine static type safety.\n2. Diagnosis: Look up the reported property in the interface or type of the reported file.\n3. Canonical Solution: DO NOT USE ESCAPE HATCHES (// domain-ok: or // string-ok:). Replace with canonical semantic types from `@francogp/auditor`:\n   - For human-readable UI text, titles, descriptions: `DisplayText`\n   - For i18n / translation tokens: `LocalizedText`\n   - For CSS color codes (#...): `HexColor`\n   - For asset/image/URL paths: `AssetUri`\n   - For ISO dates: `IsoDateString`\n   - For CSS class names: `CssClassName`\n   - For open JSON payloads / dictionaries: `JsonObject`\n   - For entity categories/modes: derive strict union from `as const` tuple.\n4. Example / Copy-pasteable import:\n   import type { DisplayText, HexColor, AssetUri } from \"@francogp/auditor\";\n   ❌ Incorrect: interface Card { title: string; color: string; }\n   ✅ Correct:   interface Card { title: DisplayText; color: HexColor; }",
				"domain-untyped-collection": "📖 REMEDIATION GUIDE: domain-untyped-collection\n1. Root Cause: A collection (Set, Map, or constant Array) was declared without specific domain typing or without \"as const\", allowing TypeScript to infer generic string[] or Set<string>.\n2. Diagnosis: Review the declaration of the reported array, Set, or Map.\n3. Canonical Solution: DO NOT USE // runtime-set: or // no-domain:. Specify the canonical generic domain type on Set/Map, or add \"as const\" to the array:\n   - For Sets: `const S = new Set<DomainId>([\"a\", \"b\"])` or `const S: ReadonlySet<DomainId> = new Set([...])`\n   - For Maps: `const M = new Map<DomainId, Value>([[\"a\", val]])`\n   - For arrays: `const MODES = [\"solo\", \"party\"] as const`\n   - For runtime accumulators: initialize as empty array `const list: DisplayText[] = []`\n4. Example:\n   ❌ Incorrect: const VALID_ITEMS = new Set([\"potion\", \"ball\"]); // runtime-set:\n   ✅ Correct:   const VALID_ITEMS: ReadonlySet<ItemId> = new Set<ItemId>([\"potion\", \"ball\"]);",
				"domain-ambiguous-union": "📖 REMEDIATION GUIDE: domain-ambiguous-union\n1. Root Cause: A type union simultaneously combines empty-string (\"\") along with null or undefined (e.g.: string | \"\" | null). This generates semantic ambiguity regarding which represents the legitimate empty state.\n2. Diagnosis: Review the type definition on the reported line.\n3. Canonical Solution: Unify representation of absence of value exclusively using null or undefined (or valid literal union), eradicating empty-string as sentinel.\n4. Example:\n   ❌ Incorrect: type FilterValue = CategoryId | \"\" | null;\n   ✅ Correct:   type FilterValue = CategoryId | null;",
				"domain-unbranded-id": "📖 REMEDIATION GUIDE: domain-unbranded-id\n1. Root Cause: An identifier alias was declared as a simple synonym of primitive string (e.g. type HeroId = string). This enables accidental duck-typing without compiler warnings.\n2. Diagnosis: Look for type declaration \"type ...Id = string\".\n3. Canonical Solution: DO NOT USE // uuid-ok: or // infra-id-ok:. Use nominal Branded Types exported by `@francogp/auditor`:\n   - For user/session UUIDs: `UserUuid`\n   - For DOM element / test locator IDs: `DomElementId`\n   - For custom entity IDs: `type HeroId = Brand<string, \"HeroId\">`\n4. Example / Copy-pasteable import:\n   import type { Brand, UserUuid, DomElementId } from \"@francogp/auditor\";\n   ❌ Incorrect: export type HeroId = string; // uuid-ok:\n   ✅ Correct:   export type HeroId = Brand<string, \"HeroId\">;",
				"domain-chained-literal-comparison": "📖 REMEDIATION GUIDE: domain-chained-literal-comparison\n1. Root Cause: Chained string literal comparisons (x === \"a\" || x === \"b\" || x === \"c\") were used to validate membership in an ad-hoc finite domain or reimplement a type guard. Dispersed string comparisons drift out of sync, violate DRY, and create fragile O(N) branching.\n2. Diagnosis: Look at the reported boolean expression where three or more string literals are compared against the same variable.\n3. Canonical Solution: Declare an immutable array with \"as const\" (e.g. const VALID_ITEMS = [\"a\", \"b\", \"c\"] as const), derive its union type (type Item = (typeof VALID_ITEMS)[number]), and validate membership using a ReadonlySet (O(1)) or canonical type-guard function.\n4. Example:\n   ❌ Incorrect: if (mode === \"easy\" || mode === \"normal\" || mode === \"hard\") { ... }\n   ✅ Correct:   export const GAME_MODES = [\"easy\", \"normal\", \"hard\"] as const;\n                  export type GameMode = (typeof GAME_MODES)[number];\n                  const GAME_MODE_SET: ReadonlySet<string> = new Set(GAME_MODES);\n                  if (GAME_MODE_SET.has(mode)) { ... }"
			},
			coverage: {
				include: deriveCoverageFromRoots(targetRoots, EXTENSIONS).include,
				exclude: [
					"scripts/auditors/**",
					"scripts/lib/**",
					"coverage/**",
					"packages/**"
				]
			},
			roots: targetRoots,
			allowedExtensions: EXTENSIONS,
			extraIgnorePatterns: [
				"scripts/auditors/**",
				"scripts/lib/**",
				"coverage/**",
				"packages/**"
			],
			projectRoot: effectiveRoot
		});
	}
	collectAuditableDomainFiles() {
		const files = this.context.collectFiles(this.roots, this.allowedExtensions);
		if (files.length === 0) for (const rule of DOMAIN_TYPES_RULES) this.markRuleNotApplicable(rule, "No source files found to validate domain types");
		return files;
	}
	async runAudit() {
		if (this.isSuiteGatingDisabled("Domain disabled in config")) {
			this.redeclareCoverage({
				include: ["src/**/*.ts"],
				source: "declared-only"
			});
			return;
		}
		const filePaths = this.collectAuditableDomainFiles();
		if (filePaths.length === 0) return;
		const findingsByRule = /* @__PURE__ */ new Map();
		for (const rule of DOMAIN_TYPES_RULES) findingsByRule.set(rule, []);
		for (const filePath of filePaths) {
			this.recordScanned(toRepoPath(filePath));
			const fileFindings = auditFileContent(filePath, await fs.readFile(filePath, "utf8"));
			for (const finding of fileFindings) findingsByRule.get(finding.ruleId)?.push(finding);
		}
		let totalIssues = 0;
		for (const ruleId of DOMAIN_TYPES_RULES) await this.runSubAuditor(ruleId, () => {
			const findings = findingsByRule.get(ruleId) ?? [];
			for (const finding of findings) {
				totalIssues++;
				this.addViolation({
					ruleId: finding.ruleId,
					severity: finding.severity === "ERROR" ? "error" : "warning",
					file: finding.file,
					line: finding.line,
					column: finding.col,
					message: finding.pattern,
					context: finding.snippet
				});
			}
		});
		this.context.setMetric("Scanned files", filePaths.length);
		this.context.setMetric("Domain issues", totalIssues);
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new DomainTypesAuditor());
//#endregion
export { CANONICAL_INFRA_ID_WHITELIST, CANONICAL_TEXTUAL_PROPERTY_NAMES, DEFAULT_TEST_PATH_MARKERS, DOMAIN_COLLECTION_CONTEXT_WINDOW_CHARS, DOMAIN_TYPES_RULES, DomainTypesAuditor, DomainTypesAuditor as ValidateDomainTypesAuditor, auditFile, auditFileContent, isTextualProperty };
