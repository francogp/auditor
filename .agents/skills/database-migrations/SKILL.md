---
name: database-migrations
description: "Comprehensive database migration systems, incremental schema evolution, dual-engine synchronization (PostgreSQL + SQLite), in-memory fixture testing, and fail-loud architecture. Make sure to use this skill whenever the user mentions database migrations, SQL migrations, db:migrate, altering tables, writing schema changes, testing migrations, verifying migrations on legacy fixtures, in-memory SQLite testing, dual database persistence, system_config db_version tracking, or debugging PostgreSQL/SQLite migration errors, even if they do not explicitly say 'database-migrations'."
license: MIT
metadata:
  author: Franco Gastón Pellegrini
  organization: FrancoGP Core Architecture
  date: October 2026
---

# Database Migration Systems & Evolution Governance

Architectural framework and operational standards for building, testing, and verifying rock-solid, zero-drift database migrations.

---

## 🎯 Progressive Disclosure Map

Read ONLY the specific reference file needed for your current task:

| Reference / Asset | Focus Area | When to Read |
| :--- | :--- | :--- |
| [`references/incremental-patching-and-generators.md`](./references/incremental-patching-and-generators.md) | DDL vs Generator-driven migrations, 14-digit naming, manifest compilation | Creating or generating new migrations |
| [`references/dual-engine-and-multi-protocol.md`](./references/dual-engine-and-multi-protocol.md) | PostgreSQL + SQLite sync, `DBRouter`, `ProxyQuery`, `.sqlite.sql` companions | Dual-persistence or offline/online apps |
| [`references/common-version-tracking-table.md`](./references/common-version-tracking-table.md) | Two-tier versioning, `system_config.db_version`, $O(1)$ startup checks | Versioning or tracking schema state |
| [`references/in-memory-fixture-testing.md`](./references/in-memory-fixture-testing.md) | Fast (5–20ms) testing on ancient fixtures with `node:sqlite`, schema parity | Writing unit tests for migrations |
| [`references/fail-loud-and-dox-guardrails.md`](./references/fail-loud-and-dox-guardrails.md) | Fail-Loud Mandate, no `EXCEPTION`, `ON_ERROR_STOP=1`, PostgreSQL syntax traps | Reviewing or debugging SQL migrations |
| [`references/preflight-and-ephemeral-testing.md`](./references/preflight-and-ephemeral-testing.md) | Transactional dry-runs (`BEGIN...ROLLBACK`), ephemeral Docker PostgreSQL testing | Staging/deploy validation pipelines |

### 🛠️ Executable Code Examples

- [`examples/in-memory-step-test.ts`](./examples/in-memory-step-test.ts): Runnable in-memory test harness with `node:sqlite`.
- [`examples/migration-generator-sample.ts`](./examples/migration-generator-sample.ts): Code-driven migration generator from TypeScript SSoT.
- [`examples/static-migration-auditor.ts`](./examples/static-migration-auditor.ts): Static AST and regex migration auditor.
- [`examples/preflight-dryrun-runner.ts`](./examples/preflight-dryrun-runner.ts): Transactional dry-run pre-flight runner.
- [`examples/sql-translator-helper.ts`](./examples/sql-translator-helper.ts): Dollar-quote-aware statement splitter and dialect translator.

---

## 🛡️ The 7 Core Mandates of Migration Systems

### 1. Zero Error Suppression Mandate (Fail Loudly & Fast)

Migrations MUST NEVER swallow, catch, ignore, or mask database errors using empty exception blocks (`BEGIN ... EXCEPTION WHEN ... THEN NULL; END;`).

- All errors must be noisy, visible, and fatal.
- CLI runners must pass `-v ON_ERROR_STOP=1` to prevent `psql` from continuing on failure.
- If a migration statement throws, the runner must rollback immediately and abort with exit code 1.

### 2. Strictly Monotonic Forward-Only Migrations

- Filenames must follow `YYYYMMDDHHmmss_<action>_<subject>.sql` (14-digit UTC timestamp).
- Every timestamp must be strictly greater than the previous timestamp (`timestamp > previousTimestamp`).
- Historical committed migrations are **IMMUTABLE**. Never modify past migration files; always roll forward with a new timestamped patch.

### 3. Two-Tier Version Tracking (`system_config` + `_migrations`)

- **Tier 1 (Audit Ledger)**: Append-only table (`_migrations` or `schema_migrations`) records every individual applied file. An ID is inserted ONLY after the migration commits successfully.
- **Tier 2 (Global State)**: Configuration table (`system_config`) stores key `db_version` containing the latest 14-digit timestamp. Enables $O(1)$ client startup checks without loading heavy migration SQL chunks.

### 4. Dynamic Generators for TypeScript-Derived Data

Whenever migration logic or data backfills depend on application constants (whitelists, roles, catalogs, tariff structures):

- NEVER copy-paste arrays into SQL manually.
- Author a generator script (`scripts/database/generate_<name>_migration.ts`) importing the TypeScript SSoT and emitting coordinated PostgreSQL and SQLite migration pairs.

### 5. Multi-Protocol Dual-Engine Decoupling (`DBRouter`)

In dual-persistence environments (e.g. offline SQLite WASM vs online PostgreSQL Supabase):

- Abstract database operations through a unified `DBRouter` with strict session isolation.
- Use `.sqlite.sql` companion files for PostgreSQL-specific features (functions, triggers, RLS).
- Use `sqlTranslator.ts` with dollar-quote (`$$`) awareness for generic DDL statements.
- Purge PostgreSQL SQL (`sql: ''`) from client bundles when companion `.sqlite.sql` files exist.

### 6. Hermetic In-Memory Fixture Verification

Every migration pipeline MUST be verified against an ancient production snapshot:

- Rehydrate historical JSON backups or baseline schemas into Node.js 26+ `DatabaseSync(':memory:')`.
- Apply all pending migrations step-by-step in isolated transactions.
- Assert 100% data integrity post-migration: zero `[object Object]` strings, strict domain schema parsing, and structural schema parity (`db_schema_parity.test.ts`).

### 7. PostgreSQL Engine Traps Awareness

- **Return Type Mutation**: Changing the return type of an existing function requires an explicit `DROP FUNCTION IF EXISTS <name>(<args>)` before the replacement `CREATE FUNCTION`.
- **Parser Desugared Keywords**: Keywords (`TRIM`, `NULLIF`, `COALESCE`, `GREATEST`, `LEAST`) must NEVER be qualified with `pg_catalog.` (`pg_catalog.nullif` does not exist).
- **Search Path**: All `SECURITY DEFINER` functions must specify `SET search_path = ''`.
- **InitPlan Optimization**: RLS policies must wrap auth functions in scalar subqueries `(SELECT auth.uid())`.

---

## 🧭 Testing Decision Matrix

Choose the appropriate testing harness based on the execution context:

| Context | Recommended Harness | Engine | Execution Time | Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Unit Tests & Fast In-Dev Checks** | In-Memory Step-by-Step (`examples/in-memory-step-test.ts`) | `node:sqlite` (`DatabaseSync`) | ~2–10ms | Hermetic fixture data migration, schema parity, data validation |
| **Pre-Commit Migration Certification** | Static AST Auditor (`examples/static-migration-auditor.ts`) | Pure Node.js Regex/AST | ~5ms | Monotonicity, syntax guardrails, return types, `db_version` sync |
| **Pre-Deployment Dry-Run** | Pre-Flight Transactional (`examples/preflight-dryrun-runner.ts`) | Live DB Connection | ~50–200ms | Tests `BEGIN ... ROLLBACK` on active DB with zero state mutation |
| **Full Regression / CI Testing** | Live Ephemeral Container (`references/preflight-and-ephemeral-testing.md`) | Docker PostgreSQL 16+ | ~1–5s | Full sequential execution from `baseline_schema.sql` to latest |

---

## 🌐 Dynamic Language Governance (Zero Hardcoding)

- The agent MUST dynamically consult `.auditor/audit.config.ts` to determine the configured languages:
  - **AI Chat & Conversational Language (`config.documentation.chatLanguage`)**: Governs all interactive chat communication, user interviews, options matrices, `ask_question` dialogs, AND narrative explanations in user-facing proposal artifacts. The agent converses strictly in the language resolved from `config.documentation.chatLanguage`.
  - **Documentation & File Writing Language (`config.documentation.language`)**: Governs code, code comments, commit messages, git tags, documentation files, and DOX indices (`AGENTS.md`). The agent writes files strictly in the language resolved from `config.documentation.language`.
- **Zero Language Mixing & Zero Hardcoding**: Skills and agents MUST NEVER hardcode language names or assume fixed languages. The AI agent must dynamically resolve these settings from configuration and never confuse or conflate the chat communication language with the repository file writing language.
