# Central Version Tracking & The Common Version Table

This guide defines the two-tier database version tracking architecture that allows both fast $O(1)$ version checks and strict, append-only migration auditing across engines.

---

## 1. The Two-Tier Versioning Architecture

Relying on a single mechanism for version tracking introduces trade-offs: querying all applied rows on every application boot creates unnecessary I/O, while storing only a single scalar version loses the granular history of which individual patches were executed.

To achieve both high performance and complete auditability, maintain a **Two-Tier Tracking System**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        TWO-TIER DATABASE TRACKING                      │
├───────────────────────────────────┬────────────────────────────────────┤
│ Tier 1: Granular History Log       │ Tier 2: Scalar State Registry      │
│ (Table: _migrations)              │ (Table: system_config)             │
├───────────────────────────────────┼────────────────────────────────────┤
│ • Append-only audit record        │ • Key-value configuration table    │
│ • Tracks every migration filename │ • Holds current 'db_version'       │
│ • Records execution timestamp     │ • Holds current 'app_version'      │
│ • Used by migration runners       │ • Checked in O(1) on client boot   │
└───────────────────────────────────┴────────────────────────────────────┘
```

---

## 2. Tier 1: The Migration Ledger (`_migrations`)

Every database engine MUST maintain an immutable tracking table:

### PostgreSQL Definition (`supabase_migrations.schema_migrations` or `public._migrations`)

```sql
CREATE TABLE IF NOT EXISTS public._migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### SQLite Definition

```sql
CREATE TABLE IF NOT EXISTS _migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
```

**Mandatory Invariant:**
An entry is inserted into `_migrations` **ONLY AND EXCLUSIVELY AFTER** the migration statement has committed successfully within its transaction. If a statement throws or rolls back, the ID must NEVER be recorded.

---

## 3. Tier 2: The Fast Scalar State Registry (`system_config`)

Both PostgreSQL and SQLite MUST maintain a shared configuration table containing global operational metadata:

```sql
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value JSONB, -- In SQLite: TEXT
  updated_at TIMESTAMPTZ DEFAULT now() -- In SQLite: TEXT
);
```

### Mandatory Keys

| Key | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `db_version` | String / Number | The 14-digit timestamp of the highest applied migration | `'20261008083000'` |
| `app_version` | String | Semantic release version of the executing application | `'v2.1.2'` |

### Updating `db_version` in Migrations

Every migration file MUST include an explicit statement updating `system_config.db_version`:

#### In PostgreSQL

```sql
INSERT INTO public.system_config (key, value)
VALUES ('db_version', '20261008083000'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
```

#### In SQLite

```sql
INSERT INTO system_config (key, value)
VALUES ('db_version', '"20261008083000"')
ON CONFLICT (key) DO UPDATE SET value = '"20261008083000"';
```

---

## 4. Performance & Validation Benefits

### 1. Ultra-Fast $O(1)$ Client Version Check

Instead of transferring and parsing an entire array of historical migrations on startup, the application client runs a lightweight query:

```typescript
const { value: currentDbVersion } = await db.from('system_config').select('value').eq('key', 'db_version').single();
if (Number(currentDbVersion) < CLIENT_DB_VERSION) {
  // Only now lazily import heavy migration scripts:
  const { runMigrations } = await import('./migrationRunner.ts');
  await runMigrations();
}
```

### 2. Static Desynchronization Detection (`sql-migration-dbversion-desync`)

Static analysis tools parse every migration file to extract the version declared in `system_config` statements. If a migration is named `20261008083000_update_schema.sql` but writes `'20261007000000'` inside `system_config`, the auditor immediately fails with an error:

```text
❌ Desync in 20261008083000_update_schema.sql:
   SQL declares db_version '20261007000000' but filename timestamp is '20261008083000'.
```

### 3. Account-Level Integrity Versioning (`profiles.db_version`)

In multi-tenant or multi-user applications, complex structural migrations may leave existing accounts with outdated data structures. To handle this cleanly:

- Include a column `db_version INTEGER DEFAULT 1` in the primary user or profile table (e.g. `public.profiles`).
- When a migration introduces new anti-tampering schemas or normalized sub-structures, increment the account's `db_version` upon verification.
