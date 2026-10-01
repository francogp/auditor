# Purpose

Modular static analysis and architecture verification suites for `@francogp/auditor`. Contains 38 domain-agnostic suites organized across 4 canonical families: `architecture/`, `documentation/`, `domain_data/`, and `persistence/`.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Family Organization**: Every suite resides in its canonical family directory.
- **Suite Naming Convention**: Generic suites follow `validate_<topic>.ts`.
- **Inheritance Mandate**: Every suite extends `BaseAuditor` or `FileScanAuditor`.
- **Zero Untested Rules**: Every suite has a corresponding test in `tests/<suite_filename>.test.ts`.

## Key Files

- [`architecture/AGENTS.md`](./architecture/AGENTS.md): Architecture, Vue SFC, CSS, GSAP, and tooling suites.
- [`documentation/AGENTS.md`](./documentation/AGENTS.md): DOX hierarchy, Markdown links, and syntax validation suites.
- [`domain_data/AGENTS.md`](./domain_data/AGENTS.md): Nominal domain types and O(1) data structure suites.
- [`persistence/AGENTS.md`](./persistence/AGENTS.md): SQL anti-patterns and persistence integrity suites.

## Child DOX Index

- [`architecture/AGENTS.md`](./architecture/AGENTS.md): Architectural integrity suites (Vue, GSAP, CSS, Fallow, Z-index).
- [`documentation/AGENTS.md`](./documentation/AGENTS.md): Documentation integrity suites (DOX, links, markdownlint).
- [`domain_data/AGENTS.md`](./domain_data/AGENTS.md): Domain modeling and O(1) data structure suites.
- [`persistence/AGENTS.md`](./persistence/AGENTS.md): Persistence integrity and SQL anti-pattern suites.
