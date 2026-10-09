/**
 * @file preflight-dryrun-runner.ts
 * @description Demonstrates the Pre-Flight Transactional Dry-Run migration executor.
 * Simulates pending migrations inside BEGIN ... ROLLBACK blocks to catch syntax,
 * type, or column conflicts without modifying the live database.
 */

export interface SqlExecutionDriver {
  execSql: (sql: string) => { status: number; output: string };
}

export interface MigrationFile {
  name: string;
  sql: string;
}

/**
 * Validates pending migrations inside dry-run transactions before real application.
 */
export function executePreflightDryRun(
  pendingMigrations: readonly MigrationFile[],
  driver: SqlExecutionDriver
): void {
  if (pendingMigrations.length === 0) {
    console.log('✨ [Pre-flight] No pending migrations to validate.');
    return;
  }

  console.log(`🔍 [Pre-flight] Running transactional dry-run on ${pendingMigrations.length} migration(s)...`);

  // Phase 1: Validate each file individually inside an isolated rollback transaction
  for (const m of pendingMigrations) {
    const singleSimulationSql = `BEGIN;\n${m.sql}\nROLLBACK;\n`;
    const res = driver.execSql(singleSimulationSql);

    if (res.status !== 0) {
      throw new Error(
        `\n❌ PRE-FLIGHT FAILED on migration '${m.name}':\n${res.output}\n` +
        `🛡️  Active database was NOT modified (zero side-effects). Fix SQL before retrying.`
      );
    }
    console.log(`   ✔ Individual pre-flight passed: ${m.name}`);
  }

  // Phase 2: If there are multiple migrations, validate the cumulative sequence
  if (pendingMigrations.length > 1) {
    let cumulativeSql = 'BEGIN;\n';
    for (const m of pendingMigrations) {
      cumulativeSql += `-- Migration: ${m.name}\n${m.sql}\n`;
    }
    cumulativeSql += 'ROLLBACK;\n';

    const cumulativeRes = driver.execSql(cumulativeSql);
    if (cumulativeRes.status !== 0) {
      throw new Error(
        `\n❌ PRE-FLIGHT FAILED on cumulative interaction of pending migrations:\n${cumulativeRes.output}\n` +
        `🛡️  Active database was NOT modified.`
      );
    }
    console.log(`   ✔ Cumulative sequence pre-flight passed (${pendingMigrations.length} migrations).`);
  }

  console.log('✨ [Pre-flight] SUCCESS: All pending migrations are valid, safe, and compatible.');
}

// Self-test demonstration using an in-memory SQL simulator
if (import.meta.filename === process.argv[1]) {
  const mockValidDriver: SqlExecutionDriver = {
    execSql: (sql: string) => {
      // Simulator: fail if SQL contains forbidden syntax
      if (sql.includes('FATAL_SYNTAX_ERROR')) {
        return { status: 1, output: 'ERROR: syntax error at or near "FATAL_SYNTAX_ERROR"' };
      }
      return { status: 0, output: 'TRANSACTION COMMITTED/ROLLED BACK' };
    }
  };

  const samplePending: MigrationFile[] = [
    { name: '20261010120000_add_teams.sql', sql: 'CREATE TABLE teams (id text primary key);' },
    { name: '20261010130000_add_members.sql', sql: 'ALTER TABLE teams ADD COLUMN member_count int;' }
  ];

  executePreflightDryRun(samplePending, mockValidDriver);
}
