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
import { normalizePosixPath, isPathExempt } from '../../core/safePath.ts';

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
      id: 'validate_query_performance',
      name: 'Database Query & Index Performance Validator',
      description: 'Rendimiento de consultas SQL, índices y paginación',
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
        'unindexed-foreign-keys': 'Clave foránea sin índice secundario',
        'select-star-in-queries': 'SELECT * en repositorio o servicio',
        'unpaginated-queries': 'Consulta sin LIMIT ni paginación',
        'n-plus-one-patterns': 'Consulta a base de datos en bucle',
        'heavy-count-queries': 'SELECT COUNT(*) sin filtro en tabla',
        'unindexed-order-by': 'Paginación con OFFSET alto'
      },
      ruleRemediations: {
        'unindexed-foreign-keys':
          '📖 GUÍA DE REMEDIACIÓN: unindexed-foreign-keys\n' +
          '1. Causa Raíz: Se declaró una clave foránea (Foreign Key) en una tabla SQL sin crear un índice complementario en la columna hija. En PostgreSQL y SQLite, las claves foráneas no indexadas provocan escaneos secuenciales completos de tabla (Seq Scans) durante JOINs y eliminaciones en cascada.\n' +
          '2. Diagnóstico: Ubica la definición de clave foránea en la migración SQL reportada.\n' +
          '3. Solución Canónica: Añade una instrucción `CREATE INDEX idx_tabla_columna ON tabla(columna_fk);`.\n' +
          '4. Ejemplo:\n' +
          '   - SQL: `CREATE INDEX idx_orders_user_id ON orders(user_id);`',
        'select-star-in-queries':
          '📖 GUÍA DE REMEDIACIÓN: select-star-in-queries\n' +
          '1. Causa Raíz: Se ejecutó `SELECT *` en un repositorio o servicio de datos. `SELECT *` transfiere columnas innecesarias por red, rompe la cobertura de índices de solo índice (Index-Only Scans) y genera fragilidad si el esquema añade campos grandes (JSONB, TEXT).\n' +
          '2. Diagnóstico: Revisa la consulta SQL o llamada a Supabase en la línea señalada.\n' +
          '3. Solución Canónica: Enumera explícitamente solo las columnas que consume el llamador (`SELECT id, name, email FROM ...`).\n' +
          '4. Ejemplo:\n' +
          '   ❌ Ineficiente: `SELECT * FROM users WHERE active = true;`\n' +
          '   ✅ Óptimo:      `SELECT id, email FROM users WHERE active = true;`',
        'unpaginated-queries':
          '📖 GUÍA DE REMEDIACIÓN: unpaginated-queries\n' +
          '1. Causa Raíz: Se realizó una consulta `SELECT` sobre una tabla de entidad potencialmente ilimitada sin cláusula `LIMIT` ni paginación por cursor. A medida que la tabla crece, agota la memoria del proceso y satura la red.\n' +
          '2. Diagnóstico: Ubica la consulta a colección sin límite en el repositorio.\n' +
          '3. Solución Canónica: Añade `LIMIT :pageSize` con paginación por cursor (keyset) o acota la consulta a un rango fijo seguro.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Sin límite: `SELECT id, title FROM posts;`\n' +
          '   ✅ Paginado:   `SELECT id, title FROM posts ORDER BY id DESC LIMIT 50;`',
        'n-plus-one-patterns':
          '📖 GUÍA DE REMEDIACIÓN: n-plus-one-patterns\n' +
          '1. Causa Raíz: Se detectó una llamada a consulta de base de datos (`query()`, `select()`, `find()`) dentro del cuerpo de un bucle (`for`, `while`, `map()`). Esto dispara 1 consulta inicial + N consultas hijas (problema N+1), saturando el pool de conexiones.\n' +
          '2. Diagnóstico: Comprueba el bucle reportado y la llamada a persistencia interior.\n' +
          '3. Solución Canónica:\n' +
          '   a) Extrae los IDs de la colección y realiza una única consulta con `WHERE id IN (...)` o `IN (:...ids)`.\n' +
          '   b) O utiliza un `JOIN` relacional en la consulta principal.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Patrón N+1: `for (const u of users) { const orders = await getOrders(u.id); }`\n' +
          '   ✅ Batch:      `const orders = await getOrdersByUserIds(users.map(u => u.id));`',
        'heavy-count-queries':
          '📖 GUÍA DE REMEDIACIÓN: heavy-count-queries\n' +
          '1. Causa Raíz: Se ejecutó `SELECT COUNT(*)` sin filtros en tablas grandes. En PostgreSQL, `COUNT(*)` requiere un escaneo completo de visibilidad MVCC, lo que bloquea recursos de CPU y disco.\n' +
          '2. Diagnóstico: Examina la consulta `COUNT(*)` reportada.\n' +
          '3. Solución Canónica:\n' +
          '   a) Para contadores aproximados en dashboards o UI administrativa, consulta estadísticas del catálogo (`reltuples` en PostgreSQL).\n' +
          '   b) Si solo necesitas saber si existe al menos un registro, usa `SELECT EXISTS(...)` en lugar de contar.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Pesado: `SELECT COUNT(*) FROM audit_logs;`\n' +
          '   ✅ Ligero: `SELECT EXISTS(SELECT 1 FROM audit_logs WHERE user_id = :id);`',
        'unindexed-order-by':
          '📖 GUÍA DE REMEDIACIÓN: unindexed-order-by\n' +
          '1. Causa Raíz: Se utilizó paginación con `OFFSET` elevado (ej: `OFFSET 10000`). La base de datos debe escanear y descartar todas las filas previas antes de retornar la página solicitada.\n' +
          '2. Diagnóstico: Revisa la consulta con `OFFSET` en la línea reportada.\n' +
          '3. Solución Canónica: Reemplaza la paginación basada en OFFSET por paginación basada en cursor/keyset (`WHERE id < :lastSeenId ORDER BY id DESC LIMIT :limit`).\n' +
          '4. Ejemplo:\n' +
          '   ❌ Lento:   `SELECT * FROM items ORDER BY created_at DESC OFFSET 5000 LIMIT 20;`\n' +
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
      this.markSkipped('Persistencia configurada en none');
      for (const ruleId of this.ruleIds) {
        this.runSubAuditorSync(ruleId, () => {
          this.markRuleNotApplicable(
            ruleId,
            'Persistencia configurada en none; no aplica análisis de base de datos'
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
          message: `Clave foránea en columna '${col}' sin índice secundario complementario`,
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
      const norm = normalizePosixPath(relPath);
      if (norm === this.migrationsDir || norm.startsWith(`${this.migrationsDir}/`)) return;
    }

    if (relPath.endsWith('.sql')) {
      const sqlSelectStarRegex = /\bSELECT\s+\*\s+FROM\b/gi;
      let match: RegExpExecArray | null;
      while ((match = sqlSelectStarRegex.exec(content)) !== null) {
        const line = this.getLineNumber(content, match.index);
        this.addViolation({
          ruleId: 'select-star-in-queries',
          severity: 'error',
          message: 'Uso de SELECT * en consulta SQL; proyectar columnas específicas',
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
          message: "Uso de .select('*') en consulta ORM; proyectar columnas requeridas",
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
            'Consulta a colección de base de datos sin límite (.limit), rango (.range) o selector único (.single)',
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
          message: 'Llamada asíncrona a base de datos dentro de bucle iterativo (patrón N+1)',
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
        message: 'SELECT COUNT(*) masivo sin cláusula WHERE en tabla completa',
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
          message: `Paginación por OFFSET masivo (${offsetVal}); migrar a paginación por cursor`,
          file: relPath,
          line
        });
      }
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateQueryPerformanceAuditor());
