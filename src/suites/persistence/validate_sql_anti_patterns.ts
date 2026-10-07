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

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import {
  BaseAuditor
} from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';

enableCompileCache();

export type SqlAntiPatternRuleId =
  | 'sql-no-positional-arrays'
  | 'sql-plpgsql-declared-variables'
  | 'sql-rls-policy-grant-integrity'
  | 'db-payload-snake-case'
  | 'storage-uncoordinated-save-bypass';

export const SQL_ANTI_PATTERN_RULES: readonly SqlAntiPatternRuleId[] = [
  'sql-no-positional-arrays',
  'sql-plpgsql-declared-variables',
  'sql-rls-policy-grant-integrity',
  'db-payload-snake-case',
  'storage-uncoordinated-save-bypass'
] as const;

export function getPositionalJsonMutationRegex(): RegExp {
  const config = getAuditConfig();
  const cols = config.persistence?.positionalArrayColumns;
  if (cols && cols.length > 0) {
    const colGroup = cols.join('|');
    return new RegExp(`(?:\\$\\.(?:${colGroup})\\[\\d+\\]|(?:${colGroup})\\s*->\\s*\\d+|jsonb_set\\([^,]+,\\s*'\\{(?:${colGroup}),\\s*\\d+\\}'|json_extract\\([^,]+,\\s*['"]\\$\\.(?:${colGroup})\\[\\d+\\])`, 'i');
  }
  return /(?:\$\.\w+\[\d+\]|\w+\s*->\s*\d+|jsonb_set\([^,]+,\s*'\{\w+,\s*\d+\}'|json_extract\([^,]+,\s*['"]\$\.\w+\[\d+\])/i;
}

export const POSITIONAL_JSON_MUTATION_REGEX = /(?:\$\.\w+\[\d+\]|\w+\s*->\s*\d+|jsonb_set\([^,]+,\s*'\{\w+,\s*\d+\}'|json_extract\([^,]+,\s*['"]\$\.\w+\[\d+\])/i;
const CAMEL_CASE_KEY_REGEX = /^[a-z]+[A-Z][a-zA-Z0-9]*$/;

function parseDeclaredPlpgsqlVariables(blockBody: string): Set<string> {
  const declaredVars = new Set<string>();
  const declareMatch = blockBody.match(/\bDECLARE\b([\s\S]+?)\bBEGIN\b/i);
  if (!declareMatch || !declareMatch[1]) {
    return declaredVars;
  }
  for (const dLine of declareMatch[1].split('\n')) {
    const trimmed = dLine.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    const varMatch = trimmed.match(/^(\w+)\s+/);
    if (varMatch && varMatch[1] && varMatch[1].toLowerCase() !== 'constant') {
      declaredVars.add(varMatch[1].toLowerCase());
    }
  }
  return declaredVars;
}

function isIntegerRangeLoop(executionBody: string, matchIndex: number): boolean {
  const nextLoopIdx = executionBody.indexOf('LOOP', matchIndex);
  const loopSlice = nextLoopIdx !== -1
    ? executionBody.slice(matchIndex, nextLoopIdx)
    : executionBody.slice(matchIndex, matchIndex + 120);
  return /\.\./.test(loopSlice);
}

export class SqlAntiPatternsAuditor extends BaseAuditor<SqlAntiPatternRuleId> {
private readonly configuredMigrationsDir: string;
  private readonly authorizedSaveFiles: ReadonlySet<string>;
  private readonly saveKeyPrefixes: readonly string[];

  constructor(
    customMigrationsDir?: string,
    projectRoot: string = process.cwd(),
    customSaveKeyPrefixes?: readonly string[]
  ) {
    const config = getAuditConfig(projectRoot);
    const migrationsDirRel = customMigrationsDir || config.paths.migrationsDir || 'migrations';
    const srcRoots = config.paths.srcRoots || ['src'];

    super({
id: 'validate_sql_anti_patterns',
      name: 'SQL & Persistence Anti-Patterns Validator',
      description: 'Antipatrones SQL, variables sin declarar o camelCase',
      family: 'persistence',
      ruleIds: SQL_ANTI_PATTERN_RULES,
      packageName: 'SQL',
      configKey: 'persistence.enabled',
      defaultConfig: { enabled: true },
      icon: '💾',
      ruleDescriptions: {
        'sql-no-positional-arrays': 'Mutación de array JSON en SQL',
        'sql-plpgsql-declared-variables': 'Variable PL/pgSQL sin declarar',
        'sql-rls-policy-grant-integrity': 'Permiso GRANT faltante en RLS',
        'db-payload-snake-case': 'Propiedad sin snake_case en BD',
        'storage-uncoordinated-save-bypass': 'Bypass de persistencia segura'
      },
      coverage: {
        include: [`${migrationsDirRel}/**/*.sql`, 'database/**/*.sql', 'migrations/**/*.sql', 'src/**/*.ts', 'src/**/*.vue']
      },
      roots: [migrationsDirRel, 'database', ...srcRoots],
      allowedExtensions: new Set(['.sql', '.ts', '.vue']),
      projectRoot
    });

    this.configuredMigrationsDir = migrationsDirRel;
    this.authorizedSaveFiles = new Set(config.persistence.authorizedSaveFiles ?? []);
    this.saveKeyPrefixes = customSaveKeyPrefixes ?? config.persistence.saveKeyPrefixes ?? [];
  }

  public override runAudit(): void {
    const config = getAuditConfig(this.projectRoot);
    if (config.persistence?.engine === 'none') {
      this.markSkipped('Persistencia configurada en none');
      for (const r of SQL_ANTI_PATTERN_RULES) {
        this.markRuleNotApplicable(r, 'Persistencia configurada en none');
      }
      this.context.setMetric('Engine', 'none (omitted)');
      return;
    }

    const migrationsDir = path.resolve(this.projectRoot, this.configuredMigrationsDir);
    const sqlMigrations = this.collectAndScanMigrations(migrationsDir, config);
    this.scanSourceFiles(config.paths.srcRoots || ['src']);
    this.scanRlsPolicyIntegrity(sqlMigrations);
  }

  private markSqlRulesNotApplicable(reason: string): void {
    this.markRuleNotApplicable('sql-no-positional-arrays', reason);
    this.markRuleNotApplicable('sql-plpgsql-declared-variables', reason);
    this.markRuleNotApplicable('sql-rls-policy-grant-integrity', reason);
  }

  private resolveMigrationScanDirs(migrationsDir: string, config: ReturnType<typeof getAuditConfig>): Set<string> {
    const dirsToScan = new Set<string>();
    if (fs.existsSync(migrationsDir)) {
      dirsToScan.add(migrationsDir);
    }
    const databaseDir = path.resolve(this.projectRoot, 'database');
    if (fs.existsSync(databaseDir)) {
      const allowedDbDirs = config.persistence?.allowedDatabaseDirs ?? ['migrations', 'schemas'];
      for (const sub of allowedDbDirs) {
        const subPath = path.join(databaseDir, sub);
        if (fs.existsSync(subPath)) {
          dirsToScan.add(subPath);
        }
      }
    }
    return dirsToScan;
  }

  private scanSingleSqlFile(fullPath: string, relPath: string, sqlMigrations: { relPath: string; content: string }[]): void {
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      this.recordScanned(relPath);
      this.markRuleEvaluated('sql-no-positional-arrays');
      this.markRuleEvaluated('sql-plpgsql-declared-variables');
      this.markRuleEvaluated('sql-rls-policy-grant-integrity');
      sqlMigrations.push({ relPath, content });
      this.scanSqlFile(relPath, content);
    } catch {
      // catch-ok: Ignore read errors
    }
  }

  private scanSingleSqlDirectory(dir: string, sqlMigrations: { relPath: string; content: string }[]): void {
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      // catch-ok: Ignore unreadable directory
      return;
    }
    for (const entry of entries) {
      if (!entry.endsWith('.sql')) continue;
      const fullPath = path.join(dir, entry);
      const relPath = path.relative(this.projectRoot, fullPath).split(path.sep).join(path.posix.sep);
      if (this.context.isPathIgnored(relPath)) continue;
      this.scanSingleSqlFile(fullPath, relPath, sqlMigrations);
    }
  }

  private collectAndScanMigrations(migrationsDir: string, config: ReturnType<typeof getAuditConfig>): { relPath: string; content: string }[] {
    const sqlMigrations: { relPath: string; content: string }[] = [];
    const dirsToScan = this.resolveMigrationScanDirs(migrationsDir, config);

    if (dirsToScan.size === 0) {
      this.markSqlRulesNotApplicable('No existe directorio de migraciones o schemas SQL');
      return sqlMigrations;
    }

    for (const dir of dirsToScan) {
      this.scanSingleSqlDirectory(dir, sqlMigrations);
    }

    if (sqlMigrations.length === 0) {
      this.markSqlRulesNotApplicable('No se encontraron archivos .sql en migraciones o schemas');
    }

    return sqlMigrations;
  }

  private scanSourceFiles(srcRoots: readonly string[]): void {
    const srcFiles = this.context.collectFiles([...srcRoots], new Set(['.ts', '.vue']));
    if (srcFiles.length === 0) {
      this.markRuleNotApplicable('db-payload-snake-case', 'No se encontraron archivos de código fuente');
      this.markRuleNotApplicable('storage-uncoordinated-save-bypass', 'No se encontraron archivos de código fuente');
      return;
    }

    for (const file of srcFiles) {
      const relPath = path.relative(this.projectRoot, file).split(path.sep).join(path.posix.sep);
      this.recordScanned(relPath);
      this.markRuleEvaluated('db-payload-snake-case');
      this.markRuleEvaluated('storage-uncoordinated-save-bypass');
      try {
        const content = fs.readFileSync(file, 'utf-8');
        this.scanTypeScriptFile(relPath, content);
      } catch {
        // catch-ok: Ignore read errors
      }
    }
  }

  private scanSqlFile(relPath: string, content: string): void {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      if (!lineText) continue;

      // Rule 1: sql-no-positional-arrays
      const positionalRegex = getPositionalJsonMutationRegex();
      if (positionalRegex.test(lineText) && !this.isLineIgnored(lineText, ['sql-ok'])) {
        this.addViolation({
          ruleId: 'sql-no-positional-arrays',
          severity: 'error',
          file: relPath,
          line: i + 1,
          message: `Positional JSON array mutation or access is forbidden in SQL migrations/queries. Mutate or filter entities via canonical UIDs or whole-save updates.`,
          context: lineText.trim()
        });
      }
    }

    // Rule 2: sql-plpgsql-declared-variables
    this.scanPlpgsqlUndeclaredVariables(relPath, content);
  }

  private checkPlpgsqlLoops(
    executionBody: string,
    context: { funcName: string; blockOffset: number; beginIndex: number; declaredVars: Set<string>; relPath: string; content: string }
  ): void {
    const forLoopRegex = /\bFOR\s+(\w+)\s+IN\b/gi;
    let loopMatch: RegExpExecArray | null;

    while ((loopMatch = forLoopRegex.exec(executionBody)) !== null) {
      const loopVar = loopMatch[1];
      if (!loopVar || isIntegerRangeLoop(executionBody, loopMatch.index)) continue;
      if (context.declaredVars.has(loopVar.toLowerCase())) continue;

      const absolutePos = context.blockOffset + context.beginIndex + loopMatch.index;
      const line = context.content.slice(0, absolutePos).split('\n').length;
      const lineContent = context.content.split('\n')[line - 1] || '';

      if (!this.isLineIgnored(lineContent, ['plpgsql-ok', 'sql-ok'])) {
        this.addViolation({
          ruleId: 'sql-plpgsql-declared-variables',
          severity: 'error',
          file: context.relPath,
          line,
          message: `Undeclared PL/pgSQL loop variable '${loopVar}' in function/block '${context.funcName}'. Variables must be declared in DECLARE block.`,
          context: lineContent.trim()
        });
      }
    }
  }

  private scanPlpgsqlUndeclaredVariables(relPath: string, content: string): void {
    const blockRegex = /(?:CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:\w+\.)?(\w+)\s*\([^)]*\)[\s\S]*?AS\s+\$\$|DO\s+\$\$)([\s\S]*?)\$\$\s*(?:LANGUAGE\s+plpgsql)?/gi;
    let blockMatch: RegExpExecArray | null;

    while ((blockMatch = blockRegex.exec(content)) !== null) {
      const funcName = blockMatch[1] || 'anonymous_do_block';
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

  private collectRlsMigrations(
    migrations: readonly { relPath: string; content: string }[]
  ): { rlsTables: Map<string, { relPath: string; line: number; lineContent: string }>; tablesWithPolicies: Set<string> } {
    const rlsTables = new Map<string, { relPath: string; line: number; lineContent: string }>();
    const tablesWithPolicies = new Set<string>();
    const enableRlsRegex = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:\w+\.)?(\w+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;/gi;
    const createPolicyRegex = /CREATE\s+POLICY(?:\s{2,}|\s+\S.*?(?:[\n\r\u2028\u2029]\s*|[\t\v\f \xa0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]))ON\s+(?:\w+\.)?(\w+)\b/gi;

    for (const { relPath, content } of migrations) {
      let match: RegExpExecArray | null;
      while ((match = enableRlsRegex.exec(content)) !== null) {
        const rawTable = match[1];
        if (!rawTable) continue;
        const tableName = rawTable.toLowerCase();
        const line = content.slice(0, match.index).split('\n').length;
        const lineContent = content.split('\n')[line - 1] || '';
        if (!this.isLineIgnored(lineContent, ['rls-ok'])) {
          rlsTables.set(tableName, { relPath, line, lineContent: lineContent.trim() });
        }
      }

      while ((match = createPolicyRegex.exec(content)) !== null) {
        if (match[1]) {
          tablesWithPolicies.add(match[1].toLowerCase());
        }
      }
    }

    return { rlsTables, tablesWithPolicies };
  }

  private scanRlsPolicyIntegrity(migrations: readonly { relPath: string; content: string }[]): void {
    const { rlsTables, tablesWithPolicies } = this.collectRlsMigrations(migrations);
    const config = getAuditConfig(this.projectRoot);
    const exemptTables = new Set([ // runtime-set: Fast O(1) membership lookup set
      '_migrations',
      'schema_migrations',
      'supabase_migrations',
      ...(config.persistence?.exemptRlsTables ?? []).map(t => t.toLowerCase())
    ]);

    for (const [table, loc] of rlsTables.entries()) {
      if (exemptTables.has(table)) {
        continue;
      }
      if (!tablesWithPolicies.has(table)) {
        this.addViolation({
          ruleId: 'sql-rls-policy-grant-integrity',
          severity: 'error',
          file: loc.relPath,
          line: loc.line,
          message: `Table '${table}' has ENABLE ROW LEVEL SECURITY without any CREATE POLICY declared across migrations.`,
          context: loc.lineContent
        });
      }
    }
  }

  protected scanTypeScriptFile(relPath: string, content: string): void {
    const lines = content.split('\n');

    if (!this.authorizedSaveFiles.has(relPath) && this.saveKeyPrefixes.length > 0) {
      scanUncoordinatedStorageWrites({
        relPath,
        lines,
        saveKeyPrefixes: this.saveKeyPrefixes,
        auditor: this
      });
    }

    scanDbPayloadKeys({
      relPath,
      content,
      lines,
      auditor: this
    });
  }
}

function updateStringLiteralState(char: string, prevChar: string, inString: string | null): string | null {
  if (inString) {
    return (char === inString && prevChar !== '\\') ? null : inString;
  }
  if (char === "'" || char === '"' || char === '`') {
    return char;
  }
  return null;
}

function updateBraceDepth(char: string, depth: number): number {
  if (char === '{' || char === '[') return depth + 1;
  if (char === '}' || char === ']') return depth - 1;
  return depth;
}

function extractKeyMatch(raw: string, index: number): { key: string; advance: number } | null {
  const rest = raw.slice(index);
  const m = rest.match(/^(\w+)\s*:/);
  if (m && m[1]) {
    return { key: m[1], advance: m[0].length - 1 };
  }
  return null;
}

function extractTopLevelKeys(raw: string): { key: string; index: number }[] {
  const results: { key: string; index: number }[] = [];
  let depth = 0;
  let inString: string | null = null;
  const isArrayPayload = raw.trim().startsWith('[');
  const targetDepth = isArrayPayload ? 2 : 1;

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]!;
    const prev = i > 0 ? (raw[i - 1] ?? '') : '';

    const nextStringState = updateStringLiteralState(char, prev, inString);
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
        results.push({ key: match.key, index: i });
        i += match.advance;
      }
    }
  }

  return results;
}

function scanUncoordinatedStorageWrites(params: {
  relPath: string;
  lines: readonly string[];
  saveKeyPrefixes: readonly string[];
  auditor: SqlAntiPatternsAuditor;
}): void {
  for (let i = 0; i < params.lines.length; i++) {
    const lineText = params.lines[i];
    if (!lineText) continue;
    const hasUncoordinatedSave = params.saveKeyPrefixes.some(
      prefix =>
        lineText.includes(`localStorage.setItem('${prefix}`) ||
        lineText.includes(`localStorage.setItem("${prefix}`) ||
        lineText.includes(`localStorage.setItem(\`${prefix}`)
    );
    if (hasUncoordinatedSave && !params.auditor.isLineIgnored(lineText, ['storage-ok'])) {
      params.auditor.addViolation({
        ruleId: 'storage-uncoordinated-save-bypass',
        severity: 'error',
        file: params.relPath,
        line: i + 1,
        message: `Direct localStorage write to state bypasses authorized persistence architecture.`,
        context: lineText.trim()
      });
    }
  }
}

function scanDbPayloadKeys(params: {
  relPath: string;
  content: string;
  lines: readonly string[];
  auditor: SqlAntiPatternsAuditor;
}): void {
  const dbWriteRegex = /\.(?:insert|update|upsert)\s*\(\s*(\[[^\]]*\]|\{[^}]*\})/g;
  let writeMatch: RegExpExecArray | null;

  while ((writeMatch = dbWriteRegex.exec(params.content)) !== null) {
    const rawPayload = writeMatch[1]!;
    const matchOffset = writeMatch.index;
    const lineNumber = params.content.slice(0, matchOffset).split('\n').length;
    const lineText = params.lines[lineNumber - 1] || '';

    if (params.auditor.isLineIgnored(lineText, ['db-ok'])) continue;

    const topLevelKeys = extractTopLevelKeys(rawPayload);

    for (const { key, index: keyOffset } of topLevelKeys) {
      if (CAMEL_CASE_KEY_REGEX.test(key) && key !== 'toString' && key !== 'valueOf') {
        const propOffset = matchOffset + keyOffset;
        const propLine = params.content.slice(0, propOffset).split('\n').length;
        const propLineText = params.lines[propLine - 1] || '';

        if (!params.auditor.isLineIgnored(propLineText, ['db-ok'])) {
          params.auditor.addViolation({
            ruleId: 'db-payload-snake-case',
            severity: 'error',
            file: params.relPath,
            line: propLine,
            message: `Database payload key '${key}' is camelCase. Database schema strictly mandates snake_case column names.`,
            context: propLineText.trim()
          });
        }
      }
    }
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new SqlAntiPatternsAuditor());
