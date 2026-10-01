# Purpose

Core standalone static analysis and architecture verification engine (`@francogp/auditor`). Provides the BaseAuditor framework, streaming runner, UnifiedTheme Box-Drawing reporting, CLI tools, AST context caching, and 36 built-in generic suites (including `validate_html_validate` for strict HTML5 standards, obsolete attributes, and markup hygiene).

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Domain Agnostic**: Zero coupling to utility billing or specific host business domains.
- **Node.js 26+ Native**: Executes under `--permission` model without external runtimes.
- **FrancoGP Namespace Mandate (`@francogp/*`)**: All generic packages and standalone tooling extracted across Franco's personal projects MUST use the `@francogp` namespace (`@francogp/auditor`), representing the author's handle (Franco Gastón Pellegrini). Using `@antigravity` or arbitrary vendor names is strictly prohibited.
- **Single Source of Truth Configuration**: Dynamically loads paths, persistence settings, and host extensions via `audit.config.ts`.
- **Hermetic Testing & Negative Verification**: Framework unit tests reside in `tests/` and execute in Vitest `node` environment. Every test suite MUST include clean path verification (`errors).toBe(0)` and `status).toBe('passed')`). `validate_auditor_tests` enforces `missing-clean-auditor-test` as `severity: 'error'` across all core suites and host extensions.
- **Zero Live Repository Scanning in Unit Tests**: Sub-auditor unit tests MUST NEVER execute full workspace scans (`auditor.execute()`) directly on `process.cwd()` without isolation. They MUST test individual snippets with `testScanFile` followed by `await auditor.finishAudit()`, or instantiate the auditor with a temporary sandbox directory via `projectRoot`. Scanning the live host repository in unit tests leaks application code defects into testing infrastructure.
- **Fallow 100% Error Severity & Zero-Warning Mandate**: All Fallow findings (including large functions >60 LOC, refactoring targets, cyclomatic/cognitive complexity, code duplication, CWE security candidates, unused files/exports/members/types, and unresolved imports) MUST be mapped strictly to `severity: 'error'`. Downgrading any Fallow finding to `warning` is strictly prohibited across the entire auditor engine and its unit test suites.
- **Static Security Single Source of Truth**: Security vulnerability scanning across all host repositories and auditor packages is governed exclusively by **Fallow** (`fallow security`). ESLint MUST NOT be configured with security plugins (`eslint-plugin-security`), avoiding duplicate reporting and false positives on AST or filesystem operations.
- **Consolidated Box-Drawing Table Total Row Mandate**: All multi-category terminal tables rendering finding breakdowns (in `unifiedTheme.renderBoxTable`, `audit_full.ts`, `report_findings.ts`) MUST append a formatted `TOTAL CONSOLIDADO` footer row with a separating horizontal line (`├───┼───┤`), clearly displaying the sum of errors and warnings across all rows to prevent visual summation discrepancies and terminal cognitive friction.
- **Sub-Auditor Modular Description Constraint**: Every sub-auditor MUST declare `packageName` and pure Spanish rule descriptions without hardcoded package prefixes. Composed descriptions (`${packageName}: ${ruleDescription}`) MUST remain `<= 50` characters (`MAX_AUDITOR_DESCRIPTION_LENGTH = 50`) to guarantee clean, un-truncated rendering in 80-column console output.
- **Cross-Platform Native Build Tools Discovery (`validate_build_tools`, `cssAnalyzer`)**: Native build binaries (such as `css-checker` from `css-checker-kit`) must be discovered by querying `getCssCheckerCmd` across all cross-platform candidate locations: local `node_modules/.bin`, package-local bin dirs, the active Node executable directory (`process.execPath` / `nodeDir`), npm prefix (`npm config get prefix`), user bin paths (`~/.local/bin`, `%APPDATA%/npm`), and system `$PATH`. Sub-auditors verifying native build tooling MUST NEVER restrict Node directory checks to Windows or duplicate path lookup logic.
- **Configurable Bundle Chunk Exemptions (`config.bundle.exemptChunkPrefixes`)**: The bundle budget auditor (`validate_bundle_budget`) strictly checks production chunks in `dist/assets/` against main-thread client limits (max 2 MB error, 1.2 MB warning). Heavy Web Worker chunks running in background threads (e.g. `worker-vendor-pkmn-*`) or isolated static data modules MUST NOT be hardcoded inside `@francogp/auditor`. Instead, host projects configure legitimate background worker prefixes dynamically in root `audit.config.ts` via `bundle.exemptChunkPrefixes`.
- **Standard Living Specification Engines Over Handcrafted Regex Mandate**: When validating web standards, markup hygiene, accessibility, or obsolete HTML5 elements/attributes, the auditor framework and linters MUST NOT implement handcrafted manual regular expressions or arbitrary AST pattern lists (e.g. in ESLint). Sub-auditors MUST delegate to authoritative, actively maintained specification engines (`html-validate` with `html-validate-vue`) that embody the W3C / WHATWG Living Standard, bridging their output into canonical `AuditFinding[]` objects.
- **Child Process Stream Isolation & Ephemeral Scratch Output Mandate**: Sub-auditors invoking external CLI tools or linters (`html-validate`, `vue-tsc`, `fallow`) via child processes (`spawnSync`) MUST NEVER rely on piping large JSON payloads across standard output (`stdout`), as Node.js process exits can truncate unbuffered output streams. Instead, tools supporting direct file output MUST write raw JSON to an isolated ephemeral file in `scratch/audits/<family>/` (e.g. `-f json=scratch/audits/architecture/html-validate-raw.json`) and parse it cleanly from disk.
- **Canonical Tool Package Fallow Governance (`.fallowrc.json`)**: Tool packages distributing standalone CLI tools and AI skills must maintain a root `.fallowrc.json` declaring `entry` points, `ignorePatterns` (`skills/**`, `.agents/**`, `scratch/**`, `dist/**`, `tests/**`), and `ignoreDependencies` (for peer/CLI tools such as `css-checker-kit`, `fallow`, `html-validate`, `html-validate-vue`, `markdownlint-cli`, `rollup-plugin-visualizer`, `typescript`). This guarantees unskewed maintainability analysis (>= 90 score) while preserving strict zero-tolerance fallow gating.
- **Mandatory Explicit Configuration & Zero Silent Skips**: Host projects using the auditor MUST explicitly declare in `audit.config.ts` whether each subsystem is active (with valid parameters) or ignored (e.g. `bundle: { enabled: false }`, `styles: { zLayersEnabled: false }`, `persistence: { engine: 'none' }`). Sub-auditors MUST NEVER silently bypass checks due to missing files or missing configuration; if a subsystem is unconfigured, the auditor MUST fail with an explicit configuration error to immediately notify the project upon framework upgrades.

## Key Files

- [`src/index.ts`](./src/index.ts): Package main entrypoint exporting public framework API.
- [`src/core/auditorBase.ts`](./src/core/auditorBase.ts): Abstract base classes (`BaseAuditor`, `FileScanAuditor`).
- [`src/core/auditConfig.ts`](./src/core/auditConfig.ts): SSoT configuration loader (`getAuditConfig`, `defineAuditConfig`).
- [`src/core/unifiedTheme.ts`](./src/core/unifiedTheme.ts): Box-Drawing terminal rendering engine.
- [`src/cli/audit_full.ts`](./src/cli/audit_full.ts): Master audit orchestrator.
- [`src/cli/audit_for_commit.ts`](./src/cli/audit_for_commit.ts): Safe-commit diff gatekeeper.

## Child DOX Index

- [`docs/AGENTS.md`](./docs/AGENTS.md): Project documentation guides, host migration blueprints, and configuration examples.
- [`rules/AGENTS.md`](./rules/AGENTS.md): Antigravity plugin rules and guidelines for host projects.
- [`src/AGENTS.md`](./src/AGENTS.md): Framework source code index (core, CLI, analyzers, suites, plugin).
- [`tests/AGENTS.md`](./tests/AGENTS.md): Vitest unit test suites and hermetic verification tests.
