import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import { isTestPath } from "../../core/auditTestPredicates.js";
import { isInCodeRoots, isScriptPath } from "../../core/auditCodeRoots.js";
import { Z_LAYERS } from "../../core/auditZLayers.js";
import { isDataPath, isExemptFile } from "../../core/auditPathPredicates.js";
import "../../core/auditConfig.js";
import "../../core/safePath.js";
import { parseVueSfc as parseVueSfcBlocks } from "../../core/vueSfcParser.js";
import { AUDIT_SEVERITIES, getLineAtMatch, isCommentLine, isTestOrNodeModules, matchesRule, normalizeFilePath } from "../../analyzers/auditRuleTypes.js";
import { DEFAULT_ALLOWED_NUMERIC_CONSTANT_PREFIXES, badConstantNames, isAuditableCodeFile, isConstantNameExemptFromNumericSuffixCheck, noAliasConstants, noLiteralSuffixInConstantName } from "../../analyzers/constantRules.js";
import { CANONICAL_DEFAULT_Z_LAYERS, Z_INDEX_CONSISTENCY_DESCRIPTOR, Z_SORTED_ENTRIES, Z_VALUE_MAP, resolveZLayer, zIndexAudit, zIndexConstantDeclaration } from "../../analyzers/zIndexRules.js";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/architecture/audit_rules.ts
/**
* scripts/maintenance/audit_rules.ts
*
* Centralized audit rules and checkers for the unified audit engine.
*/
const FALLOW_SUITE_DESCRIPTORS = {
	dupes: {
		id: "fallow:dupes",
		name: "Fallow Code Duplication",
		category: "Fallow: Código duplicado",
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
		category: "Fallow: Código triplicado",
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
		category: "Fallow: Vulnerabilidad de seguridad",
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
		category: "Fallow: Archivos huérfanos",
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
		category: "Fallow: Complejidad",
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
	message: (match) => `Unidad legacy detectada: '${match}'. Usa '${match.slice(0, -2)}d${match.slice(-2).toLowerCase()}' para soporte mobile dinámico.`,
	fix: (match) => `${match.slice(0, -2)}d${match.slice(-2).toLowerCase()}`
};
const legacyDates = {
	id: "legacyDates",
	name: "Temporal Migration",
	category: "Uso de Date (Temporal)",
	aliases: [
		"temporal",
		"date",
		"dates",
		"legacy-dates"
	],
	regex: /new Date\(|Date\.now\(\)/g,
	message: "Uso de 'Date' detectado. Usa 'Temporal'.",
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
		return `Timezone hardcodeado detectado: '${match}'. Usa la variable global '${tzVar}'${helperMod ? ` importada desde '${helperMod}'` : ""} para respetar la configuración del servidor.`;
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
	message: "FALLBACK SILENCIOSO EN ID DE DOMINIO / NOMBRE DETECTADO. Queda estrictamente prohibido usar fallbacks silenciosos (como || '', ?? '', o alternar id con name) para identificadores de dominio. Debe usarse una función de validación estricta que lance un error explícito (Fail Loud) si el ID falta o es inválido.",
	severity: "error",
	check: (content, match, filePath) => {
		const config = getAuditConfig();
		if (!isDomainAuditTarget(filePath, config)) return false;
		const { line } = getLineAtMatch(content, match.index ?? 0);
		if (/\/\/\s*(?:text-ok|domain-ok|string-ok|no-domain)/.test(line)) return false;
		const infraWhitelist = config.domain?.infraIdWhitelist ?? [];
		if (infraWhitelist.length > 0) {
			const matchText = match[0] || "";
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
	message: "Import de Node sin prefijo 'node:'.",
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
		if (/\.(?:js|jsx|mjs|cjs)['"]/.test(match)) return `Import relativo con extensión JS legada: '${match}'. Migra a extensión TypeScript explícita (.ts / .tsx).`;
		if (/\.css['"]/.test(match)) return `Import relativo a archivo CSS plano: '${match}'. Migra a SCSS (.scss).`;
		return `Import relativo sin extensión: '${match}'. En Node.js ${RULES_TARGET_NODE_VERSION_LABEL}+ nativo las extensiones son obligatorias.`;
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
	message: "Uso de supresión de TypeScript detectado. Prohibido por la política 'Zero-Ignore'.",
	severity: "error",
	fix: () => "",
	fixable: true
};
const timersPromises = {
	regex: /new Promise\(r => setTimeout\(r, (\d+)\)\)/g,
	message: "Uso de setTimeout manual en script Node. Considera 'import { setTimeout } from \"node:timers/promises\"'.",
	check: (_content, _match, filePath) => !!filePath && isScriptPath(filePath) && !normalizeFilePath(filePath).includes("node_modules"),
	fixable: false
};
const explicitResource = {
	regex: /const (\w+) = (new DatabaseSync|fs\.openSync)/g,
	message: `Recurso detectado sin 'using'. Usa Explicit Resource Management (Node ${RULES_TARGET_NODE_VERSION_LABEL}+).`,
	fix: (match) => match.replace("const", "using"),
	check: (content, match, filePath) => {
		if (!filePath || !isScriptPath(filePath)) return false;
		const { line, trimmed } = getLineAtMatch(content, match.index ?? 0);
		if (isCommentLine(trimmed)) return false;
		if (/\/\/\s*(?:resource-ok|fs-ok):\s*\S+/i.test(line)) return false;
		return true;
	}
};
const zeroTimerLogic = {
	id: "zeroTimerLogic",
	name: "Zero Timer Logic",
	aliases: ["zerotimerlogic"],
	regex: /(?<!\.)\b(sleep)\s*\(/g,
	message: "Uso de 'sleep()' nativo detectado en lógica central. Las funciones de lógica de negocio deben ser 100% deterministas y orientadas a eventos.",
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
	message: "Uso de 'JSON.stringify' dentro de un watcher detectado. Serializar objetos/arrays en watchers de alta frecuencia satura la CPU. Realiza comparaciones directas por elementos o usa watchers profundos ({ deep: true }) con moderación.",
	severity: "error",
	fixable: false
};
const intersectionObserverRoot = {
	regex: /new\s+IntersectionObserver\s*\([^,]+,\s*\{[^}]*root\s*:\s*(?!null\b)[\w$]/g,
	message: "Uso de 'root' dinámico o DOM en IntersectionObserver detectado. En contenedores escalados o con zoom (ej: #zoomable-content), usar un root distinto de null genera fallos de cálculo de visibilidad que apagan animaciones. Deja 'root' como 'null' (viewport) o no lo declares.",
	severity: "warning",
	fixable: false
};
const functionCallsInTemplates = {
	regex: /(?::[a-z0-9-]+|v-bind:[a-z0-9-]+)="([\w$]+)\([^"]*\)"|\{\{\s*([\w$]+)\([^}]*\)\}/gi,
	message: (match) => `Llamada a función/método '${match}' detectada en plantilla Vue. Está PROHIBIDO llamar a funciones que realicen consultas a bases de datos, transformaciones de array (.map/.filter) o lógica pesada en el render loop. Cachea los datos con 'computed'.`,
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
	message: (match) => `Patrón de fallback silencioso o búsqueda prohibida detectado: '${match}'. En (/domain-type-first Zero-Fallback Mandate), está ESTRICTAMENTE PROHIBIDO encadenar fallbacks en IDs de dominio o usar descripciones como fallback de ID. Se debe fallar ruidosamente con throw new Error().`,
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
	message: (match) => `Casteo arbitrario o tipo 'any' prohibido detectado: '${match}'. Viola las directivas de integridad de tipos (/domain-type-first y Regla 7 de AGENTS.md). Define e importa la interfaz o unión de tipos explícita.`,
	severity: "error",
	check: (content, match, filePath) => {
		if (!filePath) return false;
		if (isExemptFile(filePath)) return false;
		if (!isInCodeRoots(filePath)) return false;
		const { line, trimmed } = getLineAtMatch(content, match.index ?? 0);
		if (isCommentLine(trimmed)) return false;
		if (/\/\/\s*(?:type-ok|domain-ok|any-ok):\s*\S+/i.test(line)) return false;
		return true;
	},
	fixable: false
};
function checkTypeScriptRuleMatch(content, match, filePath, extraBypasses = []) {
	if (!filePath) return false;
	const norm = normalizeFilePath(filePath);
	if (!(getAuditConfig()?.paths?.codeRoots ?? []).some((root) => norm.includes(path.posix.relative("/", path.posix.resolve("/", root))))) return false;
	const { line, trimmed } = getLineAtMatch(content, match.index);
	if (isCommentLine(trimmed)) return false;
	if (line.includes("// domain-ok: Open dynamic text or non-domain string payload") || line.includes("// no-domain: Non-domain utility collection or data structure") || extraBypasses.some((b) => line.includes(b))) return false;
	return true;
}
function createTypeScriptRule(config) {
	return {
		regex: config.regex,
		message: config.message,
		severity: "error",
		check: (content, match, filePath) => checkTypeScriptRuleMatch(content, match, filePath, config.bypassAnnotations),
		fixable: config.fixable ?? false,
		...config.fix ? { fix: config.fix } : {}
	};
}
const noLiteralBooleanType = createTypeScriptRule({
	regex: /\b(?:(?:export\s+)?const|let|var)\s+[A-Z_a-z]\w*\s*:\s*(?:true|false)\b|\b(?:export\s+)?type\s+[A-Z_a-z]\w*\s*=\s*(?:true|false)\s*;|^\s*(?:readonly\s+)?[A-Z_a-z]\w*\??:\s*(?:true|false)\s*;|\(\s*[A-Z_a-z]\w*\??:\s*(?:true|false)\b/gm,
	message: (match) => `Tipo de dato booleano literal detectado: '${match.trim()}'. Queda prohibido declarar tipos de datos con literales booleanos (: true / : false) en lugar del tipo de dato canónico 'boolean'. Usa ': boolean'.`,
	bypassAnnotations: ["// boolean-ok: Explicit boolean flag annotation"],
	fixable: true,
	fix: (content) => content.replace(/:\s*(?:true|false)\b/g, ": boolean")
});
const noInlineAnonymousObjectType = createTypeScriptRule({
	regex: /\(\s*(?:[A-Z_a-z]\w*\s*,\s*)*[A-Z_a-z]\w*\??\s*:\s*\{\s*(?:readonly\s+)?[A-Z_a-z]\w*\??\s*:\s*(?:string|number|boolean|unknown|any|[A-Z]\w*)(?:\[\])?\s*(?:;|,)\s*(?:readonly\s+)?[A-Z_a-z]\w*\??\s*:[^\n}]*\}\s*[,)]/g,
	message: (match) => `Tipo de objeto anónimo inline detectado en parámetro: '${match.trim()}'. Está PROHIBIDO usar estructuras de objeto anónimas inline en firmas de función (estilo Java). Define e importa una interface o tipo nombrado (ej. UserPayload).`,
	bypassAnnotations: ["// type-ok: Type contract declaration", "withDefaults"]
});
const noFloatingPromises = createTypeScriptRule({
	regex: /^\s*(?!(?:await|void|return|const|let|var)\s)(?:[A-Z_a-z]\w*\.)?[a-z]\w*Async\s*\([^)]*\)\s*;/gm,
	message: (match) => `Promesa flotante detectada: '${match.trim()}'. Toda llamada a función asíncrona debe ser manejada explícitamente con await, void o .catch().`,
	bypassAnnotations: ["// promise-ok: Background promise handler"],
	fixable: true,
	fix: (content) => content.replace(/^\s*([a-z]\w*Async\s*\([^)]*\)\s*;)/gm, "void $1")
});
const noLeakedGlobalState = createTypeScriptRule({
	regex: /^(?:export\s+)?let\s+[a-z]\w*\s*=/gm,
	message: (match) => `Variable mutable global detectada a nivel de módulo: '${match.trim()}'. Encapsula el estado dentro de un Pinia store, clase o marca // singleton-ok: Singleton instance state container.`,
	bypassAnnotations: ["// singleton-ok:"]
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
	message: (match) => match.includes("|") ? `[TUTORIAL DOMAIN-TYPE-FIRST] Parámetro o propiedad '${match}' combina un tipo de dominio con '| string'.
   📚 REGLA: (/domain-type-first) está ESTRICTAMENTE PROHIBIDO combinar uniones finitas con '| string'.
   💡 SOLUCIÓN: Usa exclusivamente la unión canónica pura.` : `[TUTORIAL DOMAIN-TYPE-FIRST] Parámetro o propiedad '${match}' tipado con 'string' plano.
   📚 REGLA: Los IDs de dominio de catálogo DEBEN ser tipados con su unión canónica de dominio.
   💡 INSTANCIAS vs CATÁLOGO:
      - Si representa una instancia dinámica / UUID (ej. ID generado), nómbralo como '*Uid' (ej. 'targetUid', 'instanceUid') para ser reconocido automáticamente.
      - Si es un UUID o identificador de infraestructura externo no estándar (DOM, WebSocket), debe justificarse explícitamente mediante '// uuid-ok: <motivo técnico>' o '// infra-id-ok: <motivo técnico>'.`,
	severity: "error",
	check: (content, match, filePath) => {
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
		const matchIndex = match.index ?? 0;
		const lineStart = content.lastIndexOf("\n", matchIndex) + 1;
		const lineEnd = content.indexOf("\n", matchIndex);
		const line = content.slice(lineStart, lineEnd === -1 ? void 0 : lineEnd);
		if (/\/\/\s*(?:uuid-ok|infra-id-ok|domain-ok):\s*\S+/i.test(line)) return false;
		return true;
	},
	fixable: false
};
const noInlineTypeImports = {
	id: "noInlineTypeImports",
	name: "No Inline Type Imports",
	regex: /:\s*import\(['"][^'"]+['"]\)\.\w+/g,
	message: (match) => `[TUTORIAL CLEAN IMPORTS] Uso de import de tipo inline '${match}'.
   📚 REGLA: Se prohíbe importar tipos inline en parámetros o propiedades dentro del código fuente (.ts/.vue).
   💡 SOLUCIÓN: Agrega 'import type { ... } from '...'' explícitamente en la cabecera del archivo y usa el nombre del tipo directamente en la firma para mantener legible el código y claro el árbol de dependencias. (Solo archivos ambientales .d.ts están exentos).`,
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
	message: (match) => `[TUTORIAL DOMAIN-TYPE-FIRST] Unión literal de strings inline detectada: '${match.slice(1).trim()}'.
   📚 REGLA: (/domain-type-first) está PROHIBIDO declarar uniones de literales inline ad-hoc dispersas en contratos, componentes o funciones.
   💡 SOLUCIÓN: Centraliza el catálogo en constantes mediante un array 'as const' y deriva el tipo canónico con '(typeof ARRAY)[number]' (ej. 'export const FOOS = [...] as const; export type Foo = (typeof FOOS)[number];').`,
	severity: "error",
	check: (content, match, filePath) => {
		if (!filePath || isTestPath(filePath)) return false;
		const config = getAuditConfig();
		if (!isInCodeRoots(filePath, config) || isExemptFile(filePath, config)) return false;
		const { line } = getLineAtMatch(content, match.index ?? 0);
		if (/\/\/\s*(?:domain-ok|type-ok|string-ok):\s*\S+/i.test(line)) return false;
		return true;
	},
	fixable: false
};
const noRawJsonImportsOutsideData = {
	id: "noRawJsonImportsOutsideData",
	name: "No Raw JSON Import Outside Data Layer",
	category: "Optimización de Bundle",
	regex: /\bimport\s[^;]+\sfrom\s+['"][^'"]+\.json['"]/g,
	message: (match) => `Importación estática de JSON fuera de src/data/ o scripts/: '${match}'. Centraliza catálogos en src/data/ o usa importación dinámica para prevenir empaquetado redundante.`,
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
	message: (match) => `Regla obsoleta '@import' detectada en Sass: '${match}'. Dart Sass requiere migrar a '@use' o '@forward'.`,
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
//#endregion
export { AUDIT_SEVERITIES, CANONICAL_DEFAULT_Z_LAYERS, DEFAULT_ALLOWED_NUMERIC_CONSTANT_PREFIXES, FALLOW_SUITE_DESCRIPTORS, SASS_MIGRATOR_DESCRIPTOR, Z_INDEX_CONSISTENCY_DESCRIPTOR, Z_LAYERS, Z_SORTED_ENTRIES, Z_VALUE_MAP, auditRulesConfig, badConstantNames, esmExtensions, explicitResource, forbiddenFallbacks, forbiddenTypeCasts, functionCallsInTemplates, getDomainIdFallbackRegex, getLineAtMatch, hardcodedTimezone, intersectionObserverRoot, isAllowedDatabaseFile, isAuditableCodeFile, isCommentLine, isConstantNameExemptFromNumericSuffixCheck, isDomainAuditTarget, isTestOrNodeModules, jsonStringifyInWatch, legacyDates, matchesRule, noAliasConstants, noDomainIdFallbacks, noFloatingPromises, noInlineAnonymousObjectType, noInlineLiteralUnions, noInlineTypeImports, noLeakedGlobalState, noLiteralBooleanType, noLiteralSuffixInConstantName, noRawJsonImportsOutsideData, noSassAtImport, nodePrefix, normalizeFilePath, resolveZLayer, strictDomainParamTypes, timersPromises, tsIgnore, viewport, zIndexAudit, zIndexConstantDeclaration, zeroTimerLogic };
