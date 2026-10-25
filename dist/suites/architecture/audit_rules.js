import { normalizePosixPath } from "../../core/reportUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isTestPath } from "../../core/auditTestPredicates.js";
import "../../core/safePath.js";
import { isInCodeRoots, isScriptPath } from "../../core/auditCodeRoots.js";
import { Z_LAYERS } from "../../core/auditZLayers.js";
import { isDataPath, isExemptFile } from "../../core/auditPathPredicates.js";
import "../../core/auditConfig.js";
import { parseVueSfc as parseVueSfcBlocks } from "../../core/vueSfcParser.js";
import { AUDIT_SEVERITIES, getLineAtMatch, isCommentLine, isTestOrNodeModules, matchesRule, normalizeFilePath } from "../../analyzers/auditRuleTypes.js";
import { CANONICAL_INFRA_ID_WHITELIST } from "../domain_data/validate_domain_types.js";
import { DEFAULT_ALLOWED_NUMERIC_CONSTANT_PREFIXES, badConstantNames, isAuditableCodeFile, isConstantNameExemptFromNumericSuffixCheck, noAliasConstants, noLiteralSuffixInConstantName } from "../../analyzers/constantRules.js";
import { CANONICAL_DEFAULT_Z_LAYERS, Z_INDEX_CONSISTENCY_DESCRIPTOR, Z_SORTED_ENTRIES, Z_VALUE_MAP, resolveZLayer, zIndexAudit, zIndexConstantDeclaration } from "../../analyzers/zIndexRules.js";
import path from "node:path";
import fs from "node:fs";
// src/suites/architecture/audit_rules.ts
/**
* scripts/maintenance/audit_rules.ts
*
* Centralized audit rules and checkers for the unified audit engine.
*/
const FALLOW_SUITE_DESCRIPTORS = {
	dupes: {
		id: "fallow:dupes",
		name: "Fallow Code Duplication",
		category: "Fallow: Duplicate code",
		aliases: [
			"dupes",
			"duplicados",
			"clones",
			"fallow:dupes",
			"fallow-dupes",
			"fallow"
		]
	},
	triplets: {
		id: "fallow:triplets",
		name: "Fallow Code Triplication",
		category: "Fallow: Triplicate code",
		aliases: [
			"triplets",
			"triplicados",
			"fallow:triplets",
			"fallow-triplets",
			"fallow"
		]
	},
	security: {
		id: "fallow:security",
		name: "Fallow Security CWE Vulnerabilities",
		category: "Fallow: Security vulnerability",
		aliases: [
			"security",
			"seguridad",
			"cwe",
			"vulnerabilidad",
			"vulnerabilidades",
			"fallow:security",
			"fallow-security",
			"fallow"
		]
	},
	"dead-code": {
		id: "fallow:dead-code",
		name: "Fallow Dead Code, Circular Dependencies & Unused",
		category: "Fallow: Orphaned files",
		aliases: [
			"dead-code",
			"deadcode",
			"codigo-muerto",
			"circular",
			"huérfano",
			"unused",
			"fallow:dead-code",
			"fallow-dead-code",
			"fallow",
			"store-members",
			"class-members",
			"types",
			"emits",
			"unlisted",
			"workspace",
			"diagnostics",
			"targets",
			"refactoring"
		]
	},
	health: {
		id: "fallow:health",
		name: "Fallow Code Health & Complexity",
		category: "Fallow: Complexity",
		aliases: [
			"health",
			"salud",
			"complexity",
			"complejidad",
			"fallow:health",
			"fallow-health",
			"fallow"
		]
	}
};
const SASS_MIGRATOR_DESCRIPTOR = {
	id: "sass-migrator",
	name: "SASS Module Migrator",
	category: "SASS Migrator",
	aliases: [
		"sass",
		"sass-migrator",
		"import",
		"@import",
		"scss"
	]
};
const viewport = {
	id: "viewport",
	name: "Viewport Units",
	category: "Viewport (dvh/dvw)",
	aliases: [
		"viewport",
		"dvh",
		"dvw",
		"vh",
		"vw"
	],
	regex: /\b\d+(?:\.\d+)?(vw|vh)\b/gi,
	message: (match) => `Legacy viewport unit detected: '${match}'. Use '${match.slice(0, -2)}d${match.slice(-2).toLowerCase()}' for dynamic mobile viewport support.`,
	fix: (match) => `${match.slice(0, -2)}d${match.slice(-2).toLowerCase()}`
};
const legacyDates = {
	id: "legacyDates",
	name: "Temporal Migration",
	category: "Date Usage (Temporal)",
	aliases: [
		"temporal",
		"date",
		"dates",
		"legacy-dates"
	],
	regex: /new Date\(|Date\.now\(\)/g,
	message: "Usage of 'Date' detected. Use 'Temporal'.",
	severity: "error",
	appliesTo: (filePath) => {
		return !isExemptFile(filePath) && isInCodeRoots(filePath);
	},
	check: (_content, _match, filePath) => {
		if (!filePath) return false;
		if (isExemptFile(filePath)) return false;
		return isInCodeRoots(filePath);
	},
	fixable: false
};
const hardcodedTimezone = {
	regex: /toZonedDateTimeISO\(\s*['"]([^'"]+)['"]\s*\)|toPlainDateTime\(\s*['"]([^'"]+)['"]\s*\)|Temporal\.TimeZone\.from\(\s*['"]([^'"]+)['"]\s*\)/g,
	message: (match) => {
		const tzVar = getAuditConfig().domain?.timezoneVariable ?? "APP_TIMEZONE";
		const helperMod = getAuditConfig().domain?.timezoneHelperModule;
		return `Hardcoded timezone detected: '${match}'. Use global variable '${tzVar}'${helperMod ? ` imported from '${helperMod}'` : ""} to respect server configuration.`;
	},
	severity: "error",
	appliesTo: (filePath) => {
		const config = getAuditConfig();
		if (config?.domain?.enabled === false) return false;
		const helperMod = config.domain?.timezoneHelperModule;
		if (helperMod && filePath.includes(helperMod.replace(/^@\//, ""))) return false;
		if (isExemptFile(filePath)) return false;
		return isInCodeRoots(filePath);
	},
	check: () => true,
	fixable: false
};
function getDomainIdFallbackRegex() {
	const config = getAuditConfig();
	const joined = (config?.domain?.fallbackIdPatterns && config.domain.fallbackIdPatterns.length > 0 ? config.domain.fallbackIdPatterns : [
		"[a-zA-Z0-9_]*[iI]d",
		"type",
		"status",
		"category",
		"mode",
		"kind"
	]).join("|");
	return new RegExp(`(?:${joined})\\s*(?:=|:)\\s*[^,;\\n]*?(?:\\?|\\|\\||\\?\\?)\\s*['"]['"]|\\b(?:${joined})\\s*(?:\\|\\||\\?\\?)\\s*[^,\\n;)]*\\b(?:name|description|title)\\b|\\b(?:name|description|title)\\s*(?:\\|\\||\\?\\?)\\s*[^,\\n;)]*\\b(?:${joined})\\b`, "g");
}
function isDomainAuditTarget(filePath, config = getAuditConfig()) {
	if (!filePath) return false;
	if (config.domain?.enabled === false) return false;
	if (!isInCodeRoots(filePath, config)) return false;
	if (isExemptFile(filePath, config)) return false;
	return true;
}
function isAllowedDatabaseFile(filePath, config = getAuditConfig()) {
	const norm = normalizeFilePath(filePath);
	return [
		"database.ts",
		"database.types.ts",
		"supabase.types.ts",
		"schema.types.ts",
		"db.types.ts",
		...config.persistence?.allowedDatabaseFiles ?? []
	].some((f) => norm.endsWith(normalizePosixPath(f)));
}
const noDomainIdFallbacks = {
	get regex() {
		return getDomainIdFallbackRegex();
	},
	message: "SILENT FALLBACK ON DOMAIN ID / NAME DETECTED. Using silent fallbacks (such as || '', ?? '', or swapping id with name) is strictly prohibited for domain identifiers. A strict validation function throwing an explicit error (Fail Loud) must be used if the ID is missing or invalid.",
	severity: "error",
	check: (_content, match, filePath) => {
		const config = getAuditConfig();
		if (!isDomainAuditTarget(filePath, config)) return false;
		const matchText = match[0] || "";
		if (/(?:===|!==|==|!=)/.test(matchText) || /!\s*(?:name|description|title)\b/.test(matchText)) return false;
		const infraWhitelist = [...CANONICAL_INFRA_ID_WHITELIST, ...config.domain?.infraIdWhitelist ?? []];
		if (infraWhitelist.length > 0) {
			if (infraWhitelist.some((id) => new RegExp(`\\b${id}\\b`).test(matchText))) return false;
		}
		const configPatterns = getAuditConfig()?.domain?.fallbackIdPatterns;
		if (configPatterns && configPatterns.length > 0) {
			const matchText = match[0] || "";
			if (!configPatterns.some((p) => matchText.includes(p))) return false;
		}
		return true;
	},
	fixable: false
};
const nodePrefix = {
	regex: /import .* from ['"](fs|path|os|crypto|util|url|events|stream|child_process)['"]/g,
	message: "Node import without 'node:' prefix.",
	check: (_content, _match, filePath) => {
		if (!filePath || filePath.includes("audit_rules.ts")) return false;
		return true;
	},
	fix: (match) => match.replace(/['"](fs|path|os|crypto|util|url|events|stream|child_process)['"]/, (m) => m.slice(0, 1) + "node:" + m.slice(1))
};
const RULES_TARGET_NODE_VERSION_LABEL = "26";
function resolveRelativeTargetExtension(importSpec, importerFile) {
	if (/\.jsx$/i.test(importSpec)) return importSpec.replace(/\.jsx$/i, ".tsx");
	if (/\.(?:js|mjs|cjs)$/i.test(importSpec)) return importSpec.replace(/\.(?:js|mjs|cjs)$/i, ".ts");
	if (/\.css$/i.test(importSpec)) {
		if (importerFile && fs.existsSync(importerFile)) {
			const scssTarget = path.resolve(path.dirname(importerFile), importSpec.replace(/\.css$/i, ".scss"));
			if (!fs.existsSync(scssTarget)) return null;
		}
		return importSpec.replace(/\.css$/i, ".scss");
	}
	if (importerFile && fs.existsSync(importerFile)) {
		const baseDir = path.dirname(importerFile);
		for (const ext of [
			".ts",
			".tsx",
			".vue",
			".json"
		]) if (fs.existsSync(path.resolve(baseDir, `${importSpec}${ext}`))) return `${importSpec}${ext}`;
		for (const idx of ["/index.ts", "/index.tsx"]) if (fs.existsSync(path.resolve(baseDir, `${importSpec}${idx}`))) return `${importSpec}${idx}`;
		return null;
	}
	return `${importSpec}.ts`;
}
const esmExtensions = {
	regex: /(?:import|export)\s+(?:type\s+)?(?:[^;'"]+?\s+from\s+)?['"](\.\.?\/[^'"]+)['"]/g,
	message: (match) => {
		if (/\.(?:js|jsx|mjs|cjs)['"]/.test(match)) return `Relative import with legacy JS extension: '${match}'. Migrate to explicit TypeScript extension (.ts / .tsx).`;
		if (/\.css['"]/.test(match)) return `Relative import to plain CSS file: '${match}'. Migrate to SCSS (.scss).`;
		return `Relative import without extension: '${match}'. In native Node.js ${RULES_TARGET_NODE_VERSION_LABEL}+ file extensions are mandatory.`;
	},
	severity: "error",
	fix: (match, _p1, filePath) => match.replace(/(['"])(\.\.?\/[^'"]+)(['"])/, (fullQuote, q1, p, q2) => {
		const resolved = resolveRelativeTargetExtension(p, filePath);
		if (!resolved) return fullQuote;
		return `${q1}${resolved}${q2}`;
	}),
	check: (_content, match, filePath) => {
		if (!filePath || filePath.includes("audit_rules.ts") || filePath.endsWith(".vue")) return false;
		const importPath = match[1] || "";
		if (/\.(?:js|jsx|mjs|cjs)$/i.test(importPath)) return true;
		if (/\.css$/i.test(importPath)) return getAuditConfig().styles?.enforceScss !== false;
		if (/\.(?:ts|tsx|vue|json|scss|sass|less|svg|png|jpg|jpeg|gif|webp|avif|ico|ogg|mp3|wav|mp4|webm|woff|woff2|ttf|otf|eot|wasm|sql|glsl|vert|frag|txt|md|ya?ml)$/i.test(importPath)) return false;
		return true;
	}
};
const tsIgnore = {
	regex: /\/\/\s*@ts-(ignore|nocheck|expect-error)/g,
	message: "TypeScript suppression detected. Prohibited under the 'Zero-Ignore' policy.",
	severity: "error",
	fix: () => "",
	fixable: true
};
const timersPromises = {
	regex: /new Promise\(r => setTimeout\(r, (\d+)\)\)/g,
	message: "Manual setTimeout detected in Node script. Use 'import { setTimeout } from \"node:timers/promises\"' instead.",
	check: (_content, _match, filePath) => !!filePath && isScriptPath(filePath) && !normalizeFilePath(filePath).includes("node_modules"),
	fixable: false
};
const explicitResource = {
	regex: /const (\w+) = (new DatabaseSync)/g,
	message: `Resource detected without 'using'. Use Explicit Resource Management (Node ${RULES_TARGET_NODE_VERSION_LABEL}+).`,
	fix: (match) => match.replace("const", "using"),
	check: (content, match, filePath) => {
		if (!filePath || !isScriptPath(filePath)) return false;
		const { trimmed } = getLineAtMatch(content, match.index ?? 0);
		if (isCommentLine(trimmed)) return false;
		return true;
	}
};
const zeroTimerLogic = {
	id: "zeroTimerLogic",
	name: "Zero Timer Logic",
	aliases: ["zerotimerlogic"],
	regex: /(?<!\.)\b(sleep)\s*\(/g,
	message: "Native 'sleep()' detected in core logic. Business logic functions must be 100% deterministic and event-driven.",
	severity: "error",
	check: (content, _match, filePath) => {
		if (!filePath) return false;
		if (filePath.endsWith("audit_rules.ts")) return false;
		if (/audit-disable\s+timers/i.test(content)) return false;
		if (!isInCodeRoots(filePath)) return false;
		if (isExemptFile(filePath)) return false;
		return true;
	},
	fixable: false
};
const jsonStringifyInWatch = {
	regex: /\bwatch\s*\(\s*(?:\(\)\s*=>\s*)?JSON\.stringify/g,
	message: "Usage of 'JSON.stringify' inside a watcher detected. Serializing objects/arrays in high-frequency watchers saturates CPU. Perform direct element comparisons or use deep watchers ({ deep: true }) with care.",
	severity: "error",
	fixable: false
};
const intersectionObserverRoot = {
	regex: /new\s+IntersectionObserver\s*\([^,]+,\s*\{[^}]*root\s*:\s*(?!null\b)[\w$]/g,
	message: "Dynamic or DOM 'root' in IntersectionObserver detected. In scaled or zoomed containers, using a root other than null causes visibility calculation bugs that disable animations. Leave 'root' as 'null' (viewport) or omit it.",
	severity: "warning",
	fixable: false
};
const functionCallsInTemplates = {
	regex: /(?::[a-z0-9-]+|v-bind:[a-z0-9-]+)="([\w$]+)\([^"]*\)"|\{\{\s*([\w$]+)\([^}]*\)\}/gi,
	message: (match) => `Function or method call '${match}' detected in Vue template. Calling functions that perform database queries, array transformations (.map/.filter), or heavy logic in the render loop is PROHIBITED. Cache data via 'computed'.`,
	severity: "error",
	check: (content, match, filePath) => {
		if (!filePath) return false;
		const funcName = match[1] || match[2];
		if (!funcName) return false;
		const userSafe = getAuditConfig().templates?.safeTemplateFunctions ?? [];
		if (new Set([...[
			"t",
			"i18n",
			"translate",
			"formatNumber",
			"class",
			"style",
			"typeof"
		], ...userSafe].map((f) => f.toLowerCase())).has(funcName.toLowerCase())) return false;
		try {
			const scriptStart = content.indexOf("<script");
			const scriptEnd = content.indexOf("<\/script>");
			if (scriptStart === -1 || scriptEnd === -1) return false;
			const scriptContent = content.substring(scriptStart, scriptEnd);
			const defMatch = new RegExp(`(?:const|let|var|function)\\s+${funcName}\\b[^;]*`, "g").exec(scriptContent);
			if (!defMatch) return false;
			const defStart = defMatch.index;
			const defContext = scriptContent.substring(defStart, Math.min(scriptContent.length, defStart + 1e3));
			const prohibitedDb = getAuditConfig().persistence?.prohibitedTemplateIdentifiers && getAuditConfig().persistence.prohibitedTemplateIdentifiers.length > 0 ? getAuditConfig().persistence.prohibitedTemplateIdentifiers : getAuditConfig().persistence?.engine === "none" ? [] : ["supabase", "db"];
			const dbPattern = prohibitedDb.length > 0 ? prohibitedDb.join("|") + "|" : "";
			return new RegExp(`\\b(${dbPattern}\\.map\\(|\\.filter\\(|\\.reduce\\()`, "i").test(defContext);
		} catch {
			return false;
		}
	},
	fixable: false
};
const forbiddenFallbacks = {
	regex: /\b\w*Provider\.\w+\([^)]*\)\s*(?:\|\||\?\?)|\b([\w$]+)\.(?:\w*[iI]d|name)\s*(?:\|\||\?\?)\s*\1\.(?:name|description|title|id)\b|\b(?:\w+\??\.)*\w*[uU]id\s*(?:\|\||\?\?)\s*(?:\w+\??\.)*\w*[uU]id\b/g,
	message: (match) => `Silent fallback or forbidden lookup pattern detected: '${match}'. Under (/domain-type-first Zero-Fallback Mandate), chaining fallbacks on domain IDs or using descriptions as ID fallback is STRICTLY PROHIBITED. Fail loud with throw new Error().`,
	severity: "error",
	check: (_content, _match, filePath) => {
		if (!filePath) return false;
		if (getAuditConfig().domain?.enabled === false) return false;
		if (isExemptFile(filePath)) return false;
		return isInCodeRoots(filePath);
	},
	fixable: false
};
const forbiddenTypeCasts = {
	regex: new RegExp([
		"\\bas\\s+unknown\\s+as\\b",
		"\\bas\\s+any\\s+as\\b",
		"\\bas\\s+any\\b",
		":\\s*any\\b",
		"<any>"
	].join("|"), "g"),
	message: (match) => `Arbitrary cast or prohibited 'any' type detected: '${match}'. Violates type integrity directives (/domain-type-first and AGENTS.md Rule 7). Define and import an explicit interface or union type.`,
	severity: "error",
	check: (content, match, filePath) => {
		if (!filePath) return false;
		if (isExemptFile(filePath)) return false;
		if (!isInCodeRoots(filePath)) return false;
		const { trimmed } = getLineAtMatch(content, match.index ?? 0);
		if (isCommentLine(trimmed)) return false;
		return true;
	},
	fixable: false
};
function checkTypeScriptRuleMatch(content, match, filePath) {
	if (!filePath) return false;
	const norm = normalizeFilePath(filePath);
	if (!(getAuditConfig()?.paths?.codeRoots ?? []).some((root) => norm.includes(path.posix.relative("/", path.posix.resolve("/", root))))) return false;
	const { trimmed } = getLineAtMatch(content, match.index);
	if (isCommentLine(trimmed)) return false;
	return true;
}
function createTypeScriptRule(config) {
	return {
		regex: config.regex,
		message: config.message,
		severity: "error",
		check: (content, match, filePath) => checkTypeScriptRuleMatch(content, match, filePath),
		fixable: config.fixable ?? false,
		...config.fix ? { fix: config.fix } : {}
	};
}
const noLiteralBooleanType = createTypeScriptRule({
	regex: /\b(?:(?:export\s+)?const|let|var)\s+[A-Z_a-z]\w*\s*:\s*(?:true|false)\b|\b(?:export\s+)?type\s+[A-Z_a-z]\w*\s*=\s*(?:true|false)\s*;|^\s*(?:readonly\s+)?[A-Z_a-z]\w*\??:\s*(?:true|false)\s*;|\(\s*[A-Z_a-z]\w*\??:\s*(?:true|false)\b/gm,
	message: (match) => `Literal boolean type detected: '${match.trim()}'. Declaring types with boolean literals (: true / : false) instead of canonical 'boolean' is prohibited. Use ': boolean'.`,
	fixable: true,
	fix: (content) => content.replace(/:\s*(?:true|false)\b/g, ": boolean")
});
const noInlineAnonymousObjectType = createTypeScriptRule({
	regex: /\(\s*[A-Za-z0-9_$,\s]*\b[A-Z_a-z]\w*\??\s*:\s*\{\s*(?:readonly\s+)?[A-Z_a-z]\w*\??\s*:\s*(?:string|number|boolean|unknown|any|[A-Z]\w*)(?:\[\])?\s*[,;]\s*(?:readonly\s+)?[A-Z_a-z]\w*\??\s*:[^\n}]*\}\s*[,)]/g,
	message: (match) => `Inline anonymous object type detected in parameter: '${match.trim()}'. Using inline anonymous object shapes in function signatures is PROHIBITED. Define and import a named interface or type (e.g. UserPayload).`
});
const noFloatingPromises = createTypeScriptRule({
	regex: /^\s*(?!(?:await|void|return|const|let|var)\s)(?:[A-Z_a-z]\w*\.)?[a-z]\w*Async\s*\([^)]*\)\s*;/gm,
	message: (match) => `Floating promise detected: '${match.trim()}'. Every async function call must be explicitly handled with await, void, or .catch().`,
	fixable: true,
	fix: (content) => content.replace(/^\s*([a-z]\w*Async\s*\([^)]*\)\s*;)/gm, "void $1")
});
const noLeakedGlobalState = createTypeScriptRule({
	regex: /^(?:export\s+)?let\s+[a-z]\w*\s*=/gm,
	message: (match) => `Global mutable variable detected at module scope: '${match.trim()}'. Encapsulate state within a Pinia store or class.`
});
const BASE_INFRA_AND_UUID_IDENTIFIERS = /* @__PURE__ */ new Set([
	"userId",
	"user_id",
	"clientId",
	"client_id",
	"profileId",
	"profile_id",
	"accountId",
	"account_id",
	"sessionId",
	"session_id",
	"socketId",
	"socket_id",
	"notificationId",
	"notification_id",
	"taskId",
	"task_id",
	"jobId",
	"job_id",
	"conversationId",
	"conversation_id",
	"terminalId",
	"terminal_id",
	"messageId",
	"message_id",
	"authId",
	"auth_id",
	"elementId",
	"modalId",
	"tabId",
	"domId",
	"htmlId",
	"uid",
	"toastId",
	"targetUid",
	"sourceId",
	"source_id",
	"targetId",
	"rawId",
	"expectedId",
	"expected_id",
	"eventId",
	"event_id",
	"categoryId",
	"category_id",
	"categoryIdOrUid",
	"maybeUid"
]);
function getEffectiveInfraIdentifiers() {
	const configured = getAuditConfig().domain.infraIdWhitelist ?? [];
	return /* @__PURE__ */ new Set([...BASE_INFRA_AND_UUID_IDENTIFIERS, ...configured]);
}
const strictDomainParamTypes = {
	id: "strictDomainParamTypes",
	name: "Strict Domain Param Types",
	regex: /\b(\w{2,}[iI]d)\s*\??:\s*(?:string\b(?!\s*\[\])|[A-Z]\w*\s*\|\s*string\b)/g,
	message: (match) => match.includes("|") ? `[DOMAIN-TYPE-FIRST MANDATE] Parameter or property '${match}' combines a domain type with '| string'.
   RULE: Under (/domain-type-first) combining finite domain unions with '| string' is STRICTLY PROHIBITED.
   SOLUTION: Use the pure canonical union exclusively.` : `[DOMAIN-TYPE-FIRST MANDATE] Parameter or property '${match}' typed with naked 'string'.
   RULE: Catalog domain IDs MUST be typed with their canonical domain union.
   INSTANCES vs CATALOG:
      - If it represents a dynamic instance / UUID (e.g. generated ID), name it '*Uid' (e.g. 'targetUid', 'instanceUid') to be automatically recognized.
      - If it is an external infrastructure UUID (DOM, WebSocket), type it with DomElementId or UserUuid from @francogp/auditor.`,
	severity: "error",
	check: (_content, match, filePath) => {
		const config = getAuditConfig();
		if (!isDomainAuditTarget(filePath, config)) return false;
		if (isAllowedDatabaseFile(filePath, config)) return false;
		const idParamName = match[1];
		if (!idParamName) return false;
		if (match[0].includes("|")) return true;
		if (/^_{0,2}(?:uid|UID|\w+(?:Uid|UID|_uid|_UID)|\w+[uU]idOr\w+)$/.test(idParamName)) return false;
		const infraIds = getEffectiveInfraIdentifiers();
		if (infraIds.has(idParamName)) return false;
		if (idParamName.startsWith("p_") && infraIds.has(idParamName.slice(2))) return false;
		return true;
	},
	fixable: false
};
const noInlineTypeImports = {
	id: "noInlineTypeImports",
	name: "No Inline Type Imports",
	regex: /:\s*import\(['"][^'"]+['"]\)\.\w+/g,
	message: (match) => `[CLEAN IMPORTS MANDATE] Usage of inline type import '${match}' detected.
   RULE: Importing types inline in parameters or properties inside source code (.ts/.vue) is prohibited.
   SOLUTION: Add explicit 'import type { ... } from "..."' in the file header and use the named type directly in the signature to keep code readable and dependency trees clear. (Only ambient .d.ts files are exempt).`,
	severity: "error",
	check: (_content, _match, filePath) => {
		if (!isAuditableCodeFile(filePath)) return false;
		if (normalizeFilePath(filePath).endsWith(".d.ts")) return false;
		return true;
	},
	fixable: false
};
const noInlineLiteralUnions = {
	id: "noInlineLiteralUnions",
	name: "No Inline Literal Unions",
	regex: /:\s*(?:'[^']+'|"[^"]+")(?:\s*\|\s*(?:'[^']+'|"[^"]+"))+/g,
	message: (match) => `[DOMAIN-TYPE-FIRST MANDATE] Inline string literal union detected: '${match.slice(1).trim()}'.
   RULE: Under (/domain-type-first) declaring ad-hoc inline literal unions scattered across contracts, components, or functions is PROHIBITED.
   SOLUTION: Centralize catalog constants via an 'as const' array and derive the canonical type with '(typeof ARRAY)[number]' (e.g. 'export const FOOS = [...] as const; export type Foo = (typeof FOOS)[number];').`,
	severity: "error",
	check: (_content, _match, filePath) => {
		if (!filePath || isTestPath(filePath)) return false;
		const config = getAuditConfig();
		if (!isInCodeRoots(filePath, config) || isExemptFile(filePath, config)) return false;
		return true;
	},
	fixable: false
};
const noRawJsonImportsOutsideData = {
	id: "noRawJsonImportsOutsideData",
	name: "No Raw JSON Import Outside Data Layer",
	category: "Bundle Optimization",
	regex: /\bimport\s[^;]+\sfrom\s+['"][^'"]+\.json['"]/g,
	message: (match) => `Static JSON import outside src/data/ or scripts/: '${match}'. Centralize catalogs in src/data/ or use dynamic import to prevent redundant bundling.`,
	severity: "error",
	fixable: false,
	check: (_content, _match, filePath) => {
		if (!filePath) return true;
		if (isDataPath(filePath) || isScriptPath(filePath) || isExemptFile(filePath)) return false;
		return isInCodeRoots(filePath);
	}
};
const noSassAtImport = {
	id: "noSassAtImport",
	name: "No SASS @import Deprecated Directive",
	category: "SASS Migrator",
	regex: /@import\s+(?:url\(\s*['"]?([^'")\s]+)['"]?\s*\)|['"]([^'"]+)['"])\s*;?/g,
	message: (match) => `Deprecated '@import' directive detected in Sass: '${match}'. Dart Sass requires migrating to '@use' or '@forward'.`,
	severity: "error",
	fixable: true,
	fix: (match) => {
		const urlMatch = /@import\s+(?:url\(\s*['"]?([^'")\s]+)['"]?\s*\)|['"]([^'"]+)['"])\s*;?/.exec(match);
		const rawTarget = (urlMatch?.[1] ?? urlMatch?.[2] ?? "").trim();
		if (!rawTarget) return match;
		return `@use '${rawTarget.replace(/\.css$/i, ".scss")}' as *;`;
	},
	check: (content, match, filePath) => {
		const target = (match[1] ?? match[2] ?? "").trim();
		if (/^(?:https?:|\/\/|data:)/i.test(target)) return false;
		if (!filePath) return true;
		const norm = normalizeFilePath(filePath);
		if (norm.endsWith(".scss") || norm.endsWith(".css")) return true;
		if (norm.endsWith(".vue")) return parseVueSfcBlocks(content).styles.some((st) => st.lang === "scss" || st.lang === "sass");
		return false;
	}
};
const auditRulesConfig = {
	viewport,
	hardcodedTimezone,
	nodePrefix,
	esmExtensions,
	timersPromises,
	explicitResource,
	zeroTimerLogic,
	jsonStringifyInWatch,
	intersectionObserverRoot,
	functionCallsInTemplates,
	forbiddenFallbacks,
	noDomainIdFallbacks,
	noInlineTypeImports,
	noRawJsonImportsOutsideData,
	noSassAtImport
};
for (const [key, rule] of Object.entries(auditRulesConfig)) {
	const r = rule;
	if (!r.id) r.id = key;
	if (!r.name) r.name = key.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase());
	if (!r.aliases) {
		const keyParts = key.split(/(?=[A-Z])/).map((s) => s.toLowerCase());
		r.aliases = [key.toLowerCase(), ...keyParts];
	}
}
export { AUDIT_SEVERITIES, CANONICAL_DEFAULT_Z_LAYERS, DEFAULT_ALLOWED_NUMERIC_CONSTANT_PREFIXES, FALLOW_SUITE_DESCRIPTORS, SASS_MIGRATOR_DESCRIPTOR, Z_INDEX_CONSISTENCY_DESCRIPTOR, Z_LAYERS, Z_SORTED_ENTRIES, Z_VALUE_MAP, auditRulesConfig, badConstantNames, esmExtensions, explicitResource, forbiddenFallbacks, forbiddenTypeCasts, functionCallsInTemplates, getDomainIdFallbackRegex, getLineAtMatch, hardcodedTimezone, intersectionObserverRoot, isAllowedDatabaseFile, isAuditableCodeFile, isCommentLine, isConstantNameExemptFromNumericSuffixCheck, isDomainAuditTarget, isTestOrNodeModules, jsonStringifyInWatch, legacyDates, matchesRule, noAliasConstants, noDomainIdFallbacks, noFloatingPromises, noInlineAnonymousObjectType, noInlineLiteralUnions, noInlineTypeImports, noLeakedGlobalState, noLiteralBooleanType, noLiteralSuffixInConstantName, noRawJsonImportsOutsideData, noSassAtImport, nodePrefix, normalizeFilePath, resolveZLayer, strictDomainParamTypes, timersPromises, tsIgnore, viewport, zIndexAudit, zIndexConstantDeclaration, zeroTimerLogic };
