# Purpose

Modular static analysis and architecture verification suites for `@francogp/auditor`. Contains 45 domain-agnostic suites organized across 4 canonical families: `architecture/`, `documentation/`, `domain_data/`, and `persistence/`.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Family Organization**: Every suite resides in its canonical family directory.
- **Suite Naming Convention**: Generic suites follow `validate_<topic>.ts`.
- **Inheritance Mandate**: Every suite extends `BaseAuditor` or `FileScanAuditor`.
- **Mandatory Thematic Emojis (`icon`)**: Every suite declares its dedicated thematic emoji representing its domain.
- **Zero Untested Rules**: Every suite has a corresponding test in `tests/<suite_filename>.test.ts`.

## Work Guidance

- Ensure all sub-auditors implement `toManifest()` accurately with description `<= 60` characters.
- Maintain pure Spanish `ruleDescriptions` composed as `${packageName}: ${ruleDescription}` under `<= 50` characters.
- Use explicit capabilities (`fix`, `lint`, `md`, `ast`) and avoid repeating default false flags.

## Verification

- Run all family suites: `npm test -- tests/validate_*.test.ts`
- Run lint preset suites: `node --experimental-strip-types src/cli/audit_full.ts preset=lint`

## Child DOX Index

- [`architecture/AGENTS.md`](./architecture/AGENTS.md): Architectural integrity suites (Vue, GSAP, CSS, Fallow, Z-index).
- [`documentation/AGENTS.md`](./documentation/AGENTS.md): Documentation integrity suites (DOX, links, markdownlint).
- [`domain_data/AGENTS.md`](./domain_data/AGENTS.md): Domain modeling and O(1) data structure suites.
- [`persistence/AGENTS.md`](./persistence/AGENTS.md): Persistence integrity and SQL anti-pattern suites.
