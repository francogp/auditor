/**
 * @file static-migration-auditor.ts
 * @description Standalone static analysis engine for database migrations.
 * Verifies monotonic timestamps, PostgreSQL syntax rules, return-type safety,
 * db_version synchronization, and the Fail-Loud Mandate (zero error suppression).
 */

export interface StaticAuditViolation {
  file: string;
  rule: string;
  message: string;
  line?: number;
}

const TIMESTAMP_REGEX = /^(\d{14})_(.+)\.sql$/;
const DB_VERSION_REGEX = /(?:VALUES\s*\(\s*['"]db_version['"]\s*,\s*['"]*(\d{14})|SET\s+value\s*=\s*['"]*(\d{14})|jsonb_build_object\s*\(\s*['"]db_version['"]\s*,\s*['"]*(\d{14}))/i;

export function auditMigrationFiles(files: readonly { name: string; content: string }[]): StaticAuditViolation[] {
  const violations: StaticAuditViolation[] = [];
  const knownFunctions = new Map<string, { file: string; returnType: string }>();
  let lastTimestamp = '';

  for (const { name: file, content: rawContent } of files) {
    // 1. Monotonic timestamp and naming validation
    const match = file.match(TIMESTAMP_REGEX);
    if (!match) {
      violations.push({
        file,
        rule: 'invalid-timestamp-naming',
        message: `Filename '${file}' does not match YYYYMMDDHHmmss_<action>.sql format.`
      });
      continue;
    }

    const timestamp = match[1]!;
    if (lastTimestamp && timestamp <= lastTimestamp) {
      violations.push({
        file,
        rule: 'broken-monotonicity',
        message: `Broken timestamp monotonicity: '${timestamp}' in '${file}' is not strictly greater than previous '${lastTimestamp}'.`
      });
    }
    lastTimestamp = timestamp;

    // Strip SQL comments for active statement analysis
    const content = rawContent
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    // 2. Fail-Loud Mandate: Zero Error Suppression
    // Prohibit: EXCEPTION WHEN ... THEN NULL;
    const suppressionMatch = content.match(/EXCEPTION\s+WHEN\s+[\s\S]*?THEN\s*NULL\s*;/i);
    if (suppressionMatch) {
      violations.push({
        file,
        rule: 'zero-error-suppression',
        message: `Prohibited error suppression block detected: 'EXCEPTION WHEN ... THEN NULL;'. Migrations must fail loudly and visibly.`
      });
    }

    // 3. PostgreSQL Syntax: REVOKE ... FROM (never TO)
    const revokeToMatch = content.match(/\bREVOKE\b[\s\S]+?\bTO\b\s+([a-zA-Z0-9_]+)/i);
    if (revokeToMatch) {
      violations.push({
        file,
        rule: 'invalid-revoke-syntax',
        message: `Invalid SQL syntax: PostgreSQL requires 'REVOKE ... FROM <role>', not 'TO'.`
      });
    }

    // 4. Parser Keywords Qualification: Prevent pg_catalog.(trim|nullif|coalesce)
    const keywordMatch = content.match(/\bpg_catalog\.(trim|nullif|coalesce|greatest|least)\b/i);
    if (keywordMatch) {
      violations.push({
        file,
        rule: 'invalid-pg-catalog-qualification',
        message: `Keyword '${keywordMatch[1]}' is desugared at parse time and cannot be qualified with 'pg_catalog.'. Use '${keywordMatch[1]?.toUpperCase()}()' directly.`
      });
    }

    // 5. Check db_version synchronization
    const dbVerMatch = content.match(DB_VERSION_REGEX);
    if (dbVerMatch) {
      const declaredVer = dbVerMatch[1];
      if (declaredVer !== timestamp) {
        violations.push({
          file,
          rule: 'db-version-desync',
          message: `Desynchronized db_version: SQL declares '${declaredVer}' but filename timestamp is '${timestamp}'.`
        });
      }
    }

    // 6. Function return-type mutation detection
    const dropRegex = /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?([a-zA-Z0-9_.]+)(?:\s*\(([^)]*)\))?/gi;
    const drops: Array<{ name: string; index: number }> = [];
    let dMatch: RegExpExecArray | null;
    while ((dMatch = dropRegex.exec(content)) !== null) {
      drops.push({ name: dMatch[1]!.toLowerCase(), index: dMatch.index });
    }

    const createRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z0-9_.]+)\s*\(([\s\S]*?)\)\s*RETURNS\s+([\w\s.[\]]+?)(?=\s+(?:LANGUAGE|AS|SECURITY|SET|\$\$))/gi;
    let cMatch: RegExpExecArray | null;
    while ((cMatch = createRegex.exec(content)) !== null) {
      const funcName = cMatch[1]!.toLowerCase();
      const returnType = cMatch[3]!.trim().toLowerCase().replace(/\s+/g, ' ');
      const createIndex = cMatch.index;

      const previous = knownFunctions.get(funcName);
      if (previous && previous.returnType !== returnType) {
        const hasPriorDrop = drops.some(d => d.name === funcName && d.index < createIndex);
        if (!hasPriorDrop) {
          violations.push({
            file,
            rule: 'return-type-mutation-without-drop',
            message: `Function '${funcName}' changes return type from '${previous.returnType}' (${previous.file}) to '${returnType}' without preceding DROP FUNCTION IF EXISTS. PostgreSQL throws 'cannot change return type of existing function'.`
          });
        }
      }
      knownFunctions.set(funcName, { file, returnType });
    }
  }

  return violations;
}

// Self-test assertion demonstration
if (import.meta.filename === process.argv[1]) {
  const sampleBadFiles = [
    {
      name: '20261001120000_create_calc.sql',
      content: 'CREATE FUNCTION calc() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;'
    },
    {
      name: '20261001110000_bad_monotonic.sql', // Out of order!
      content: 'SELECT 1;'
    },
    {
      name: '20261002120000_suppression_and_syntax.sql',
      content: `
        REVOKE ALL ON ALL TABLES TO anon; -- Bad REVOKE TO
        DO $$ BEGIN ALTER TABLE t ADD c int; EXCEPTION WHEN OTHERS THEN NULL; END $$; -- Bad suppression
        SELECT pg_catalog.trim('hello'); -- Bad catalog qualification
        CREATE OR REPLACE FUNCTION calc() RETURNS bigint AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql; -- Return type changed without DROP!
        INSERT INTO system_config (key, value) VALUES ('db_version', '20261001000000'::jsonb); -- Desync!
      `
    }
  ];

  const results = auditMigrationFiles(sampleBadFiles);
  console.log(`Discovered ${results.length} expected violations in sample bad files:`);
  for (const v of results) {
    console.log(`❌ [${v.rule}] in ${v.file}: ${v.message}`);
  }
}
