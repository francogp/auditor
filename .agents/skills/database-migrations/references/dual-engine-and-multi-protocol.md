# Dual-Engine Synchronization & Multi-Protocol Architecture

Modern web and enterprise applications often bridge offline client persistence with distributed cloud databases. This reference details how to structure a dual-engine architecture without data desynchronization or leaky abstractions.

---

## 1. Engine & Protocol Topology

A dual-persistence system typically spans two fundamentally different database engines operating across disparate protocols:

| Dimension | Offline / Client Engine | Cloud / Server Engine |
| :--- | :--- | :--- |
| **Engine** | SQLite (WebAssembly, OPFS, in-memory `node:sqlite`) | PostgreSQL 16+ (Supabase, Amazon RDS, etc.) |
| **Protocols** | Direct synchronous C/WASM function calls, local file I/O | HTTP REST (PostgREST), WebSockets (Realtime), direct TCP connection pooling (`postgres`, `pg`, `psql`) |
| **Execution Context** | Web browser, mobile webview, headless unit tests | Microservices, serverless edge functions, CLI administration scripts |
| **Security Model** | Client-isolated sandbox (IndexedDB / Origin Private File System) | Row-Level Security (RLS), RBAC, JWT claims, role execution privileges |

---

## 2. The Database Router Pattern (`DBRouter`)

Directly referencing Supabase or SQLite inside UI components or services tightly couples domain logic to infrastructure. Instead, implement a **Database Router** (`DBRouter`) acting as an abstraction facade:

1. **Session Isolation**:
   A user session MUST execute in either `online` mode or `offline` mode. Never interleave simultaneous uncoordinated writes between the local SQLite instance and the remote PostgreSQL server in the same active session.
2. **Dynamic Client Resolution**:
   - In `online` mode: Dispatches requests through the `@supabase/supabase-js` client using signed JWT tokens and PostgREST endpoints.
   - In `offline` mode: Delegates queries to a local SQLite query builder.
3. **Fluent Query Translation (`ProxyQuery`)**:
   Provide a unified fluent builder so application code remains identical across modes:

   ```typescript
   // Consuming code does not know or care which engine is active:
   const rows = await dbRouter
     .from('invoices')
     .select('id, amount, status')
     .eq('status', 'pending')
     .order('created_at', { ascending: false });
   ```

---

## 3. SQL Translation vs Companion Files

PostgreSQL and SQLite have divergent DDL capabilities and grammar. To synchronize schema migrations across both engines, utilize a hybrid strategy:

```text
database/migrations/
├── 20261001120000_create_invoices.sql              <-- Generic DDL (Auto-translated to SQLite)
├── 20261002150000_lockdown_security_rpc.sql         <-- PostgreSQL PL/pgSQL & RLS
└── 20261002150000_lockdown_security_rpc.sqlite.sql  <-- Companion SQLite file
```

### Strategy A: Companion `.sqlite.sql` Files (Complex Logic)

Whenever a migration introduces:

- PostgreSQL-specific constructs: `CREATE OR REPLACE FUNCTION ... RETURNS ... LANGUAGE plpgsql`, triggers, advisory locks.
- Complex JSONB operators: `jsonb_set`, `jsonb_agg`, `#>>`, `jsonb_array_elements`.
- Row-Level Security: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`.
- Server-side administrative roles: `GRANT`, `REVOKE`, `SECURITY DEFINER`.

Author an explicit companion file `<timestamp>_<name>.sqlite.sql` containing equivalent SQLite syntax or simplified client logic.

### Strategy B: Automated DDL Translation (`sqlTranslator.ts`)

For standard structural migrations (`CREATE TABLE`, `ADD COLUMN`, indexes), an automated parser translates PostgreSQL DDL to SQLite in real time:

#### 1. Semicolon Splitting with Dollar-Quote Awareness

A simple `sql.split(';')` breaks on PL/pgSQL function bodies (`$$ BEGIN ...; END; $$`). The parser MUST track:

- `$$` dollar-quoted string blocks.
- Single-quoted string literals `'...'` and escaped single quotes `''`.
- Line comments (`--`) and block comments (`/* ... */`).

#### 2. Filtering Server-Only Statements (`SQL_SKIP_PATTERNS`)

When translating generic `.sql` files to SQLite, drop statements irrelevant to SQLite:

```typescript
const SQL_SKIP_PATTERNS = [
  'CREATE FUNCTION',
  'CREATE OR REPLACE FUNCTION',
  'DROP FUNCTION',
  'DO $$',
  'CREATE POLICY',
  'DROP POLICY',
  'ALTER PUBLICATION',
  'COMMENT ON',
  'CREATE TRIGGER',
  'DROP TRIGGER',
  'CREATE EXTENSION',
  'REVOKE',
  'GRANT',
  'ALTER FUNCTION'
] as const;
```

#### 3. Type and Expression Mapping

Translate PostgreSQL keywords into SQLite equivalents:

- **Data Types**: `JSONB` -> `TEXT`, `UUID` -> `TEXT`, `TIMESTAMPTZ` -> `TEXT`, `BIGINT` -> `INTEGER`.
- **Auto Increment**: `SERIAL PRIMARY KEY` or `BIGSERIAL PRIMARY KEY` -> `INTEGER PRIMARY KEY AUTOINCREMENT`.
- **Casts**: Strip `::jsonb`, `::uuid`, `::text`, `::timestamptz`.
- **Temporal Functions**: `NOW()` -> `strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`.
- **Identifiers**: `gen_random_uuid()` -> `hex(randomblob(16))`.
- **Booleans**: `TRUE` -> `1`, `FALSE` -> `0`.
- **Column Constraints**: `ADD COLUMN IF NOT EXISTS` -> `ADD COLUMN` (older SQLite compatibility).
- **Foreign Keys**: `REFERENCES auth.users` -> `REFERENCES profiles`.
