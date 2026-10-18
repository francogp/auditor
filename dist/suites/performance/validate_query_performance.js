import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isPathExempt, normalizePosixPath } from "../../core/reportUtils.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { BaseAuditor, FileScanAuditor, LIGHT_RULE_CAPABILITIES, createUniformRemediationPhases, createUniformRuleCapabilities } from "../../core/auditorBase.js";
import "../../core/safePath.js";
import { enableCompileCache } from "node:module";
//#region src/suites/performance/validate_query_performance.ts
enableCompileCache();
const QUERY_PERFORMANCE_RULES = [
	"unindexed-foreign-keys",
	"select-star-in-queries",
	"unpaginated-queries",
	"n-plus-one-patterns",
	"heavy-count-queries",
	"unindexed-order-by"
];
const SCANNABLE_EXTS = /* @__PURE__ */ new Set([
	".ts",
	".js",
	".sql"
]);
var ValidateQueryPerformanceAuditor = class extends FileScanAuditor {
	exemptSelectStarPaths;
	migrationsDir;
	excludeMigrationsDir;
	constructor(options = {}) {
		const effectiveRoot = options.projectRoot ?? process.cwd();
		const config = getAuditConfig(effectiveRoot);
		const excludeMigrations = config.queryPerformance?.excludeMigrationsDir !== false;
		const migrationsDir = config.paths?.migrationsDir;
		const migrationRoots = !excludeMigrations && migrationsDir ? [migrationsDir] : [];
		const targetRoots = options.roots ?? [...config.paths?.srcRoots ?? [], ...migrationRoots];
		super({
			usesThirdPartyTool: false,
			id: "validate_query_performance",
			name: "Database Query & Index Performance Validator",
			description: "Rendimiento de consultas SQL, índices y paginación",
			family: "performance",
			packageName: "DBQuery",
			icon: "⚡",
			configKey: "queryPerformance.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			roots: targetRoots,
			allowedExtensions: SCANNABLE_EXTS,
			ruleIds: QUERY_PERFORMANCE_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(QUERY_PERFORMANCE_RULES, "behavior"),
			ruleDescriptions: {
				"unindexed-foreign-keys": "Clave foránea sin índice secundario",
				"select-star-in-queries": "SELECT * en repositorio o servicio",
				"unpaginated-queries": "Consulta sin LIMIT ni paginación",
				"n-plus-one-patterns": "Consulta a base de datos en bucle",
				"heavy-count-queries": "SELECT COUNT(*) sin filtro en tabla",
				"unindexed-order-by": "Paginación con OFFSET alto"
			},
			ruleRemediations: {
				"unindexed-foreign-keys": "📖 GUÍA DE REMEDIACIÓN: unindexed-foreign-keys\n1. Causa Raíz: Se declaró una clave foránea (Foreign Key) en una tabla SQL sin crear un índice complementario en la columna hija. En PostgreSQL y SQLite, las claves foráneas no indexadas provocan escaneos secuenciales completos de tabla (Seq Scans) durante JOINs y eliminaciones en cascada.\n2. Diagnóstico: Ubica la definición de clave foránea en la migración SQL reportada.\n3. Solución Canónica: Añade una instrucción `CREATE INDEX idx_tabla_columna ON tabla(columna_fk);`.\n4. Ejemplo:\n   - SQL: `CREATE INDEX idx_orders_user_id ON orders(user_id);`",
				"select-star-in-queries": "📖 GUÍA DE REMEDIACIÓN: select-star-in-queries\n1. Causa Raíz: Se ejecutó `SELECT *` en un repositorio o servicio de datos. `SELECT *` transfiere columnas innecesarias por red, rompe la cobertura de índices de solo índice (Index-Only Scans) y genera fragilidad si el esquema añade campos grandes (JSONB, TEXT).\n2. Diagnóstico: Revisa la consulta SQL o llamada a Supabase en la línea señalada.\n3. Solución Canónica: Enumera explícitamente solo las columnas que consume el llamador (`SELECT id, name, email FROM ...`).\n4. Ejemplo:\n   ❌ Ineficiente: `SELECT * FROM users WHERE active = true;`\n   ✅ Óptimo:      `SELECT id, email FROM users WHERE active = true;`",
				"unpaginated-queries": "📖 GUÍA DE REMEDIACIÓN: unpaginated-queries\n1. Causa Raíz: Se realizó una consulta `SELECT` sobre una tabla de entidad potencialmente ilimitada sin cláusula `LIMIT` ni paginación por cursor. A medida que la tabla crece, agota la memoria del proceso y satura la red.\n2. Diagnóstico: Ubica la consulta a colección sin límite en el repositorio.\n3. Solución Canónica: Añade `LIMIT :pageSize` con paginación por cursor (keyset) o acota la consulta a un rango fijo seguro.\n4. Ejemplo:\n   ❌ Sin límite: `SELECT id, title FROM posts;`\n   ✅ Paginado:   `SELECT id, title FROM posts ORDER BY id DESC LIMIT 50;`",
				"n-plus-one-patterns": "📖 GUÍA DE REMEDIACIÓN: n-plus-one-patterns\n1. Causa Raíz: Se detectó una llamada a consulta de base de datos (`query()`, `select()`, `find()`) dentro del cuerpo de un bucle (`for`, `while`, `map()`). Esto dispara 1 consulta inicial + N consultas hijas (problema N+1), saturando el pool de conexiones.\n2. Diagnóstico: Comprueba el bucle reportado y la llamada a persistencia interior.\n3. Solución Canónica:\n   a) Extrae los IDs de la colección y realiza una única consulta con `WHERE id IN (...)` o `IN (:...ids)`.\n   b) O utiliza un `JOIN` relacional en la consulta principal.\n4. Ejemplo:\n   ❌ Patrón N+1: `for (const u of users) { const orders = await getOrders(u.id); }`\n   ✅ Batch:      `const orders = await getOrdersByUserIds(users.map(u => u.id));`",
				"heavy-count-queries": "📖 GUÍA DE REMEDIACIÓN: heavy-count-queries\n1. Causa Raíz: Se ejecutó `SELECT COUNT(*)` sin filtros en tablas grandes. En PostgreSQL, `COUNT(*)` requiere un escaneo completo de visibilidad MVCC, lo que bloquea recursos de CPU y disco.\n2. Diagnóstico: Examina la consulta `COUNT(*)` reportada.\n3. Solución Canónica:\n   a) Para contadores aproximados en dashboards o UI administrativa, consulta estadísticas del catálogo (`reltuples` en PostgreSQL).\n   b) Si solo necesitas saber si existe al menos un registro, usa `SELECT EXISTS(...)` en lugar de contar.\n4. Ejemplo:\n   ❌ Pesado: `SELECT COUNT(*) FROM audit_logs;`\n   ✅ Ligero: `SELECT EXISTS(SELECT 1 FROM audit_logs WHERE user_id = :id);`",
				"unindexed-order-by": "📖 GUÍA DE REMEDIACIÓN: unindexed-order-by\n1. Causa Raíz: Se utilizó paginación con `OFFSET` elevado (ej: `OFFSET 10000`). La base de datos debe escanear y descartar todas las filas previas antes de retornar la página solicitada.\n2. Diagnóstico: Revisa la consulta con `OFFSET` en la línea reportada.\n3. Solución Canónica: Reemplaza la paginación basada en OFFSET por paginación basada en cursor/keyset (`WHERE id < :lastSeenId ORDER BY id DESC LIMIT :limit`).\n4. Ejemplo:\n   ❌ Lento:   `SELECT * FROM items ORDER BY created_at DESC OFFSET 5000 LIMIT 20;`\n   ✅ Keyset: `SELECT * FROM items WHERE created_at < :lastSeen ORDER BY created_at DESC LIMIT 20;`"
			},
			ruleCapabilities: createUniformRuleCapabilities(QUERY_PERFORMANCE_RULES, LIGHT_RULE_CAPABILITIES),
			projectRoot: effectiveRoot,
			coverage: deriveCoverageFromRoots(targetRoots, SCANNABLE_EXTS, effectiveRoot),
			exemptPaths: config.queryPerformance?.exemptPaths
		});
		this.exemptSelectStarPaths = config.queryPerformance?.exemptSelectStarPaths ?? [];
		this.migrationsDir = migrationsDir ? normalizePosixPath(migrationsDir) : void 0;
		this.excludeMigrationsDir = excludeMigrations;
	}
	async runAudit() {
		if (this.isSuiteGatingDisabled("Rendimiento de consultas desactivado en config")) return;
		if (getAuditConfig(this.projectRoot).persistence?.engine === "none") {
			this.markSkipped("Persistencia configurada en none");
			for (const ruleId of this.ruleIds) this.runSubAuditorSync(ruleId, () => {
				this.markRuleNotApplicable(ruleId, "Persistencia configurada en none; no aplica análisis de base de datos");
			});
			return;
		}
		await super.runAudit();
	}
	scanFile(relPath, content) {
		this.runSubAuditorSync("unindexed-foreign-keys", () => {
			this.auditUnindexedForeignKeys(relPath, content);
		});
		this.runSubAuditorSync("select-star-in-queries", () => {
			this.auditSelectStarInQueries(relPath, content);
		});
		this.runSubAuditorSync("unpaginated-queries", () => {
			this.auditUnpaginatedQueries(relPath, content);
		});
		this.runSubAuditorSync("n-plus-one-patterns", () => {
			this.auditNPlusOnePatterns(relPath, content);
		});
		this.runSubAuditorSync("heavy-count-queries", () => {
			this.auditHeavyCountQueries(relPath, content);
		});
		this.runSubAuditorSync("unindexed-order-by", () => {
			this.auditUnindexedOrderBy(relPath, content);
		});
	}
	auditUnindexedForeignKeys(relPath, content) {
		if (content.includes("fk-index-ok")) return;
		if (!relPath.endsWith(".sql")) return;
		const fkInlineRegex = /(\w+)\s+[\w()]+\s+REFERENCES\s+(\w+)\s*\((\w+)\)/gi;
		let match;
		while ((match = fkInlineRegex.exec(content)) !== null) {
			const col = match[1];
			if (!new RegExp(`CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+[^;]*\\([^)]*\\b${col}\\b[^)]*\\)`, "i").test(content)) {
				const line = this.getLineNumber(content, match.index);
				this.addViolation({
					ruleId: "unindexed-foreign-keys",
					severity: "error",
					message: `Clave foránea en columna '${col}' sin índice secundario complementario`,
					file: relPath,
					line
				});
			}
		}
	}
	auditSelectStarInQueries(relPath, content) {
		if (content.includes("select-star-ok")) return;
		if (isPathExempt(relPath, this.exemptSelectStarPaths)) return;
		if (this.excludeMigrationsDir && this.migrationsDir) {
			const norm = normalizePosixPath(relPath);
			if (norm === this.migrationsDir || norm.startsWith(`${this.migrationsDir}/`)) return;
		}
		if (relPath.endsWith(".sql")) {
			const sqlSelectStarRegex = /\bSELECT\s+\*\s+FROM\b/gi;
			let match;
			while ((match = sqlSelectStarRegex.exec(content)) !== null) {
				const line = this.getLineNumber(content, match.index);
				this.addViolation({
					ruleId: "select-star-in-queries",
					severity: "error",
					message: "Uso de SELECT * en consulta SQL; proyectar columnas específicas",
					file: relPath,
					line
				});
			}
		} else {
			const ormSelectStarRegex = /\.select\(\s*['"]\*\s*['"]\s*\)/g;
			let match;
			while ((match = ormSelectStarRegex.exec(content)) !== null) {
				const line = this.getLineNumber(content, match.index);
				this.addViolation({
					ruleId: "select-star-in-queries",
					severity: "error",
					message: "Uso de .select('*') en consulta ORM; proyectar columnas requeridas",
					file: relPath,
					line
				});
			}
		}
	}
	auditUnpaginatedQueries(relPath, content) {
		if (content.includes("unpaginated-ok")) return;
		if (relPath.endsWith(".sql")) return;
		const queryRegex = /(?:db|supabase)\.from\(['"][^'"]+['"]\)\.select\([^)]*\)/g;
		let match;
		while ((match = queryRegex.exec(content)) !== null) {
			const statementEnd = content.indexOf(";", match.index);
			const limitIdx = statementEnd !== -1 ? Math.min(statementEnd, match.index + 250) : match.index + 250;
			const chainSlice = content.slice(match.index, limitIdx);
			if (!/\.(?:limit|range|single|maybeSingle|head|csv)\b/.test(chainSlice)) {
				const line = this.getLineNumber(content, match.index);
				this.addViolation({
					ruleId: "unpaginated-queries",
					severity: "error",
					message: "Consulta a colección de base de datos sin límite (.limit), rango (.range) o selector único (.single)",
					file: relPath,
					line
				});
			}
		}
	}
	auditNPlusOnePatterns(relPath, content) {
		if (content.includes("n-plus-one-ok")) return;
		if (relPath.endsWith(".sql")) return;
		const loopRegex = /(?:for\s*\([^)]*\)|while\s*\([^)]*\)|\.forEach\s*\([^)]*\))\s*\{([^}]*)\}/g;
		let match;
		while ((match = loopRegex.exec(content)) !== null) {
			const loopBody = match[1] ?? "";
			if (/await\s+(?:db|supabase)\.|\.query\(|\.findFirst\(|\.findUnique\(/i.test(loopBody)) {
				const line = this.getLineNumber(content, match.index);
				this.addViolation({
					ruleId: "n-plus-one-patterns",
					severity: "error",
					message: "Llamada asíncrona a base de datos dentro de bucle iterativo (patrón N+1)",
					file: relPath,
					line
				});
			}
		}
	}
	auditHeavyCountQueries(relPath, content) {
		if (content.includes("count-ok")) return;
		const countAllRegex = /SELECT\s+COUNT\(\*\)\s+FROM\s+\w+(?!\s+WHERE\b)/gi;
		let match;
		while ((match = countAllRegex.exec(content)) !== null) {
			const line = this.getLineNumber(content, match.index);
			this.addViolation({
				ruleId: "heavy-count-queries",
				severity: "error",
				message: "SELECT COUNT(*) masivo sin cláusula WHERE en tabla completa",
				file: relPath,
				line
			});
		}
	}
	auditUnindexedOrderBy(relPath, content) {
		if (content.includes("offset-ok")) return;
		const offsetRegex = /\bOFFSET\s+(\d{3,})\b/gi;
		let match;
		while ((match = offsetRegex.exec(content)) !== null) {
			const offsetVal = parseInt(match[1], 10);
			if (offsetVal >= 100) {
				const line = this.getLineNumber(content, match.index);
				this.addViolation({
					ruleId: "unindexed-order-by",
					severity: "error",
					message: `Paginación por OFFSET masivo (${offsetVal}); migrar a paginación por cursor`,
					file: relPath,
					line
				});
			}
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateQueryPerformanceAuditor());
//#endregion
export { QUERY_PERFORMANCE_RULES, ValidateQueryPerformanceAuditor };
