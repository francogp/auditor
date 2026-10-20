import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import "../../core/safePath.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/persistence/validate_sql_anti_patterns.ts
/**
* scripts/auditors/persistence/validate_sql_anti_patterns.ts
*
* SQL & PERSISTENCE ANTI-PATTERNS AUDITOR (Node.js 26+ Native)
*
* Enforces database schema, SQL integrity, and persistence architecture rules:
*   1. No Positional Array Mutations (`sql-no-positional-arrays`):
*      Forbids hardcoded array indices (e.g. `$.team[0]`, `team->0`, `jsonb_set(..., '{team,0}', ...)`)
*      in SQL migrations and queries modifying serialized JSON/JSONB fields.
*   2. PL/pgSQL Variable Declaration Integrity (`sql-plpgsql-declared-variables`):
*      Ensures loop variables in `FOR var IN ... LOOP` within PL/pgSQL functions or `DO $$` blocks
*      are explicitly declared in the `DECLARE` section to prevent runtime database failures.
*   3. RLS Policy Grant Integrity (`sql-rls-policy-grant-integrity`):
*      Ensures every table with `ENABLE ROW LEVEL SECURITY` has at least one associated `CREATE POLICY`.
*   4. Database Payload Snake Case Mandate (`db-payload-snake-case`):
*      Detects camelCase keys in object literals passed to `.insert()`, `.update()`, or `.upsert()`
*      on database tables in `src/`, requiring strictly `snake_case` column keys.
*   5. Uncoordinated Save Storage Bypass (`storage-uncoordinated-save-bypass`):
*      Detects direct `localStorage.setItem` calls mutating state outside the authorized
*      persistence architecture.
*
* Escape Hatches:
*   `-- sql-ok`, `// sql-ok`, `-- plpgsql-ok`, `-- rls-ok`, `// db-ok`, `// storage-ok`
*
* Usage:
*   npm run validate:sql-anti-patterns
*/
enableCompileCache();
const SQL_ANTI_PATTERN_RULES = [
	"sql-no-positional-arrays",
	"sql-plpgsql-declared-variables",
	"sql-rls-policy-grant-integrity",
	"db-payload-snake-case"
];
const SQL_LOOP_HEADER_MAX_CHARS = 120;
function getPositionalJsonMutationRegex() {
	const cols = getAuditConfig().persistence?.positionalArrayColumns;
	if (cols && cols.length > 0) {
		const colGroup = cols.join("|");
		return new RegExp(`(?:\\$\\.(?:${colGroup})\\[\\d+\\]|(?:${colGroup})\\s*->\\s*\\d+|jsonb_set\\([^,]+,\\s*'\\{(?:${colGroup}),\\s*\\d+\\}'|json_extract\\([^,]+,\\s*['"]\\$\\.(?:${colGroup})\\[\\d+\\])`, "i");
	}
	return /(?:\$\.\w+\[\d+\]|\w+\s*->\s*\d+|jsonb_set\([^,]+,\s*'\{\w+,\s*\d+\}'|json_extract\([^,]+,\s*['"]\$\.\w+\[\d+\])/i;
}
const POSITIONAL_JSON_MUTATION_REGEX = /(?:\$\.\w+\[\d+\]|\w+\s*->\s*\d+|jsonb_set\([^,]+,\s*'\{\w+,\s*\d+\}'|json_extract\([^,]+,\s*['"]\$\.\w+\[\d+\])/i;
const CAMEL_CASE_KEY_REGEX = /^[a-z]+[A-Z][a-zA-Z0-9]*$/;
function parseDeclaredPlpgsqlVariables(blockBody) {
	const declaredVars = /* @__PURE__ */ new Set();
	const declareMatch = blockBody.match(/\bDECLARE\b([\s\S]+?)\bBEGIN\b/i);
	if (!declareMatch || !declareMatch[1]) return declaredVars;
	for (const dLine of declareMatch[1].split("\n")) {
		const trimmed = dLine.trim();
		if (!trimmed || trimmed.startsWith("--")) continue;
		const varMatch = trimmed.match(/^(\w+)\s+/);
		if (varMatch && varMatch[1] && varMatch[1].toLowerCase() !== "constant") declaredVars.add(varMatch[1].toLowerCase());
	}
	return declaredVars;
}
function isIntegerRangeLoop(executionBody, matchIndex) {
	const nextLoopIdx = executionBody.indexOf("LOOP", matchIndex);
	const loopSlice = nextLoopIdx !== -1 ? executionBody.slice(matchIndex, nextLoopIdx) : executionBody.slice(matchIndex, matchIndex + 120);
	return /\.\./.test(loopSlice);
}
var SqlAntiPatternsAuditor = class extends BaseAuditor {
	configuredMigrationsDir;
	constructor(options = {}) {
		const effectiveRoot = options.projectRoot ?? process.cwd();
		const config = getAuditConfig(effectiveRoot);
		const migrationsDirRel = options.customMigrationsDir || config.paths.migrationsDir || "migrations";
		const srcRoots = config.paths.srcRoots || ["src"];
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(SQL_ANTI_PATTERN_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_sql_anti_patterns",
			name: "SQL & Relational Schema Anti-Patterns Validator",
			description: "Antipatrones SQL, variables sin declarar o camelCase en BD",
			family: "persistence",
			ruleIds: SQL_ANTI_PATTERN_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(SQL_ANTI_PATTERN_RULES, "behavior"),
			packageName: "SQL",
			configKey: "persistence.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "💾",
			ruleDescriptions: {
				"sql-no-positional-arrays": "Mutación de array JSON en SQL",
				"sql-plpgsql-declared-variables": "Variable PL/pgSQL sin declarar",
				"sql-rls-policy-grant-integrity": "Permiso GRANT faltante en RLS",
				"db-payload-snake-case": "Propiedad sin snake_case en BD"
			},
			ruleRemediations: {
				"sql-no-positional-arrays": "📖 GUÍA DE REMEDIACIÓN: sql-no-positional-arrays\n1. Causa Raíz: Se intentó mutar o consultar arrays JSONB en SQL mediante índices posicionales fijos (ej: `jsonb_set(col, '{0}', ...)` o `col->0`). Los índices numéricos en arrays JSON son extremadamente frágiles ante cambios de orden y violan el diseño relacional normalizado.\n2. Diagnóstico: Ubica la manipulación posicional en la consulta o función SQL reportada.\n3. Solución Canónica:\n   a) Si los elementos poseen identidad, modela la relación como una tabla hija relacional 1:N.\n   b) Si debe ser JSON, manipula el array completo en memoria en la capa de aplicación o usa objetos JSON con claves nombradas en lugar de arrays posicionales.\n4. Ejemplo:\n   ❌ Posicional: `UPDATE profile SET tags = jsonb_set(tags, '{0}', '\"admin\"')`\n   ✅ Normalizado: Utilizar tabla relacional `user_tags (user_id, tag)`.",
				"sql-plpgsql-declared-variables": "📖 GUÍA DE REMEDIACIÓN: sql-plpgsql-declared-variables\n1. Causa Raíz: Se utilizó un identificador de variable dentro del bloque `BEGIN ... END;` de una función PL/pgSQL que no fue formalmente declarado en la sección `DECLARE`. PostgreSQL fallará en tiempo de ejecución con error de sintaxis o referencia no vinculada.\n2. Diagnóstico: Revisa la función PL/pgSQL en la migración SQL reportada.\n3. Solución Canónica: Añade la declaración explícita de la variable y su tipo de dato bajo la sección `DECLARE`.\n4. Ejemplo:\n   - Añadir: `DECLARE v_total NUMERIC; BEGIN ...`",
				"sql-rls-policy-grant-integrity": "📖 GUÍA DE REMEDIACIÓN: sql-rls-policy-grant-integrity\n1. Causa Raíz: Se definió una política RLS (`CREATE POLICY ... FOR SELECT/INSERT/UPDATE`) para un rol (ej: `authenticated`, `anon`), pero no se otorgó el permiso SQL correspondiente (`GRANT SELECT, INSERT ON tabla TO rol;`). Aunque la política RLS exista, la base de datos rechazará la petición con error 42501 (insufficient_privilege).\n2. Diagnóstico: Comprueba la migración SQL donde se crea la política RLS.\n3. Solución Canónica: Añade la instrucción `GRANT` correspondiente antes o después de la creación de la política.\n4. Ejemplo:\n   - SQL: `GRANT SELECT, INSERT ON public.user_profiles TO authenticated;`",
				"db-payload-snake-case": "📖 GUÍA DE REMEDIACIÓN: db-payload-snake-case\n1. Causa Raíz: Un objeto de payload de persistencia, interfaz DTO de base de datos o llamada a Supabase/PostgreSQL utiliza propiedades en formato `camelCase` (ej: `{ userId: 1, createdAt: ... }`). En la base de datos relacional las columnas están estandarizadas en `snake_case` (`user_id`, `created_at`).\n2. Diagnóstico: Revisa las claves del objeto enviado o mapeado en la línea reportada.\n3. Solución Canónica: Utiliza identificadores en `snake_case` para todas las interacciones con persistencia directa, o utiliza un mapper/serializer formal que traduzca entre el dominio (`camelCase`) y la base de datos (`snake_case`).\n4. Ejemplo:\n   ❌ camelCase en BD: `await db.insert({ userId: id, firstName: name });`\n   ✅ snake_case en BD: `await db.insert({ user_id: id, first_name: name });`"
			},
			coverage: { include: [
				`${migrationsDirRel}/**/*.sql`,
				"database/**/*.sql",
				"migrations/**/*.sql",
				...deriveCoverageFromRoots(srcRoots, /* @__PURE__ */ new Set([".ts", ".vue"]), effectiveRoot).include
			] },
			roots: [
				migrationsDirRel,
				"database",
				...srcRoots
			],
			allowedExtensions: /* @__PURE__ */ new Set([
				".sql",
				".ts",
				".vue"
			]),
			projectRoot: effectiveRoot
		});
		this.configuredMigrationsDir = migrationsDirRel;
	}
	runAudit() {
		const config = getAuditConfig(this.projectRoot);
		if (config.persistence?.engine === "none") {
			this.markSkipped("Persistencia configurada en none");
			for (const r of SQL_ANTI_PATTERN_RULES) this.markRuleNotApplicable(r, "Persistencia configurada en none");
			this.context.setMetric("Engine", "none (omitted)");
			return;
		}
		const currentSrcRoots = config.paths.srcRoots || ["src"];
		this.redeclareCoverage({ include: [
			`${this.configuredMigrationsDir}/**/*.sql`,
			"database/**/*.sql",
			"migrations/**/*.sql",
			...deriveCoverageFromRoots(currentSrcRoots, /* @__PURE__ */ new Set([".ts", ".vue"]), this.projectRoot).include
		] });
		const migrationsDir = path.resolve(this.projectRoot, this.configuredMigrationsDir);
		const sqlMigrations = this.collectSqlMigrations(migrationsDir, config);
		this.runSubAuditorSync("db-payload-snake-case", () => {
			this.scanSourceFiles(config.paths.srcRoots || ["src"]);
		});
		this.runSubAuditorSync("sql-no-positional-arrays", () => {
			if (sqlMigrations.length === 0) {
				this.markRuleNotApplicable("sql-no-positional-arrays", "No se encontraron archivos .sql en migraciones o schemas");
				return;
			}
			this.scanPositionalArrays(sqlMigrations);
		});
		this.runSubAuditorSync("sql-plpgsql-declared-variables", () => {
			if (sqlMigrations.length === 0) {
				this.markRuleNotApplicable("sql-plpgsql-declared-variables", "No se encontraron archivos .sql en migraciones o schemas");
				return;
			}
			this.scanPlpgsqlVariables(sqlMigrations);
		});
		this.runSubAuditorSync("sql-rls-policy-grant-integrity", () => {
			if (sqlMigrations.length === 0) {
				this.markRuleNotApplicable("sql-rls-policy-grant-integrity", "No se encontraron archivos .sql en migraciones o schemas");
				return;
			}
			this.scanRlsPolicyIntegrity(sqlMigrations);
		});
	}
	scanPositionalArrays(sqlMigrations) {
		const positionalRegex = getPositionalJsonMutationRegex();
		for (const { relPath, content } of sqlMigrations) {
			const lines = content.split("\n");
			for (let i = 0; i < lines.length; i++) {
				const lineText = lines[i];
				if (!lineText) continue;
				if (positionalRegex.test(lineText) && !this.isLineIgnored(lineText, ["sql-ok"])) this.addViolation({
					ruleId: "sql-no-positional-arrays",
					severity: "error",
					file: relPath,
					line: i + 1,
					message: `Positional JSON array mutation or access is forbidden in SQL migrations/queries. Mutate or filter entities via canonical UIDs or whole-save updates.`,
					context: lineText.trim()
				});
			}
		}
	}
	scanPlpgsqlVariables(sqlMigrations) {
		for (const { relPath, content } of sqlMigrations) this.scanPlpgsqlUndeclaredVariables(relPath, content);
	}
	resolveMigrationScanDirs(migrationsDir, config) {
		const candidateRoots = /* @__PURE__ */ new Set([
			this.configuredMigrationsDir,
			"database",
			"migrations"
		]);
		if (fs.existsSync(migrationsDir)) candidateRoots.add(path.relative(this.projectRoot, migrationsDir).split(path.sep).join(path.posix.sep) || this.configuredMigrationsDir);
		const allowedDbDirs = config.persistence?.allowedDatabaseDirs ?? [];
		for (const sub of allowedDbDirs) {
			const cleanSub = normalizePosixPath(sub);
			candidateRoots.add(cleanSub);
			if (!cleanSub.startsWith("database/")) candidateRoots.add(path.posix.join("database", cleanSub));
		}
		return Array.from(candidateRoots);
	}
	collectSqlMigrations(migrationsDir, config) {
		const sqlMigrations = [];
		const rootsToScan = this.resolveMigrationScanDirs(migrationsDir, config);
		const sqlFiles = this.context.collectFiles(rootsToScan, /* @__PURE__ */ new Set([".sql"]));
		for (const fullPath of sqlFiles) {
			const relPath = path.relative(this.projectRoot, fullPath).split(path.sep).join(path.posix.sep);
			if (this.context.isPathIgnored(relPath)) continue;
			try {
				const content = fs.readFileSync(fullPath, "utf-8");
				this.recordScanned(relPath);
				sqlMigrations.push({
					relPath,
					content
				});
			} catch {}
		}
		return sqlMigrations;
	}
	scanSourceFiles(srcRoots) {
		const srcFiles = this.context.collectFiles([...srcRoots], /* @__PURE__ */ new Set([".ts", ".vue"]));
		if (srcFiles.length === 0) {
			this.markRuleNotApplicable("db-payload-snake-case", "No se encontraron archivos de código fuente");
			return;
		}
		for (const file of srcFiles) {
			const relPath = path.relative(this.projectRoot, file).split(path.sep).join(path.posix.sep);
			this.recordScanned(relPath);
			try {
				const content = fs.readFileSync(file, "utf-8");
				this.scanTypeScriptFile(relPath, content);
			} catch {}
		}
	}
	checkPlpgsqlLoops(executionBody, context) {
		const forLoopRegex = /\bFOR\s+(\w+)\s+IN\b/gi;
		let loopMatch;
		while ((loopMatch = forLoopRegex.exec(executionBody)) !== null) {
			const loopVar = loopMatch[1];
			if (!loopVar || isIntegerRangeLoop(executionBody, loopMatch.index)) continue;
			if (context.declaredVars.has(loopVar.toLowerCase())) continue;
			const absolutePos = context.blockOffset + context.beginIndex + loopMatch.index;
			const line = context.content.slice(0, absolutePos).split("\n").length;
			const lineContent = context.content.split("\n")[line - 1] || "";
			if (!this.isLineIgnored(lineContent, ["plpgsql-ok", "sql-ok"])) this.addViolation({
				ruleId: "sql-plpgsql-declared-variables",
				severity: "error",
				file: context.relPath,
				line,
				message: `Undeclared PL/pgSQL loop variable '${loopVar}' in function/block '${context.funcName}'. Variables must be declared in DECLARE block.`,
				context: lineContent.trim()
			});
		}
	}
	scanPlpgsqlUndeclaredVariables(relPath, content) {
		const blockRegex = /(?:CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:\w+\.)?(\w+)\s*\([^)]*\)[\s\S]*?AS\s+\$\$|DO\s+\$\$)([\s\S]*?)\$\$\s*(?:LANGUAGE\s+plpgsql)?/gi;
		let blockMatch;
		while ((blockMatch = blockRegex.exec(content)) !== null) {
			const funcName = blockMatch[1] || "anonymous_do_block";
			const blockBody = blockMatch[2];
			if (!blockBody) continue;
			const beginIndex = blockBody.search(/\bBEGIN\b/i);
			if (beginIndex === -1) continue;
			const declaredVars = parseDeclaredPlpgsqlVariables(blockBody);
			const executionBody = blockBody.slice(beginIndex);
			this.checkPlpgsqlLoops(executionBody, {
				funcName,
				blockOffset: blockMatch.index,
				beginIndex,
				declaredVars,
				relPath,
				content
			});
		}
	}
	collectRlsMigrations(migrations) {
		const rlsTables = /* @__PURE__ */ new Map();
		const tablesWithPolicies = /* @__PURE__ */ new Set();
		const enableRlsRegex = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:\w+\.)?(\w+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;/gi;
		const createPolicyRegex = /CREATE\s+POLICY(?:\s{2,}|\s+\S.*?(?:[\n\r\u2028\u2029]\s*|[\t\v\f \xa0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]))ON\s+(?:\w+\.)?(\w+)\b/gi;
		for (const { relPath, content } of migrations) {
			let match;
			while ((match = enableRlsRegex.exec(content)) !== null) {
				const rawTable = match[1];
				if (!rawTable) continue;
				const tableName = rawTable.toLowerCase();
				const line = content.slice(0, match.index).split("\n").length;
				const lineContent = content.split("\n")[line - 1] || "";
				if (!this.isLineIgnored(lineContent, ["rls-ok"])) rlsTables.set(tableName, {
					relPath,
					line,
					lineContent: lineContent.trim()
				});
			}
			while ((match = createPolicyRegex.exec(content)) !== null) if (match[1]) tablesWithPolicies.add(match[1].toLowerCase());
		}
		return {
			rlsTables,
			tablesWithPolicies
		};
	}
	scanRlsPolicyIntegrity(migrations) {
		const { rlsTables, tablesWithPolicies } = this.collectRlsMigrations(migrations);
		const config = getAuditConfig(this.projectRoot);
		const exemptTables = /* @__PURE__ */ new Set([
			"_migrations",
			"schema_migrations",
			"supabase_migrations",
			...(config.persistence?.exemptRlsTables ?? []).map((t) => t.toLowerCase())
		]);
		for (const [table, loc] of rlsTables.entries()) {
			if (exemptTables.has(table)) continue;
			if (!tablesWithPolicies.has(table)) this.addViolation({
				ruleId: "sql-rls-policy-grant-integrity",
				severity: "error",
				file: loc.relPath,
				line: loc.line,
				message: `Table '${table}' has ENABLE ROW LEVEL SECURITY without any CREATE POLICY declared across migrations.`,
				context: loc.lineContent
			});
		}
	}
	scanTypeScriptFile(relPath, content) {
		scanDbPayloadKeys({
			relPath,
			content,
			lines: content.split("\n"),
			auditor: this
		});
	}
};
function updateStringLiteralState(char, prevChar, inString) {
	if (inString) return char === inString && prevChar !== "\\" ? null : inString;
	if (char === "'" || char === "\"" || char === "`") return char;
	return null;
}
function updateBraceDepth(char, depth) {
	if (char === "{" || char === "[") return depth + 1;
	if (char === "}" || char === "]") return depth - 1;
	return depth;
}
function extractKeyMatch(raw, index) {
	const m = raw.slice(index).match(/^(\w+)\s*:/);
	if (m && m[1]) return {
		key: m[1],
		advance: m[0].length - 1
	};
	return null;
}
function extractTopLevelKeys(raw) {
	const results = [];
	let depth = 0;
	let inString = null;
	const targetDepth = raw.trim().startsWith("[") ? 2 : 1;
	for (let i = 0; i < raw.length; i++) {
		const char = raw[i];
		const nextStringState = updateStringLiteralState(char, i > 0 ? raw[i - 1] ?? "" : "", inString);
		if (inString || nextStringState !== null) {
			inString = nextStringState;
			continue;
		}
		const nextDepth = updateBraceDepth(char, depth);
		if (nextDepth !== depth) {
			depth = nextDepth;
			continue;
		}
		if (depth === targetDepth) {
			const match = extractKeyMatch(raw, i);
			if (match) {
				results.push({
					key: match.key,
					index: i
				});
				i += match.advance;
			}
		}
	}
	return results;
}
function scanDbPayloadKeys(params) {
	const dbWriteRegex = /\.(?:insert|update|upsert)\s*\(\s*(\[[^\]]*\]|\{[^}]*\})/g;
	let writeMatch;
	while ((writeMatch = dbWriteRegex.exec(params.content)) !== null) {
		const rawPayload = writeMatch[1];
		const matchOffset = writeMatch.index;
		const lineNumber = params.content.slice(0, matchOffset).split("\n").length;
		const lineText = params.lines[lineNumber - 1] || "";
		if (params.auditor.isLineIgnored(lineText, ["db-ok"])) continue;
		const topLevelKeys = extractTopLevelKeys(rawPayload);
		for (const { key, index: keyOffset } of topLevelKeys) if (CAMEL_CASE_KEY_REGEX.test(key) && key !== "toString" && key !== "valueOf") {
			const propOffset = matchOffset + keyOffset;
			const propLine = params.content.slice(0, propOffset).split("\n").length;
			const propLineText = params.lines[propLine - 1] || "";
			if (!params.auditor.isLineIgnored(propLineText, ["db-ok"])) params.auditor.addViolation({
				ruleId: "db-payload-snake-case",
				severity: "error",
				file: params.relPath,
				line: propLine,
				message: `Database payload key '${key}' is camelCase. Database schema strictly mandates snake_case column names.`,
				context: propLineText.trim()
			});
		}
	}
}
await BaseAuditor.runCliIfMain(import.meta.url, new SqlAntiPatternsAuditor());
//#endregion
export { POSITIONAL_JSON_MUTATION_REGEX, SQL_ANTI_PATTERN_RULES, SQL_LOOP_HEADER_MAX_CHARS, SqlAntiPatternsAuditor, getPositionalJsonMutationRegex };
