import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isPathExempt, normalizePosixPath } from "../../core/reportUtils.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { BaseAuditor, FileScanAuditor, LIGHT_RULE_CAPABILITIES, createUniformRuleCapabilities } from "../../core/auditorBase.js";
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
			ruleDescriptions: {
				"unindexed-foreign-keys": "Clave foránea sin índice secundario",
				"select-star-in-queries": "SELECT * en repositorio o servicio",
				"unpaginated-queries": "Consulta sin LIMIT ni paginación",
				"n-plus-one-patterns": "Consulta a base de datos en bucle",
				"heavy-count-queries": "SELECT COUNT(*) sin filtro en tabla",
				"unindexed-order-by": "Paginación con OFFSET alto"
			},
			ruleRemediations: {
				"unindexed-foreign-keys": "Guía de diagnóstico y remediación para unindexed-foreign-keys. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"select-star-in-queries": "Guía de diagnóstico y remediación para select-star-in-queries. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"unpaginated-queries": "Guía de diagnóstico y remediación para unpaginated-queries. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"n-plus-one-patterns": "Guía de diagnóstico y remediación para n-plus-one-patterns. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"heavy-count-queries": "Guía de diagnóstico y remediación para heavy-count-queries. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"unindexed-order-by": "Guía de diagnóstico y remediación para unindexed-order-by. Revisa la incidencia detectada y ajusta el código correspondiente."
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
