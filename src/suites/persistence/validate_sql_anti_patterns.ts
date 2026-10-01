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
  return /(?:\$\.[a-zA-Z0-9_]+\[\d+\]|[a-zA-Z0-9_]+\s*->\s*\d+|jsonb_set\([^,]+,\s*'\{[a-zA-Z0-9_]+,\s*\d+\}'|json_extract\([^,]+,\s*['"]\$\.[a-zA-Z0-9_]+\[\d+\])/i;
}

export const POSITIONAL_JSON_MUTATION_REGEX = /(?:\$\.[a-zA-Z0-9_]+\[\d+\]|[a-zA-Z0-9_]+\s*->\s*\d+|jsonb_set\([^,]+,\s*'\{[a-zA-Z0-9_]+,\s*\d+\}'|json_extract\([^,]+,\s*['"]\$\.[a-zA-Z0-9_]+\[\d+\])/i;
const CAMEL_CASE_KEY_REGEX = /^[a-z]+[A-Z][a-zA-Z0-9]*$/;

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
      ruleDescriptions: {
        'sql-no-positional-arrays': 'Mutación de array JSON en SQL',
        'sql-plpgsql-declared-variables': 'Variable PL/pgSQL sin declarar',
        'sql-rls-policy-grant-integrity': 'Permiso GRANT faltante en RLS',
        'db-payload-snake-case': 'Propiedad sin snake_case en BD',
        'storage-uncoordinated-save-bypass': 'Bypass de persistencia segura'
      },
      roots: [migrationsDirRel, ...srcRoots],
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
      this.context.logStep(1, 1, 'Persistencia desactivada explícitamente en audit.config.ts (persistence.engine: "none"). Omitiendo.');
      this.context.setMetric('Engine', 'none (omitted)');
      return;
    }

    const migrationsDir = path.resolve(this.projectRoot, this.configuredMigrationsDir);
    const sqlMigrations: { relPath: string; content: string }[] = [];

    // 1. Scan SQL migrations
    if (fs.existsSync(migrationsDir)) {
      const entries = fs.readdirSync(migrationsDir);
      for (const entry of entries) {
        if (!entry.endsWith('.sql')) continue;
        const fullPath = path.join(migrationsDir, entry);
        const relPath = path.relative(this.projectRoot, fullPath).split(path.sep).join(path.posix.sep);
        if (this.context.isPathIgnored(relPath)) continue;

        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          this.filesScannedCount++;
          sqlMigrations.push({ relPath, content });
          this.scanSqlFile(relPath, content);
        } catch {
          // Ignore read errors
        }
      }
    }

    // 2. Scan TypeScript and Vue code in src/
    const srcRoots = config.paths.srcRoots || ['src'];
    const srcFiles = this.context.collectFiles([...srcRoots], new Set(['.ts', '.vue']));
    for (const file of srcFiles) {
      const relPath = path.relative(this.projectRoot, file).split(path.sep).join(path.posix.sep);
      try {
        const content = fs.readFileSync(file, 'utf-8');
        this.filesScannedCount++;
        this.scanTypeScriptFile(relPath, content);
      } catch {
        // Ignore read errors
      }
    }

    // 3. Scan cross-migration RLS policy integrity
    this.scanRlsPolicyIntegrity(sqlMigrations);
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

  private scanPlpgsqlUndeclaredVariables(relPath: string, content: string): void {
    const blockRegex = /(?:CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)[\s\S]+?AS\s+\$\$|DO\s+\$\$)([\s\S]*?)\$\$\s*(?:LANGUAGE\s+plpgsql)?/gi;
    let blockMatch: RegExpExecArray | null;

    while ((blockMatch = blockRegex.exec(content)) !== null) {
      const funcName = blockMatch[1] || 'anonymous_do_block';
      const blockBody = blockMatch[2];
      if (!blockBody) continue;
      const blockOffset = blockMatch.index;

      const declareMatch = blockBody.match(/\bDECLARE\b([\s\S]*?)\bBEGIN\b/i);
      const declaredVars = new Set<string>();

      if (declareMatch && declareMatch[1]) {
        const declareLines = declareMatch[1].split('\n');
        for (const dLine of declareLines) {
          const trimmed = dLine.trim();
          if (!trimmed || trimmed.startsWith('--')) continue;
          const varMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s+/);
          if (varMatch && varMatch[1]) {
            const varName = varMatch[1].toLowerCase();
            if (!['constant'].includes(varName)) {
              declaredVars.add(varName);
            }
          }
        }
      }

      const beginIndex = blockBody.search(/\bBEGIN\b/i);
      if (beginIndex === -1) continue;

      const executionBody = blockBody.slice(beginIndex);
      const forLoopRegex = /\bFOR\s+([a-zA-Z0-9_]+)\s+IN\b/gi;
      let loopMatch: RegExpExecArray | null;

      while ((loopMatch = forLoopRegex.exec(executionBody)) !== null) {
        const loopVar = loopMatch[1];
        if (!loopVar) continue;
        const nextLoopIdx = executionBody.indexOf('LOOP', loopMatch.index);
        const loopSlice = nextLoopIdx !== -1 ? executionBody.slice(loopMatch.index, nextLoopIdx) : executionBody.slice(loopMatch.index, loopMatch.index + 120);
        if (/\.\./.test(loopSlice)) {
          // Integer range loop (e.g. FOR j IN 0..N-1 LOOP): PostgreSQL implicitly declares loopVar as local integer
          continue;
        }

        if (!declaredVars.has(loopVar.toLowerCase())) {
          const absolutePos = blockOffset + beginIndex + loopMatch.index;
          const line = content.slice(0, absolutePos).split('\n').length;
          const lineContent = content.split('\n')[line - 1] || '';

          if (!this.isLineIgnored(lineContent, ['plpgsql-ok', 'sql-ok'])) {
            this.addViolation({
              ruleId: 'sql-plpgsql-declared-variables',
              severity: 'error',
              file: relPath,
              line,
              message: `Undeclared PL/pgSQL loop variable '${loopVar}' in function/block '${funcName}'. Variables must be declared in DECLARE block.`,
              context: lineContent.trim()
            });
          }
        }
      }
    }
  }

  private scanRlsPolicyIntegrity(migrations: readonly { relPath: string; content: string }[]): void {
    const rlsTables = new Map<string, { relPath: string; line: number; lineContent: string }>();
    const tablesWithPolicies = new Set<string>();

    const enableRlsRegex = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;/gi;
    const createPolicyRegex = /CREATE\s+POLICY\s+.*?\s+ON\s+(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\b/gi;

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

    for (const [table, loc] of rlsTables.entries()) {
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

    // Rule 5: storage-uncoordinated-save-bypass
    if (!this.authorizedSaveFiles.has(relPath) && this.saveKeyPrefixes.length > 0) {
      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        if (!lineText) continue;
        const hasUncoordinatedSave = this.saveKeyPrefixes.some(
          prefix =>
            lineText.includes(`localStorage.setItem('${prefix}`) ||
            lineText.includes(`localStorage.setItem("${prefix}`) ||
            lineText.includes(`localStorage.setItem(\`${prefix}`)
        );
        if (hasUncoordinatedSave && !this.isLineIgnored(lineText, ['storage-ok'])) {
          this.addViolation({
            ruleId: 'storage-uncoordinated-save-bypass',
            severity: 'error',
            file: relPath,
            line: i + 1,
            message: `Direct localStorage write to state bypasses authorized persistence architecture.`,
            context: lineText.trim()
          });
        }
      }
    }

function extractTopLevelKeys(raw: string): { key: string; index: number }[] {
  const results: { key: string; index: number }[] = [];
  let depth = 0;
  let inString: string | null = null;
  const isArrayPayload = raw.trim().startsWith('[');
  const targetDepth = isArrayPayload ? 2 : 1;

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]!;
    const prev = i > 0 ? raw[i - 1] : '';

    if (inString) {
      if (char === inString && prev !== '\\') inString = null;
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      inString = char;
      continue;
    }

    if (char === '{' || char === '[') {
      depth++;
      continue;
    }

    if (char === '}' || char === ']') {
      depth--;
      continue;
    }

    if (depth === targetDepth) {
      const rest = raw.slice(i);
      const m = rest.match(/^([a-zA-Z0-9_]+)\s*:/);
      if (m && m[1]) {
        results.push({ key: m[1], index: i });
        i += m[0].length - 1;
      }
    }
  }

  return results;
}

    // Rule 4: db-payload-snake-case
    const dbWriteRegex = /\.(?:insert|update|upsert)\s*\(\s*(\[[^\]]*\]|\{[^}]*\})/g;
    let writeMatch: RegExpExecArray | null;

    while ((writeMatch = dbWriteRegex.exec(content)) !== null) {
      const rawPayload = writeMatch[1]!;
      const matchOffset = writeMatch.index;
      const lineNumber = content.slice(0, matchOffset).split('\n').length;
      const lineText = lines[lineNumber - 1] || '';

      if (this.isLineIgnored(lineText, ['db-ok'])) continue;

      const topLevelKeys = extractTopLevelKeys(rawPayload);

      for (const { key, index: keyOffset } of topLevelKeys) {
        if (CAMEL_CASE_KEY_REGEX.test(key) && key !== 'toString' && key !== 'valueOf') {
          const propOffset = matchOffset + keyOffset;
          const propLine = content.slice(0, propOffset).split('\n').length;
          const propLineText = lines[propLine - 1] || '';

          if (!this.isLineIgnored(propLineText, ['db-ok'])) {
            this.addViolation({
              ruleId: 'db-payload-snake-case',
              severity: 'error',
              file: relPath,
              line: propLine,
              message: `Database payload key '${key}' is camelCase. Database schema strictly mandates snake_case column names.`,
              context: propLineText.trim()
            });
          }
        }
      }
    }
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new SqlAntiPatternsAuditor());
}
