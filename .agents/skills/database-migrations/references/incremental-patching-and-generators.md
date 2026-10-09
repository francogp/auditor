# Incremental Patching & Dynamic Migration Generators

This guide establishes the architectural patterns for authoring, generating, and compiling database migrations incrementally.

---

## 1. The Two Migration Authoring Pathways

Database migrations fall into two distinct operational categories:

| Pathway | Use Case | Mechanism | Example |
| :--- | :--- | :--- | :--- |
| **Manual DDL & RLS** | Structural schema changes, indexing, security policies, new tables, dropped columns | Authored directly by engineers as timestamped `.sql` files | Adding a new foreign key or altering an existing constraint |
| **Code-Driven Generators** | Data backfills, entity purges, lookup syncs derived from application constants | Generated automatically by TypeScript scripts under `scripts/database/` | Purging disabled entity IDs according to a TypeScript whitelist |

---

## 2. Monotonic Timestamp Naming Standard

All migration files MUST follow a strict 14-digit UTC timestamp naming convention:

```text
YYYYMMDDHHmmss_<action>_<subject>.sql
```

**Rules:**

- `YYYY`: 4-digit year (e.g., `2026`)
- `MM`: 2-digit month (`01`-`12`)
- `DD`: 2-digit day (`01`-`31`)
- `HH`: 2-digit hour in 24-hour UTC (`00`-`23`)
- `mm`: 2-digit minute (`00`-`59`)
- `ss`: 2-digit second (`00`-`59`)
- `_<action>_<subject>`: Lowercase snake_case action descriptor (e.g., `20261001140000_lockdown_admin_and_lock_rpc_functions.sql`).

**Strict Monotonicity:**
Every new migration's timestamp MUST be strictly greater than the previous migration's timestamp (`timestamp > previousTimestamp`). Duplicate or decreasing timestamps fail static verification immediately.

---

## 3. Dynamic Migration Generators (TypeScript SSoT)

When migration logic depends on constants or domain definitions maintained in TypeScript (such as whitelisted feature flags, item catalogs, role permissions, or status codes), NEVER manually copy-paste arrays into raw SQL. This introduces severe drift risks between runtime code and database state.

### The Generator Pattern

Create a dedicated generator script (e.g., `scripts/database/generate_<feature>_migration.ts`):

1. Import canonical TypeScript data (`Single Source of Truth`).
2. Construct parameterized SQL statements for target dialects (e.g., PostgreSQL `ARRAY[...]` vs SQLite `IN (...)`).
3. Include automatic synchronization of `system_config.db_version`.
4. Emit formatted `.sql` and companion `.sqlite.sql` files directly to `database/migrations/`.

#### Example Generator Structure

```typescript
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { ALLOWED_CATEGORY_IDS } from '@/logic/constants/categories.ts';

export async function generateCategorySyncMigration(timestamp = '20261010120000'): Promise<void> {
  const pgArray = `ARRAY[${ALLOWED_CATEGORY_IDS.map(id => `'${id}'`).join(', ')}]`;
  const sqliteInList = ALLOWED_CATEGORY_IDS.map(id => `'${id}'`).join(', ');

  const pgSql = `-- Generated from ALLOWED_CATEGORY_IDS
UPDATE public.categories 
SET is_active = FALSE 
WHERE category_id != ALL(${pgArray});

INSERT INTO public.system_config (key, value)
VALUES ('db_version', '${timestamp}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
`;

  const sqliteSql = `-- Generated from ALLOWED_CATEGORY_IDS (SQLite)
UPDATE categories 
SET is_active = 0 
WHERE category_id NOT IN (${sqliteInList});

INSERT INTO system_config (key, value)
VALUES ('db_version', '"${timestamp}"')
ON CONFLICT (key) DO UPDATE SET value = '"${timestamp}"';
`;

  const migrationsDir = path.resolve(process.cwd(), 'database/migrations');
  await fsPromises.writeFile(path.join(migrationsDir, `${timestamp}_sync_category_whitelist.sql`), pgSql, 'utf-8');
  await fsPromises.writeFile(path.join(migrationsDir, `${timestamp}_sync_category_whitelist.sqlite.sql`), sqliteSql, 'utf-8');
}
```

---

## 4. Manifest Compilation (`generate_migrations.ts`)

In projects where migration lists must be known statically at compile time (such as offline clients, automated testing harnesses, or WebAssembly runners), a centralized compiler script transforms the `migrations/` directory into a typed manifest.

### Key Compiler Capabilities

1. **Quote-Aware Comment Stripping**:
   Naive stripping of `--` comments corrupts strings containing dashes, CSS variables (e.g., `var(--color)`), or URLs. The compiler must tokenize strings to preserve quotes:

```typescript
export function stripInlineComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) {
      if (line[i + 1] === "'") {
        i++; // skip escaped quote ''
      } else {
        inSingle = !inSingle;
      }
    } else if (ch === '"' && !inSingle) {
      if (line[i + 1] === '"') {
        i++; // skip escaped quote ""
      } else {
        inDouble = !inDouble;
      }
    } else if (ch === '-' && line[i + 1] === '-' && !inSingle && !inDouble) {
      return line.substring(0, i);
    }
  }
  return line;
}
```

1. **Decoupled Lightweight Version Metadata**:
   Separating metadata (`migrations_version.ts`) from the heavy SQL content (`migrations_data.ts`):
   - `migrations_version.ts` exports `CLIENT_DB_VERSION` (a simple integer) and `LATEST_MIGRATION_ID`. Client apps import this to check version status in $O(1)$ without importing megabytes of SQL text into the initial JavaScript bundle.
   - `migrations_data.ts` exports `DATABASE_MIGRATIONS`, which is only loaded lazily when migrations actually need to run.

2. **Client Bundle SQL Purge**:
   When a companion `.sqlite.sql` exists, the PostgreSQL `sql` string is set to `''` in the client manifest. Because browser clients run WebAssembly SQLite, shipping PL/pgSQL functions or PostgreSQL triggers into browser bundles is dead weight.

3. **Two-Step Pre-Commit Certification Pipeline**:
   When executed via CLI (e.g. `node scripts/database/generate_migrations.ts`), the runner must automatically trigger:
   - Step 1: Static syntax, monotonicity, and comment audit (running the project's static SQL validator).
   - Step 2: Compatibility testing against the latest production backup fixture (running the real backup migration test suite).
   If either fails, the migration is rejected with exit code 1.
