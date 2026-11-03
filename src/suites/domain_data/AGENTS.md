# Purpose

Domain data integrity and algorithmic efficiency suites for `@francogp/auditor`. Enforces nominal domain typing natively via Oxlint plugin rules and constant-time $O(1)$ data structure usage (`validate_o1_data_structures.ts`).

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Domain-Type-First**: Finite entity sets must use nominal branded types or typed union constants rather than naked `string`, enforced natively in `validate_oxlint` and the `@francogp/domain-type` Oxlint plugin.
- **O(1) Efficiency**: Linear searches (`.includes()`, `find()`) in catalogs and cyclic object iterations are banned in favor of `Set.has()` and `Map.get()`.
- **AST Architecture & Zero-Escape Mandate**: Suites in this directory operate strictly under TypeScript AST (`ast: true`), inspecting `SourceFile` nodes rather than line-based regexes. Escape hatches are permanently eradicated; open textual properties and domain exemptions are governed cleanly via `config.domain`.
- **3-Tier Canary Test Protocol**: Every domain and O(1) rule enforces a 3-tier canary suite (Active Negative Canary, Boundary Validation Canary, and Clean Positive Canary).

## Key Files

- [`validate_o1_data_structures.ts`](./validate_o1_data_structures.ts): Algorithmic complexity and $O(1)$ data structure checker.

## Work Guidance

- Domain rules must strictly derive domain vocabularies dynamically from configuration (`config.domain`).
- Prohibit hardcoded host entity identifiers across AST scanners and heuristics.
- Ensure linear iteration bans in `validate_o1_data_structures.ts` do not produce false positives on tiny fixed tuples.

## Verification

- Run domain types migration tests: `vp test tests/oxlint_domain_types_migration.test.ts` (or `npm test -- tests/oxlint_domain_types_migration.test.ts`)
- Run O(1) structures suite tests: `vp test tests/validate_o1_data_structures.test.ts` (or `npm test -- tests/validate_o1_data_structures.test.ts`)

## Child DOX Index

- _This directory contains domain data sub-auditor suites with no subdirectories._
