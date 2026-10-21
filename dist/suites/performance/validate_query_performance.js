import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isPathExempt, normalizePosixPath } from "../../core/reportUtils.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { isPathContained } from "../../core/safePath.js";
import { BaseAuditor, FileScanAuditor, LIGHT_RULE_CAPABILITIES, createUniformRemediationPhases, createUniformRuleCapabilities } from "../../core/auditorBase.js";
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
			requiredPermissions: [],
			id: "validate_query_performance",
			name: "Database Query & Index Performance Validator",
			description: "SQL query performance, indexes, and pagination",
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
				"unindexed-foreign-keys": "Foreign key without secondary index",
				"select-star-in-queries": "SELECT * in repository or service",
				"unpaginated-queries": "Query without LIMIT or pagination",
				"n-plus-one-patterns": "Database query inside loop",
				"heavy-count-queries": "SELECT COUNT(*) without filter",
				"unindexed-order-by": "Pagination with high OFFSET"
			},
			ruleRemediations: {
				"unindexed-foreign-keys": "📖 REMEDIATION GUIDE: unindexed-foreign-keys\n1. Root Cause: A foreign key constraint was defined on an SQL table without creating a complementary index on the child column. In PostgreSQL and SQLite, unindexed foreign keys cause full sequential table scans during JOINs and cascade operations.\n2. Diagnosis: Locate the foreign key definition in the reported SQL migration.\n3. Canonical Solution: Add a `CREATE INDEX idx_table_column ON table(fk_column);` statement.\n4. Example / Auto-fix command:\n   - SQL: `CREATE INDEX idx_orders_user_id ON orders(user_id);`",
				"select-star-in-queries": "📖 REMEDIATION GUIDE: select-star-in-queries\n1. Root Cause: `SELECT *` was executed in a repository or data service. `SELECT *` transfers unnecessary columns across the network, breaks index-only scans, and creates fragility when wide columns (JSONB, TEXT) are added.\n2. Diagnosis: Review the SQL query or Supabase call at the reported line.\n3. Canonical Solution: Explicitly enumerate only the columns consumed by the caller (`SELECT id, name, email FROM ...`).\n4. Example / Auto-fix command:\n   ❌ Inefficient: `SELECT * FROM users WHERE active = true;`\n   ✅ Optimal:     `SELECT id, email FROM users WHERE active = true;`",
				"unpaginated-queries": "📖 REMEDIATION GUIDE: unpaginated-queries\n1. Root Cause: A `SELECT` query was executed on a potentially unbounded entity table without a `LIMIT` clause or cursor pagination. As tables grow, this exhausts process memory and saturates network bandwidth.\n2. Diagnosis: Locate the unbounded collection query in the repository.\n3. Canonical Solution: Add `LIMIT :pageSize` with cursor-based (keyset) pagination or bound the query to a safe range.\n4. Example / Auto-fix command:\n   ❌ Unbounded: `SELECT id, title FROM posts;`\n   ✅ Paginated: `SELECT id, title FROM posts ORDER BY id DESC LIMIT 50;`",
				"n-plus-one-patterns": "📖 REMEDIATION GUIDE: n-plus-one-patterns\n1. Root Cause: A database query call (`query()`, `select()`, `find()`) was detected inside a loop body (`for`, `while`, `map()`). This triggers 1 initial query + N child queries (N+1 problem), exhausting the connection pool.\n2. Diagnosis: Check the reported loop and the inner persistence call.\n3. Canonical Solution:\n   a) Extract IDs from the collection and perform a single batch query with `WHERE id IN (...)` or `IN (:...ids)`.\n   b) Or use a relational `JOIN` in the main query.\n4. Example / Auto-fix command:\n   ❌ N+1 Pattern: `for (const u of users) { const orders = await getOrders(u.id); }`\n   ✅ Batch:       `const orders = await getOrdersByUserIds(users.map(u => u.id));`",
				"heavy-count-queries": "📖 REMEDIATION GUIDE: heavy-count-queries\n1. Root Cause: `SELECT COUNT(*)` was executed without filters on large tables. In PostgreSQL, `COUNT(*)` requires a full MVCC visibility scan, locking CPU and disk resources.\n2. Diagnosis: Examine the reported `COUNT(*)` query.\n3. Canonical Solution:\n   a) For approximate counts in dashboards or administrative UI, query catalog statistics (`reltuples` in PostgreSQL).\n   b) If checking whether at least one record exists, use `SELECT EXISTS(...)` instead of counting.\n4. Example / Auto-fix command:\n   ❌ Heavy: `SELECT COUNT(*) FROM audit_logs;`\n   ✅ Light: `SELECT EXISTS(SELECT 1 FROM audit_logs WHERE user_id = :id);`",
				"unindexed-order-by": "📖 REMEDIATION GUIDE: unindexed-order-by\n1. Root Cause: Pagination with high `OFFSET` was used (e.g., `OFFSET 10000`). The database engine must scan and discard all preceding rows before returning the requested page.\n2. Diagnosis: Review the query using `OFFSET` at the reported line.\n3. Canonical Solution: Replace OFFSET-based pagination with cursor/keyset pagination (`WHERE id < :lastSeenId ORDER BY id DESC LIMIT :limit`).\n4. Example / Auto-fix command:\n   ❌ Slow:   `SELECT * FROM items ORDER BY created_at DESC OFFSET 5000 LIMIT 20;`\n   ✅ Keyset: `SELECT * FROM items WHERE created_at < :lastSeen ORDER BY created_at DESC LIMIT 20;`"
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
			this.markSkipped("Persistence engine configured as none");
			for (const ruleId of this.ruleIds) this.runSubAuditorSync(ruleId, () => {
				this.markRuleNotApplicable(ruleId, "Persistence engine configured as none; no aplica análisis de base de datos");
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
					message: `Foreign key in column '${col}' without complementary secondary index`,
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
			if (isPathContained(this.migrationsDir, relPath, this.projectRoot)) return;
		}
		if (relPath.endsWith(".sql")) {
			const sqlSelectStarRegex = /\bSELECT\s+\*\s+FROM\b/gi;
			let match;
			while ((match = sqlSelectStarRegex.exec(content)) !== null) {
				const line = this.getLineNumber(content, match.index);
				this.addViolation({
					ruleId: "select-star-in-queries",
					severity: "error",
					message: "SELECT * used in SQL query; project specific columns",
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
					message: "Use of .select('*') in ORM query; project required columns",
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
					message: "Database collection query without limit (.limit), range (.range), or unique selector (.single)",
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
					message: "Asynchronous database call inside iterative loop (N+1 pattern)",
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
				message: "Massive SELECT COUNT(*) without WHERE clause on entire table",
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
					message: `Massive OFFSET pagination (${offsetVal}); migrate to cursor-based pagination`,
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
