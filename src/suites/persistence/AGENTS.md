# Purpose

Persistence integrity and database static analysis suites for `@francogp/auditor`. Enforces schema integrity, SQL anti-patterns, and database security rules.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **SQL Anti-Patterns**: Banned practices include direct JSON array positional updates, undeclared PL/pgSQL loop variables, and bypassing persistence routers.
- **Dynamic Positional Array Columns**: `validate_sql_anti_patterns.ts` detects mutations against JSON arrays dynamically using `config.persistence.positionalArrayColumns`, ensuring zero project-specific column names in core.
- **Agnostic Storage Coordination & Hybrid Persistence Support**: Enforces coordinated persistence flows based on `config.persistence.engine` (including `'hybrid'` persistence combining SQLite and Supabase) without assuming specific host entity models or class names (`SafeStorage`), resolving migrations directories dynamically from `config.paths.migrationsDir` and engine type.
- **Naming Conventions**: Database payloads and column mappings must follow `snake_case`.

## Key Files

- [`validate_sql_anti_patterns.ts`](./validate_sql_anti_patterns.ts): SQL anti-pattern, schema qualification, and persistence validator.

## Work Guidance

- Resolve database paths dynamically through `config.persistence` without hardcoding database names or tables.
- Respect engine gating: when `persistence.engine === 'none'`, mark persistence suites as cleanly skipped.
- Validate SQL syntax and structural anti-patterns without requiring active database connections.

## Verification

- Run persistence suite tests: `npm test -- tests/validate_sql_anti_patterns.test.ts`
- Run general audit: `npm run audit:lint`

## Child DOX Index

- _This directory contains persistence sub-auditor suites with no subdirectories._
