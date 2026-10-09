# Purpose

Persistence integrity and database static analysis suites for `@francogp/auditor`. Enforces schema integrity, SQL anti-patterns, and database security rules.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **SQL Anti-Patterns**: Banned practices include direct JSON array positional updates, undeclared PL/pgSQL loop variables, and bypassing persistence routers.
- **Dynamic Positional Array Columns**: `validate_sql_anti_patterns.ts` detects mutations against JSON arrays dynamically using `config.persistence.positionalArrayColumns`, ensuring zero project-specific column names in core.
- **Agnostic Storage Coordination & Hybrid Persistence Support**: Enforces coordinated persistence flows based on `config.persistence.engine` (including `'hybrid'` persistence combining SQLite and Supabase) without assuming specific host entity models or class names (`SafeStorage`), resolving migrations directories dynamically from `config.paths.migrationsDir` and engine type.
- **Naming Conventions**: Database payloads and column mappings must follow `snake_case`.
- **Valibot Schema & Persistence Parity Governance (`validate_valibot_parity.ts`)**: Enforces 100% bidirectional parity between TypeScript state interfaces, Valibot validation schemas, persistence serializers, and initial state factories via `config.valibot.targets`. Detects missing fields, unknown() type pollution, and redundant optional(nullable(...)) patterns without host hardcoding.

## Key Files

- [`validate_sql_anti_patterns.ts`](./validate_sql_anti_patterns.ts): SQL anti-pattern, schema qualification, and relational migrations validator.
- [`validate_persistence_client.ts`](./validate_persistence_client.ts): Client-side web storage (localStorage/sessionStorage), unhandled quota error, and untyped key governance auditor.
- [`validate_valibot_parity.ts`](./validate_valibot_parity.ts): Valibot schema and persistence parity validator.

## Work Guidance

- Resolve database paths dynamically through `config.persistence` without hardcoding database names or tables.
- Respect engine gating: when `persistence.engine === 'none'`, mark persistence suites as cleanly skipped.
- Validate SQL syntax and structural anti-patterns without requiring active database connections.

## Verification

- Run persistence suite tests: `npm test -- tests/validate_sql_anti_patterns.test.ts tests/validate_valibot_parity.test.ts`
- Run general audit: `npm run auditor:lint`

## Child DOX Index

- _This directory contains persistence sub-auditor suites with no subdirectories._
