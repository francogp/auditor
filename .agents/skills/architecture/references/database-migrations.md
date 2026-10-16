# Database Migration Systems & Evolution Governance

This document establishes the architectural standards, reliability invariants, and testing methodologies for database schema migrations and multi-engine persistence evolution across projects governed by `@francogp/auditor`.

---

## 1. Zero-Drift Database Evolution Standards

Repositories managing persistent schemas must adhere to five mandatory invariants:

### 1.1. Absolute Prohibition of Migration Error Suppression

All database schema migrations must fail loudly upon encountering any syntax, constraint, type mismatch, or transaction error:

- Catching errors without re-throwing, swallowing migration failures, or applying `// catch-ok` bypass annotations to schema migrations is **strictly forbidden**.
- Any migration error must immediately abort the migration runner, rollback the transaction, and exit with a non-zero status.

### 1.2. In-Memory Step-by-Step Test Verification (< 2ms)

Every migration step must be covered by automated in-memory unit tests:

- Tests apply migrations sequentially from an initial baseline fixture to the target schema version.
- Executed against ephemeral in-memory databases (e.g. SQLite `:memory:` or mock Postgres drivers).
- Execution runtime must remain sub-millisecond (< 2ms per migration test) to guarantee instantaneous test runs.

### 1.3. Incremental Sequential Patch Generation & Atomic Transactions

- Migrations must be structured as ordered, sequential files (e.g. `001_initial.sql`, `002_add_index.sql`).
- Each migration must execute within an atomic transaction (`BEGIN TRANSACTION` ... `COMMIT`) ensuring zero half-migrated states if a statement fails.

### 1.4. Dialect-Safe Dual-Engine Synchronization (PostgreSQL + SQLite)

For applications supporting dual persistence engines:

- DDL syntax must be validated against both SQLite and PostgreSQL dialects where applicable.
- Features unsupported in one dialect (e.g. Postgres-specific `JSONB` or SQLite-specific constraints) must be abstracted or handled with explicit dialect adapters.

### 1.5. Single Source of Truth (SSoT) Version Tracking

The active database schema version must be tracked in a unified system configuration table:

- Stored in `system_config.db_version`.
- Evaluated prior to application startup to detect missing or outdated migrations, failing loudly with explicit remediation instructions if the schema is out of sync.
