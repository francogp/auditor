import fs from 'node:fs';
import path from 'node:path';

interface SchemaIssue {
  file: string;
  line: number;
  severity: 'error' | 'warning';
  message: string;
}

interface ValidationReport {
  timestamp: string;
  migrationsDir: string;
  totalMigrations: number;
  pairedSqliteMigrations: number;
  issues: SchemaIssue[];
  passed: boolean;
}

function parseArgs(): { json: boolean; projectPath: string } {
  const args = process.argv.slice(2);
  const json = args.includes('--json') || args.includes('json');
  const pathArg = args.find(a => !a.startsWith('-') && a !== 'json');
  const projectPath = pathArg ? path.resolve(pathArg) : process.cwd();
  return { json, projectPath };
}

export function validateMigrations(projectPath: string): ValidationReport {
  const migrationsDir = path.join(projectPath, 'database', 'migrations');
  const issues: SchemaIssue[] = [];

  if (!fs.existsSync(migrationsDir)) {
    return {
      timestamp: new Date().toISOString(),
      migrationsDir,
      totalMigrations: 0,
      pairedSqliteMigrations: 0,
      issues: [{
        file: 'database/migrations',
        line: 1,
        severity: 'error',
        message: `Migrations directory does not exist: ${migrationsDir}`,
      }],
      passed: false,
    };
  }

  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  const sqlFiles = entries
    .filter(e => e.isFile() && e.name.endsWith('.sql') && !e.name.endsWith('.sqlite.sql'))
    .map(e => e.name);
  const sqliteFiles = new Set(
    entries
      .filter(e => e.isFile() && e.name.endsWith('.sqlite.sql'))
      .map(e => e.name)
  );

  const timestampRegex = /^\d{14}_.+\.sql$/;

  let pairedSqliteCount = 0;

  for (const file of sqlFiles) {
    const fullPath = path.join(migrationsDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');

    // 1. Verify Timestamped Forward-only Name
    if (!timestampRegex.test(file)) {
      issues.push({
        file: `database/migrations/${file}`,
        line: 1,
        severity: 'error',
        message: 'Migration filename must adhere to forward-only timestamp format: YYYYMMDDHHmmss_description.sql',
      });
    }

    // 2. Verify companion .sqlite.sql exists
    const companionName = file.replace(/\.sql$/, '.sqlite.sql');
    if (sqliteFiles.has(companionName)) {
      pairedSqliteCount++;
    } else {
      issues.push({
        file: `database/migrations/${file}`,
        line: 1,
        severity: 'warning',
        message: `Missing companion SQLite migration: ${companionName}`,
      });
    }

    // 3. Scan lines for SQL anti-patterns
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const lineNum = i + 1;

      // Anti-pattern: CREATE INDEX CONCURRENTLY
      if (/CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY/i.test(line)) {
        issues.push({
          file: `database/migrations/${file}`,
          line: lineNum,
          severity: 'error',
          message: 'CREATE INDEX CONCURRENTLY is forbidden: incompatible with SQLite WASM and migration transaction blocks',
        });
      }

      // Anti-pattern: Missing PRIMARY KEY in CREATE TABLE
      if (/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-zA-Z0-9_"]+)/i.test(line)) {
        // Look ahead to check if table block has primary key
        let tableBlock = '';
        for (let j = i; j < Math.min(i + 50, lines.length); j++) {
          tableBlock += (lines[j] ?? '') + '\n';
          if ((lines[j] ?? '').includes(');')) break;
        }

        if (!/PRIMARY\s+KEY/i.test(tableBlock) && !/REFERENCES/i.test(tableBlock)) {
          issues.push({
            file: `database/migrations/${file}`,
            line: lineNum,
            severity: 'warning',
            message: `Table definition might be missing explicit PRIMARY KEY constraint`,
          });
        }
      }

      // Check for camelCase columns in CREATE TABLE
      const colMatch = line.match(/^\s*([a-z]+[A-Z0-9][a-zA-Z0-9]*)\s+(?:VARCHAR|TEXT|INTEGER|BIGINT|BOOLEAN|JSONB|TIMESTAMP)/);
      if (colMatch) {
        issues.push({
          file: `database/migrations/${file}`,
          line: lineNum,
          severity: 'warning',
          message: `Column '${colMatch[1]}' uses camelCase; database columns should follow snake_case convention`,
        });
      }
    }
  }

  const errors = issues.filter(i => i.severity === 'error');

  return {
    timestamp: new Date().toISOString(),
    migrationsDir: path.relative(projectPath, migrationsDir),
    totalMigrations: sqlFiles.length,
    pairedSqliteMigrations: pairedSqliteCount,
    issues,
    passed: errors.length === 0,
  };
}

function renderBoxDrawing(report: ValidationReport): void {
  console.log('\n┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│                    FACTURACIÓN 2.0 - SCHEMA VALIDATOR                        │');
  console.log('├──────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│ Total Migrations (.sql):        ${String(report.totalMigrations).padEnd(44)} │`);
  console.log(`│ Paired SQLite (.sqlite.sql):    ${String(report.pairedSqliteMigrations).padEnd(44)} │`);
  console.log(`│ Status:                         ${(report.passed ? '✅ PASSED (0 errors)' : '❌ FAILED').padEnd(44)} │`);
  console.log('├──────────────────────────────────────────────────────────────────────────────┤');

  if (report.issues.length === 0) {
    console.log('│ ✨ All migrations adhere to schema validation standards.                     │');
  } else {
    for (const issue of report.issues.slice(0, 15)) {
      const tag = issue.severity === 'error' ? '❌' : '⚠️';
      const loc = `${issue.file}:${issue.line}`;
      console.log(`│ ${tag} [${issue.severity.toUpperCase()}] ${loc.padEnd(64)} │`);
      const msg = issue.message.length > 74 ? issue.message.substring(0, 71) + '...' : issue.message;
      console.log(`│    ${msg.padEnd(74)} │`);
    }
    if (report.issues.length > 15) {
      console.log(`│ ... and ${report.issues.length - 15} more findings.                                       │`);
    }
  }
  console.log('└──────────────────────────────────────────────────────────────────────────────┘\n');
}

function main(): void {
  const { json, projectPath } = parseArgs();
  const report = validateMigrations(projectPath);

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    renderBoxDrawing(report);
  }

  if (!report.passed) {
    process.exit(1);
  }
}

main();
