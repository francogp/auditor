/**
 * @file in-memory-step-test.ts
 * @description Demonstrates step-by-step in-memory migration testing using native Node.js 26+ node:sqlite.
 * Loads an ancient fixture, discovers pending migrations, executes them sequentially in transactions,
 * and asserts post-migration semantic and structural integrity.
 *
 * Run directly with:
 *   node --experimental-strip-types .agents/skills/database-migrations/examples/in-memory-step-test.ts
 */

import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

interface MigrationEntry {
  readonly id: string;
  readonly sql: string;
}

// 1. Define sample migrations sequence
const MIGRATIONS: readonly MigrationEntry[] = [
  {
    id: '20260101000000_create_initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        raw_metadata TEXT,
        status TEXT DEFAULT 'active'
      );
      INSERT INTO system_config (key, value) VALUES ('db_version', '"20260101000000"');
    `
  },
  {
    id: '20260401120000_add_account_tier_and_normalize_metadata',
    sql: `
      ALTER TABLE accounts ADD COLUMN tier TEXT DEFAULT 'standard';
      -- Normalize legacy status
      UPDATE accounts SET status = 'suspended' WHERE status = 'banned';
      INSERT INTO system_config (key, value) VALUES ('db_version', '"20260401120000"')
      ON CONFLICT(key) DO UPDATE SET value = '"20260401120000"';
    `
  },
  {
    id: '20260815180000_add_audit_flags_and_integrity_column',
    sql: `
      ALTER TABLE accounts ADD COLUMN is_verified INTEGER DEFAULT 0;
      ALTER TABLE accounts ADD COLUMN integrity_hash TEXT;
      UPDATE accounts SET integrity_hash = hex(randomblob(16)) WHERE integrity_hash IS NULL;
      INSERT INTO system_config (key, value) VALUES ('db_version', '"20260815180000"')
      ON CONFLICT(key) DO UPDATE SET value = '"20260815180000"';
    `
  }
];

// 2. Simulated legacy fixture (as captured from production at version 20260101000000)
const LEGACY_FIXTURE_DATA = {
  system_config: [
    { key: 'db_version', value: '"20260101000000"', updated_at: '2026-01-01T00:00:00Z' },
    { key: 'app_version', value: '"v1.0.0"', updated_at: '2026-01-01T00:00:00Z' }
  ],
  accounts: [
    { id: 'acc_001', name: 'Alpha User', raw_metadata: '{"plan":"free"}', status: 'active' },
    { id: 'acc_002', name: 'Legacy Banned User', raw_metadata: '{"violations":2}', status: 'banned' }
  ],
  _migrations: [
    { id: '20260101000000_create_initial_schema', applied_at: '2026-01-01T00:00:00Z' }
  ]
};

function runInMemoryMigrationTest(): void {
  const startTotal = performance.now();
  console.log('🔍 [Test] Initializing in-memory SQLite database via native node:sqlite...');

  // Create isolated in-memory DB (sub-millisecond boot)
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = OFF;');

  try {
    // 3. Rehydrate fixture tables and rows
    console.log('📦 [Test] Loading ancient production fixture into memory...');
    db.exec('BEGIN TRANSACTION;');

    for (const [tableName, rows] of Object.entries(LEGACY_FIXTURE_DATA)) {
      if (rows.length === 0) continue;
      const sample = rows[0]!;
      const cols = Object.keys(sample);
      const colDefs = cols.map(c => `"${c}" TEXT`).join(', ');

      db.exec(`CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs}, PRIMARY KEY ("${cols[0]}"));`);

      const placeholders = cols.map(() => '?').join(', ');
      const stmt = db.prepare(`INSERT INTO "${tableName}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders});`);
      for (const row of rows) {
        const values = cols.map(c => (row as Record<string, unknown>)[c]);
        stmt.run(...values as (string | number | null)[]);
      }
    }
    db.exec('COMMIT;');

    // 4. Query _migrations to discover baseline version
    const appliedRows = db.prepare('SELECT id FROM _migrations;').all() as { id: string }[];
    const appliedSet = new Set(appliedRows.map(r => r.id));
    console.log(`ℹ️ [Test] Baseline fixture has ${appliedSet.size} previously applied migration(s).`);

    const pending = MIGRATIONS.filter(m => !appliedSet.has(m.id));
    assert.strictEqual(pending.length, 2, 'Should discover exactly 2 pending migrations.');
    console.log(`🚀 [Test] Applying ${pending.length} pending migration(s) step-by-step:`);

    // 5. Apply each pending migration sequentially in isolated transactions
    for (const migration of pending) {
      const stepStart = performance.now();
      db.exec('BEGIN TRANSACTION;');
      try {
        db.exec(migration.sql);
        db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?);')
          .run(migration.id, new Date().toISOString());
        db.exec('COMMIT;');

        const elapsed = (performance.now() - stepStart).toFixed(2);
        console.log(`   ✔ Applied: ${migration.id} (${elapsed}ms)`);
      } catch (err) {
        db.exec('ROLLBACK;');
        throw new Error(`Fatal error in migration '${migration.id}': ${(err as Error).message}`, { cause: err });
      }
    }

    // 6. Assert Post-Migration Semantic and Structural Integrity
    console.log('🧪 [Test] Running post-migration integrity assertions...');

    // A. Check common system_config version
    const verRow = db.prepare("SELECT value FROM system_config WHERE key = 'db_version';").get() as { value: string };
    assert.ok(verRow, 'db_version row must exist');
    assert.strictEqual(verRow.value, '"20260815180000"', 'db_version must match latest applied migration');

    // B. Check columns were added properly
    const tableInfo = db.prepare('PRAGMA table_info(accounts);').all() as { name: string }[];
    const colNames = new Set(tableInfo.map(c => c.name));
    assert.ok(colNames.has('tier'), "accounts must have 'tier' column");
    assert.ok(colNames.has('is_verified'), "accounts must have 'is_verified' column");
    assert.ok(colNames.has('integrity_hash'), "accounts must have 'integrity_hash' column");

    // C. Check data normalization: 'banned' status must have been migrated to 'suspended'
    const user2 = db.prepare("SELECT status, tier, integrity_hash FROM accounts WHERE id = 'acc_002';").get() as {
      status: string;
      tier: string;
      integrity_hash: string;
    };
    assert.strictEqual(user2.status, 'suspended', "Legacy 'banned' status must be normalized to 'suspended'");
    assert.strictEqual(user2.tier, 'standard', "Default tier must be populated");
    assert.ok(user2.integrity_hash && user2.integrity_hash.length > 10, 'Integrity hash must be generated');

    // D. Check for corrupted string artifacts
    const allAccounts = db.prepare('SELECT * FROM accounts;').all() as Record<string, unknown>[];
    for (const acc of allAccounts) {
      for (const [col, val] of Object.entries(acc)) {
        if (typeof val === 'string') {
          assert.ok(!val.includes('[object Object]'), `Column '${col}' must not contain '[object Object]'`);
          assert.ok(!val.includes('[object Array]'), `Column '${col}' must not contain '[object Array]'`);
        }
      }
    }

    const totalElapsed = (performance.now() - startTotal).toFixed(2);
    console.log(`\n🎉 [Test] SUCCESS: All migrations applied cleanly and verified in ${totalElapsed}ms with 100% integrity.`);
  } finally {
    db.close();
  }
}

runInMemoryMigrationTest();
