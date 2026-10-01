# Purpose

Domain data integrity and algorithmic efficiency suites for `@francogp/auditor`. Enforces nominal domain typing (`validate_domain_types.ts`) and constant-time $O(1)$ data structure usage (`validate_o1_data_structures.ts`).

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Domain-Type-First**: Finite entity sets must use nominal branded types or typed union constants rather than naked `string`.
- **Dynamic Domain Stems Derivation**: `validate_domain_types.ts` derives all allowed domain identifiers and param stems dynamically from `config.domain.finiteDomainTypes`, retaining zero hardcoded domain nouns in `@francogp/auditor`.
- **O(1) Efficiency**: Linear searches (`.includes()`, `find()`) in catalogs and cyclic object iterations are banned in favor of `Set.has()` and `Map.get()`.

## Key Files

- [`validate_domain_types.ts`](./validate_domain_types.ts): Domain-type-first validator parameterized via `audit.config.ts`.
- [`validate_o1_data_structures.ts`](./validate_o1_data_structures.ts): Algorithmic complexity and $O(1)$ data structure checker.

## Child DOX Index

- _This directory contains domain data sub-auditor suites with no subdirectories._
