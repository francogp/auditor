# Built-in Auditor Suites Catalog

This reference provides the comprehensive taxonomy and architectural grouping of official sub-auditor suites in `@francogp/auditor`.

---

## Architectural Families (`src/suites/`)

Official suites are discovered dynamically across 6 core architectural families:

### 1. `architecture/`

- **AST and Code Hygiene**: AST rules, TypeScript type coverage, Vue SFC syntax hygiene, code simplification, SCSS architecture, and component styles.
- **Satellite Configurations**: HTML-Validate, Stylelint, Vite+ configuration (`validate_vite_plus_config`), Git configuration, and Auditor hygiene (`validate_auditor_hygiene`).
- **Contract and Ecosystem Verification**: CLI contracts (`validate_cli_contracts` / `citty`), Knip package hygiene, Publint distribution checks, WCAG accessibility, vector semantic duplication (`validate_similar_code`), test execution coverage (`validate_test_coverage`), and AGENTS integrity.

### 2. `domain_data/`

- **Algorithmic Optimizations**: O(1) data structures, Set hoists, and map lookups.
- **Domain Modeling**: Canonical domain catalogs, nominal branded types, and Domain-Type-First contract compliance.

### 3. `performance/`

- **Web & Runtime**: Web performance optimization, Core Web Vitals, asset payload budgets, and execution bottlenecks.
- **Database**: Query performance and indexing verification.

### 4. `security/`

- **Hardening**: Static security analysis, secret leak eradication, input sanitization, and dependency CVE vulnerability audits.

### 5. `persistence/`

- **Storage Standards**: Client Web Storage hygiene, SQL schema anti-patterns, and Valibot schema/serializer bidirectional parity.

### 6. `documentation/`

- **Documentation Hygiene**: Documented command authenticity (`validate_documented_commands`), Markdown links, DOX hierarchy (`AGENTS.md`), documentation language consistency, markdown lint, and Mermaid diagram syntax.

---

## Host Project Extensions (`scripts/auditors/`)

Domain-specific rules unique to host applications reside in `scripts/auditors/` extending `BaseAuditor` or `FileScanAuditor`, inheriting identical lifecycle phases, error reporting, and Box-Drawing formatting.
