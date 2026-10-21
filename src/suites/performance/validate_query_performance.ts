import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  FileScanAuditor,
  createUniformRuleCapabilities,
  createUniformRemediationPhases,
  LIGHT_RULE_CAPABILITIES
} from '../../core/auditorBase.ts';
import { deriveCoverageFromRoots } from '../../core/auditCoverage.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { normalizePosixPath, isPathExempt, isPathContained } from '../../core/safePath.ts';

enableCompileCache();

export const QUERY_PERFORMANCE_RULES = [
  'unindexed-foreign-keys',
  'select-star-in-queries',
  'unpaginated-queries',
  'n-plus-one-patterns',
  'heavy-count-queries',
  'unindexed-order-by'
] as const;

export type QueryPerformanceRuleId = (typeof QUERY_PERFORMANCE_RULES)[number];

const SCANNABLE_EXTS = new Set(['.ts', '.js', '.sql']);

export class ValidateQueryPerformanceAuditor extends FileScanAuditor<QueryPerformanceRuleId> {
  private readonly exemptSelectStarPaths: readonly string[];
  private readonly migrationsDir?: string;
  private readonly excludeMigrationsDir: boolean;

  constructor(options: { projectRoot?: string; fix?: boolean; roots?: readonly string[] } = {}) {
    const effectiveRoot = options.projectRoot ?? process.cwd();
    const config = getAuditConfig(effectiveRoot);
    const excludeMigrations = config.queryPerformance?.excludeMigrationsDir !== false;
    const migrationsDir = config.paths?.migrationsDir;
    const migrationRoots = !excludeMigrations && migrationsDir ? [migrationsDir] : [];
    const targetRoots = options.roots ?? [...(config.paths?.srcRoots ?? []), ...migrationRoots];
    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      id: 'validate_query_performance',
      name: 'Database Query & Index Performance Validator',
      description: 'SQL query performance, indexes, and pagination',
      family: 'performance',
      packageName: 'DBQuery',
      icon: '⚡',
      configKey: 'queryPerformance.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      roots: targetRoots,
      allowedExtensions: SCANNABLE_EXTS,
      ruleIds: QUERY_PERFORMANCE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(QUERY_PERFORMANCE_RULES, 'behavior'),
      ruleDescriptions: {
        'unindexed-foreign-keys': 'Foreign key without secondary index',
        'select-star-in-queries': 'SELECT * in repository or service',
        'unpaginated-queries': 'Query without LIMIT or pagination',
        'n-plus-one-patterns': 'Database query inside loop',
        'heavy-count-queries': 'SELECT COUNT(*) without filter',
        'unindexed-order-by': 'Pagination with high OFFSET'
      },
      ruleRemediations: {
        'unindexed-foreign-keys':
          '📖 REMEDIATION GUIDE: unindexed-foreign-keys\n' +
          '1. Root Cause: A foreign key constraint was defined on an SQL table without creating a complementary index on the child column. In PostgreSQL and SQLite, unindexed foreign keys cause full sequential table scans during JOINs and cascade operations.\n' +
          '2. Diagnosis: Locate the foreign key definition in the reported SQL migration.\n' +
          '3. Canonical Solution: Add a `CREATE INDEX idx_table_column ON table(fk_column);` statement.\n' +
          '4. Example / Auto-fix command:\n' +
          '   - SQL: `CREATE INDEX idx_orders_user_id ON orders(user_id);`',
        'select-star-in-queries':
          '📖 REMEDIATION GUIDE: select-star-in-queries\n' +
          '1. Root Cause: `SELECT *` was executed in a repository or data service. `SELECT *` transfers unnecessary columns across the network, breaks index-only scans, and creates fragility when wide columns (JSONB, TEXT) are added.\n' +
          '2. Diagnosis: Review the SQL query or Supabase call at the reported line.\n' +
          '3. Canonical Solution: Explicitly enumerate only the columns consumed by the caller (`SELECT id, name, email FROM ...`).\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Inefficient: `SELECT * FROM users WHERE active = true;`\n' +
          '   ✅ Optimal:     `SELECT id, email FROM users WHERE active = true;`',
        'unpaginated-queries':
          '📖 REMEDIATION GUIDE: unpaginated-queries\n' +
          '1. Root Cause: A `SELECT` query was executed on a potentially unbounded entity table without a `LIMIT` clause or cursor pagination. As tables grow, this exhausts process memory and saturates network bandwidth.\n' +
          '2. Diagnosis: Locate the unbounded collection query in the repository.\n' +
          '3. Canonical Solution: Add `LIMIT :pageSize` with cursor-based (keyset) pagination or bound the query to a safe range.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Unbounded: `SELECT id, title FROM posts;`\n' +
          '   ✅ Paginated: `SELECT id, title FROM posts ORDER BY id DESC LIMIT 50;`',
        'n-plus-one-patterns':
          '📖 REMEDIATION GUIDE: n-plus-one-patterns\n' +
          '1. Root Cause: A database query call (`query()`, `select()`, `find()`) was detected inside a loop body (`for`, `while`, `map()`). This triggers 1 initial query + N child queries (N+1 problem), exhausting the connection pool.\n' +
          '2. Diagnosis: Check the reported loop and the inner persistence call.\n' +
          '3. Canonical Solution:\n' +
          '   a) Extract IDs from the collection and perform a single batch query with `WHERE id IN (...)` or `IN (:...ids)`.\n' +
          '   b) Or use a relational `JOIN` in the main query.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ N+1 Pattern: `for (const u of users) { const orders = await getOrders(u.id); }`\n' +
          '   ✅ Batch:       `const orders = await getOrdersByUserIds(users.map(u => u.id));`',
        'heavy-count-queries':
          '📖 REMEDIATION GUIDE: heavy-count-queries\n' +
          '1. Root Cause: `SELECT COUNT(*)` was executed without filters on large tables. In PostgreSQL, `COUNT(*)` requires a full MVCC visibility scan, locking CPU and disk resources.\n' +
          '2. Diagnosis: Examine the reported `COUNT(*)` query.\n' +
          '3. Canonical Solution:\n' +
          '   a) For approximate counts in dashboards or administrative UI, query catalog statistics (`reltuples` in PostgreSQL).\n' +
          '   b) If checking whether at least one record exists, use `SELECT EXISTS(...)` instead of counting.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Heavy: `SELECT COUNT(*) FROM audit_logs;`\n' +
          '   ✅ Light: `SELECT EXISTS(SELECT 1 FROM audit_logs WHERE user_id = :id);`',
        'unindexed-order-by':
          '📖 REMEDIATION GUIDE: unindexed-order-by\n' +
          '1. Root Cause: Pagination with high `OFFSET` was used (e.g., `OFFSET 10000`). The database engine must scan and discard all preceding rows before returning the requested page.\n' +
          '2. Diagnosis: Review the query using `OFFSET` at the reported line.\n' +
          '3. Canonical Solution: Replace OFFSET-based pagination with cursor/keyset pagination (`WHERE id < :lastSeenId ORDER BY id DESC LIMIT :limit`).\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Slow:   `SELECT * FROM items ORDER BY created_at DESC OFFSET 5000 LIMIT 20;`\n' +
          '   ✅ Keyset: `SELECT * FROM items WHERE created_at < :lastSeen ORDER BY created_at DESC LIMIT 20;`'
      },
      ruleCapabilities: createUniformRuleCapabilities(
        QUERY_PERFORMANCE_RULES,
        LIGHT_RULE_CAPABILITIES
      ),
      projectRoot: effectiveRoot,
      coverage: deriveCoverageFromRoots(targetRoots, SCANNABLE_EXTS, effectiveRoot),
      exemptPaths: config.queryPerformance?.exemptPaths
    });
    this.exemptSelectStarPaths = config.queryPerformance?.exemptSelectStarPaths ?? [];
    this.migrationsDir = migrationsDir ? normalizePosixPath(migrationsDir) : undefined;
    this.excludeMigrationsDir = excludeMigrations;
  }

  public override async runAudit(): Promise<void> {
    if (this.isSuiteGatingDisabled('Rendimiento de consultas desactivado en config')) {
      return;
    }

    const config = getAuditConfig(this.projectRoot);
    if (config.persistence?.engine === 'none') {
      this.markSkipped('Persistence engine configured as none');
      for (const ruleId of this.ruleIds) {
        this.runSubAuditorSync(ruleId, () => {
          this.markRuleNotApplicable(
            ruleId,
            'Persistence engine configured as none; no aplica análisis de base de datos'
          );
        });
      }
      return;
    }

    await super.runAudit();
  }

  protected override scanFile(relPath: string, content: string): void {
    this.runSubAuditorSync('unindexed-foreign-keys', () => {
      this.auditUnindexedForeignKeys(relPath, content);
    });
    this.runSubAuditorSync('select-star-in-queries', () => {
      this.auditSelectStarInQueries(relPath, content);
    });
    this.runSubAuditorSync('unpaginated-queries', () => {
      this.auditUnpaginatedQueries(relPath, content);
    });
    this.runSubAuditorSync('n-plus-one-patterns', () => {
      this.auditNPlusOnePatterns(relPath, content);
    });
    this.runSubAuditorSync('heavy-count-queries', () => {
      this.auditHeavyCountQueries(relPath, content);
    });
    this.runSubAuditorSync('unindexed-order-by', () => {
      this.auditUnindexedOrderBy(relPath, content);
    });
  }

  private auditUnindexedForeignKeys(relPath: string, content: string): void {
    if (content.includes('fk-index-ok')) return;
    if (!relPath.endsWith('.sql')) return;

    // Detect CREATE TABLE with foreign key references
    const fkInlineRegex = /(\w+)\s+[\w()]+\s+REFERENCES\s+(\w+)\s*\((\w+)\)/gi;
    let match: RegExpExecArray | null;
    while ((match = fkInlineRegex.exec(content)) !== null) {
      const col = match[1]!;
      // Check if an index exists for this column in the same file or migration
      const hasIndex = new RegExp(
        `CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+[^;]*\\([^)]*\\b${col}\\b[^)]*\\)`,
        'i'
      ).test(content);
      if (!hasIndex) {
        const line = this.getLineNumber(content, match.index);
        this.addViolation({
          ruleId: 'unindexed-foreign-keys',
          severity: 'error',
          message: `Foreign key in column '${col}' without complementary secondary index`,
          file: relPath,
          line
        });
      }
    }
  }

  private auditSelectStarInQueries(relPath: string, content: string): void {
    if (content.includes('select-star-ok')) return;
    if (isPathExempt(relPath, this.exemptSelectStarPaths)) return;
    if (this.excludeMigrationsDir && this.migrationsDir) {
      if (isPathContained(this.migrationsDir, relPath, this.projectRoot)) return;
    }

    if (relPath.endsWith('.sql')) {
      const sqlSelectStarRegex = /\bSELECT\s+\*\s+FROM\b/gi;
      let match: RegExpExecArray | null;
      while ((match = sqlSelectStarRegex.exec(content)) !== null) {
        const line = this.getLineNumber(content, match.index);
        this.addViolation({
          ruleId: 'select-star-in-queries',
          severity: 'error',
          message: 'SELECT * used in SQL query; project specific columns',
          file: relPath,
          line
        });
      }
    } else {
      const ormSelectStarRegex = /\.select\(\s*['"]\*\s*['"]\s*\)/g;
      let match: RegExpExecArray | null;
      while ((match = ormSelectStarRegex.exec(content)) !== null) {
        const line = this.getLineNumber(content, match.index);
        this.addViolation({
          ruleId: 'select-star-in-queries',
          severity: 'error',
          message: "Use of .select('*') in ORM query; project required columns",
          file: relPath,
          line
        });
      }
    }
  }

  private auditUnpaginatedQueries(relPath: string, content: string): void {
    if (content.includes('unpaginated-ok')) return;
    if (relPath.endsWith('.sql')) return;

    // Detect client/ORM queries returning collection without limit, range, or single-row modifier
    const queryRegex = /(?:db|supabase)\.from\(['"][^'"]+['"]\)\.select\([^)]*\)/g;
    let match: RegExpExecArray | null;
    while ((match = queryRegex.exec(content)) !== null) {
      // Look forward in the chained call expression (up to 200 chars or statement end)
      const statementEnd = content.indexOf(';', match.index);
      const limitIdx =
        statementEnd !== -1 ? Math.min(statementEnd, match.index + 250) : match.index + 250;
      const chainSlice = content.slice(match.index, limitIdx);

      const isConstrained = /\.(?:limit|range|single|maybeSingle|head|csv)\b/.test(chainSlice);
      if (!isConstrained) {
        const line = this.getLineNumber(content, match.index);
        this.addViolation({
          ruleId: 'unpaginated-queries',
          severity: 'error',
          message:
            'Database collection query without limit (.limit), range (.range), or unique selector (.single)',
          file: relPath,
          line
        });
      }
    }
  }

  private auditNPlusOnePatterns(relPath: string, content: string): void {
    if (content.includes('n-plus-one-ok')) return;
    if (relPath.endsWith('.sql')) return;

    // Detect await db or await supabase inside iterative loops
    const loopRegex = /(?:for\s*\([^)]*\)|while\s*\([^)]*\)|\.forEach\s*\([^)]*\))\s*\{([^}]*)\}/g;
    let match: RegExpExecArray | null;
    while ((match = loopRegex.exec(content)) !== null) {
      const loopBody = match[1] ?? '';
      if (/await\s+(?:db|supabase)\.|\.query\(|\.findFirst\(|\.findUnique\(/i.test(loopBody)) {
        const line = this.getLineNumber(content, match.index);
        this.addViolation({
          ruleId: 'n-plus-one-patterns',
          severity: 'error',
          message: 'Asynchronous database call inside iterative loop (N+1 pattern)',
          file: relPath,
          line
        });
      }
    }
  }

  private auditHeavyCountQueries(relPath: string, content: string): void {
    if (content.includes('count-ok')) return;

    // Detect unbounded COUNT(*) without WHERE clause in SQL
    const countAllRegex = /SELECT\s+COUNT\(\*\)\s+FROM\s+\w+(?!\s+WHERE\b)/gi;
    let match: RegExpExecArray | null;
    while ((match = countAllRegex.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      this.addViolation({
        ruleId: 'heavy-count-queries',
        severity: 'error',
        message: 'Massive SELECT COUNT(*) without WHERE clause on entire table',
        file: relPath,
        line
      });
    }
  }

  private auditUnindexedOrderBy(relPath: string, content: string): void {
    if (content.includes('offset-ok')) return;

    // Detect OFFSET >= 1000 in SQL or code
    const offsetRegex = /\bOFFSET\s+(\d{3,})\b/gi;
    let match: RegExpExecArray | null;
    while ((match = offsetRegex.exec(content)) !== null) {
      const offsetVal = parseInt(match[1]!, 10);
      if (offsetVal >= 100) {
        const line = this.getLineNumber(content, match.index);
        this.addViolation({
          ruleId: 'unindexed-order-by',
          severity: 'error',
          message: `Massive OFFSET pagination (${offsetVal}); migrate to cursor-based pagination`,
          file: relPath,
          line
        });
      }
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateQueryPerformanceAuditor());
