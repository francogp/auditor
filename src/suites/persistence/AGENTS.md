# Purpose

Persistence integrity and database static analysis suites for `@francogp/auditor`. Enforces schema integrity, SQL anti-patterns, and database security rules.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **SQL Anti-Patterns**: Banned practices include direct JSON array positional updates, undeclared PL/pgSQL loop variables, and bypassing persistence routers.
- **Naming Conventions**: Database payloads and column mappings must follow `snake_case`.

## Key Files

- [`validate_sql_anti_patterns.ts`](./validate_sql_anti_patterns.ts): SQL anti-pattern, schema qualification, and persistence validator.

## Child DOX Index

- _This directory contains persistence sub-auditor suites with no subdirectories._
