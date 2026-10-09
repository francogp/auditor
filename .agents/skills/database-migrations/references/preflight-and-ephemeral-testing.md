# Pre-Flight Dry-Run & Ephemeral Live Database Testing

Applying migrations directly against staging or production without a verified simulation invites downtime. This reference details two complementary live testing workflows: **Pre-Flight Dry-Runs** and **Ephemeral Database Testing**.

---

## 1. Pre-Flight Transactional Dry-Runs

A Pre-Flight Dry-Run executes pending migrations inside transactional simulation blocks (`BEGIN ... ROLLBACK`). If any SQL syntax error, missing column, constraint violation, or type conflict occurs, the transaction aborts with an explicit error, leaving the active database 100% untouched.

```text
Pending Migrations
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ 1. Individual Dry-Run (per pending file)               │
│    BEGIN; <file_sql>; ROLLBACK;                        │
└────────────────────────────────────────────────────────┘
       │ (All pass)
       ▼
┌────────────────────────────────────────────────────────┐
│ 2. Cumulative Sequence Dry-Run (all pending files)     │
│    BEGIN; <file1_sql>; <file2_sql>; ... ROLLBACK;      │
└────────────────────────────────────────────────────────┘
       │ (Passes)
       ▼
   Execute Real Migrations with Auto-Commit
```

### Dry-Run Implementation Pattern

```typescript
export async function preflightDryRun(
  pendingFiles: readonly string[],
  migrationsDir: string,
  execSql: (sql: string) => { status: number; output: string }
): Promise<void> {
  // 1. Validate each file individually
  for (const file of pendingFiles) {
    const sql = await fsPromises.readFile(path.join(migrationsDir, file), 'utf-8');
    const dryRunSql = `BEGIN;\n${sql}\nROLLBACK;\n`;
    const res = execSql(dryRunSql);
    if (res.status !== 0) {
      throw new Error(`Pre-flight simulation failed for '${file}':\n${res.output}`);
    }
  }

  // 2. Validate the combined cumulative sequence
  if (pendingFiles.length > 1) {
    let combinedSql = 'BEGIN;\n';
    for (const file of pendingFiles) {
      const sql = await fsPromises.readFile(path.join(migrationsDir, file), 'utf-8');
      combinedSql += `-- Migration: ${file}\n${sql}\n`;
    }
    combinedSql += 'ROLLBACK;\n';

    const cumulativeRes = execSql(combinedSql);
    if (cumulativeRes.status !== 0) {
      throw new Error(`Pre-flight cumulative sequence failed:\n${cumulativeRes.output}`);
    }
  }
}
```

---

## 2. Dedicated Live Testing on Ephemeral Databases

While dry-runs catch basic DDL and constraint failures, statements that cannot run inside transactions (e.g. `CREATE INDEX CONCURRENTLY` in PostgreSQL) or multi-step data migrations requiring committed intermediate states require a true live database instance.

### The Ephemeral Lifecycle

1. **Provision Isolated Database**: Create a unique database with a timestamped suffix (`test_db_${epochMilliseconds}`).
2. **Restore Stable Baseline**: Load a known stable milestone snapshot (`tests/fixtures/database/baseline_schema.sql`).
3. **Query Tracking Ledger**: Inspect `supabase_migrations.schema_migrations` inside the ephemeral DB to discover what migrations were already applied in the baseline.
4. **Sequential Execution**: Apply each pending migration one-by-one, measuring execution time in milliseconds and asserting status 0.
5. **Sanity Verification**: Run sanity queries (e.g., verifying row counts, schema definitions).
6. **Guaranteed Teardown**: In a `finally` block, terminate connections and drop the ephemeral database (`DROP DATABASE IF EXISTS ... WITH (FORCE);`).

```typescript
export async function runLiveEphemeralVerification(): Promise<void> {
  const ephemeralDb = `test_mig_${Date.now()}`;
  execDockerSql(`CREATE DATABASE ${ephemeralDb};`, 'postgres');

  try {
    // 1. Restore baseline fixture
    const fixtureSql = await fsPromises.readFile('tests/fixtures/database/baseline_schema.sql', 'utf-8');
    execDockerSql(fixtureSql, ephemeralDb);

    // 2. Discover applied migrations in baseline
    const appliedVersions = getAppliedVersionsFromDb(ephemeralDb);

    // 3. Find pending migrations
    const allFiles = (await fsPromises.readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort();
    const pendingFiles = allFiles.filter(f => !appliedVersions.has(f));

    // 4. Apply each sequentially
    for (const file of pendingFiles) {
      const sql = await fsPromises.readFile(`supabase/migrations/${file}`, 'utf-8');
      const start = performance.now();
      const res = execDockerSql(sql, ephemeralDb);
      const elapsed = Math.round(performance.now() - start);

      if (res.status !== 0) {
        throw new Error(`Migration '${file}' failed after ${elapsed}ms:\n${res.output}`);
      }

      recordAppliedMigration(ephemeralDb, file);
    }

    // 5. Post-migration integrity checks
    const sanityRes = execDockerSql('SELECT count(*) FROM public.users;', ephemeralDb);
    if (sanityRes.status !== 0) {
      throw new Error(`Post-migration sanity check failed: ${sanityRes.output}`);
    }
  } finally {
    // 6. Clean up ephemeral database
    execDockerSql(`DROP DATABASE IF EXISTS ${ephemeralDb} WITH (FORCE);`, 'postgres');
  }
}
```

---

## 3. Generating Baseline Fixtures (`generate_migration_fixture.ts`)

A baseline fixture captures the database schema at a known stable release milestone (e.g. `v2.1.0`), allowing subsequent migrations to be verified without replaying hundreds of historical migrations from project inception.

### Generation Workflow

1. Create a clean temporary database.
2. Initialize core schemas (`auth`, `public`, `supabase_migrations`).
3. Restore the full schema using `pg_dump --schema-only`.
4. Register in `schema_migrations` all migration filenames up to the target milestone version (`YYYYMMDDHHmmss <= milestoneVersion`).
5. Prune any tables or columns introduced by migrations *after* the milestone.
6. Export the normalized snapshot to `tests/fixtures/database/baseline_schema.sql`.
7. Ensure all `CREATE SCHEMA` statements in the dump are normalized to `CREATE SCHEMA IF NOT EXISTS` for idempotent restores.
