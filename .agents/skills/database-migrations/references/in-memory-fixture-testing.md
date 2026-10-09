# In-Memory Step-by-Step Fixture Testing

Testing migrations against production data is critical, yet running migrations against live databases during unit tests is dangerous, slow, and non-deterministic. This guide explains how to construct an ultra-fast (5–20ms), hermetic in-memory migration testing pipeline using native Node.js 26+ `node:sqlite`.

---

## 1. Core Architectural Strategy

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   IN-MEMORY FIXTURE TESTING PIPELINE                   │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Load Ancient Production Fixture (JSON Backup / Baseline Snapshot)   │
│    │                                                                   │
│ 2. Rehydrate Data into Node.js 26+ DatabaseSync(':memory:')           │
│    │                                                                   │
│ 3. Query '_migrations' to Detect Baseline Version (e.g. v20260401)     │
│    │                                                                   │
│ 4. Dynamically Discover All Subsequent Pending Migrations             │
│    │                                                                   │
│ 5. Apply Pending Migrations Step-by-Step in Isolated Transactions     │
│    │                                                                   │
│ 6. Assert Post-Migration Integrity (Valibot, Parity, Invariants)      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Setting Up In-Memory SQLite (`node:sqlite`)

Node.js 26+ includes native SQLite bindings via `node:sqlite`. It requires zero external dependencies, compiles no C++ addons at installation time, and boots an in-memory database in sub-millisecond time.

```typescript
import { DatabaseSync } from 'node:sqlite';

export function createMemoryTestDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = OFF;');
  return db;
}
```

---

## 3. Rehydrating Legacy Fixtures

A legacy fixture represents an authentic historical snapshot of production data (from weeks, months, or years prior).

### Hydration from JSON Backup

```typescript
export function rehydrateBackupIntoMemory(
  db: DatabaseSync,
  fixtureData: Record<string, Record<string, unknown>[]>
): void {
  db.exec('BEGIN TRANSACTION;');

  for (const [tableName, rows] of Object.entries(fixtureData)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    
    // Inspect sample row to construct column definitions dynamically
    const sample = rows[0]!;
    const cols = Object.keys(sample);
    const colDefs = cols.map(c => `"${c}" TEXT`).join(', ');

    db.exec(`CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs});`);

    const placeholders = cols.map(() => '?').join(', ');
    const colNames = cols.map(c => `"${c}"`).join(', ');
    const stmt = db.prepare(`INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders});`);

    for (const row of rows) {
      const values = cols.map(c => {
        const val = row[c];
        if (val === null || val === undefined) return null;
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      });
      stmt.run(...values);
    }
  }

  db.exec('COMMIT;');
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT);');
}
```

---

## 4. Sequential Step-by-Step Execution

Once hydrated, query `_migrations` to see what migrations were already applied in the snapshot, filter the pending ones, and apply them one by one:

```typescript
export function applyPendingMigrationsSequentially(
  db: DatabaseSync,
  migrations: readonly { id: string; sql: string }[]
): { appliedCount: number; durations: Record<string, number> } {
  const appliedRows = db.prepare('SELECT id FROM _migrations;').all() as { id: string }[];
  const appliedSet = new Set(appliedRows.map(r => r.id));

  let appliedCount = 0;
  const durations: Record<string, number> = {};

  for (const migration of migrations) {
    if (appliedSet.has(migration.id)) continue;

    const start = performance.now();
    db.exec('BEGIN TRANSACTION;');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?);')
        .run(migration.id, new Date().toISOString());
      db.exec('COMMIT;');

      durations[migration.id] = Math.round(performance.now() - start);
      appliedCount++;
    } catch (err: unknown) {
      db.exec('ROLLBACK;');
      throw new Error(`Migration '${migration.id}' failed in-memory execution: ${(err as Error).message}`, { cause: err });
    }
  }

  return { appliedCount, durations };
}
```

---

## 5. Post-Migration Verification Asserters

Applying SQL without verifying the resulting data state is insufficient. Run comprehensive integrity checks:

### 1. Zero Corrupted String Artifacts

Detect accidental `JSON.stringify` or serialization bugs:

```typescript
export function assertNoCorruptedObjects(db: DatabaseSync, tableNames: string[]): void {
  for (const table of tableNames) {
    const rows = db.prepare(`SELECT * FROM "${table}";`).all() as Record<string, unknown>[];
    for (const row of rows) {
      for (const [col, val] of Object.entries(row)) {
        if (typeof val === 'string') {
          if (val.includes('[object Object]') || val.includes('[object Array]')) {
            throw new Error(`Data corruption detected in table '${table}', column '${col}': contains '${val}'`);
          }
        }
      }
    }
  }
}
```

### 2. Domain Schema Validation (e.g., Valibot / TypeScript DTOs)

Parse migrated rows using strict runtime domain schemas to guarantee backward compatibility with current application models.

### 3. Structural Schema Parity Testing (`db_schema_parity.test.ts`)

Verify that a clean database created strictly from base DDL (`CREATE TABLE ...`) produces the exact same column structure as an ancient database migrated incrementally through 50+ migrations:

```typescript
// Inspect sqlite_master and PRAGMA table_info across DB_Fresh and DB_Migrated:
const colsFresh = getTableColumns(dbFresh, 'invoices');
const colsMigrated = getTableColumns(dbMigrated, 'invoices');

for (const col of colsMigrated) {
  assert.ok(colsFresh.has(col), `Column '${col}' exists in migrated DB but is missing in static schema definition.`);
}
```
