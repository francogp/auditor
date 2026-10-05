# Purpose

Command-line interfaces, orchestrators, and developer reporting tools for `@francogp/auditor`. Provides the full audit runner (`audit_full.ts`) with its built-in warning ratchet (`auditRatchet.ts`), production bundle visualizer analyzer (`audit_bundle.ts`), findings query reporters, and environment setup scripts.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Configuration Pre-Flight Validation**: All CLI orchestrators (`audit_full.ts`, `audit_bundle.ts`) MUST execute `assertAuditConfigComplete(config)` immediately after loading `audit.config.ts`, failing fast with exit code 1 if any mandatory subsystem is omitted.
- **Streaming Execution & Universal Sub-Auditor Disclosure**: The master orchestrator streams step-by-step progress and sub-auditor breakdown results for all suites via `BaseAuditor` / `ICompositeAuditor`, formatting live badges cleanly (silent when 0 findings, `(🐛 ${count})` when findings > 0) and writing full structured output to `scratch/audits/latest_audit.json`.
- **Capability-Driven Auto-Repair Mode (`--fix` / `fix`)**: When invoked with `fix` or `--fix`, the orchestrator (`audit_full.ts`) and scanner (`auditScanner.ts`) dynamically isolate and run only auto-repair suites (`capabilities.fix === true`) under a dedicated `[ 🛠️ MODO REPARACIÓN AUTOMÁTICA ]` terminal interface. Heavy suites (`capabilities.heavy === true`) are automatically bypassed in fast presets (`preset=lint`, `preset=md`).
- **Exit Code Integrity**: Any suite error exits with code 1; passing audits exit with code 0.
- **Warning Ratchet (`auditRatchet.ts`)**: On full default runs, `audit_full.ts` fingerprints every warning by content and fails on any fingerprint missing from `.auditor/audit-baseline.json` at `config.ratchet.productionRef` (default `origin/main`). The local baseline only shrinks (auto-rewritten on clean full runs); tampered or missing baselines fail loudly; `--init-baseline` bootstraps it once. Git is invoked with `spawnSync` argument arrays only (no shell interpolation).
- **Bundle Analysis**: `audit_bundle.ts` validates client assets against chunk size budgets and detects duplicate module bloat.
- **Similar-Code Cache Execution & CI Bypass (`AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1`)**: `audit_full.ts` orchestrates `validate_similar_code` using OS vector caches (`models/`, `vectors/`) and CPU threading. On setup failure, it renders a prominent Box-Drawing warning banner with the manual installation command (`npx fallow similar-code setup --local --yes`). It supports the environment variable `AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1` (or `AUDIT_SKIP_SIMILAR=1`) to cleanly omit vector embeddings analysis in GitHub Pages or lightweight CI builds without requiring model downloads or breaking pipelines. There is no CLI flag.
- **Dynamic Thematic Emoji Propagation**: `auditScanner.ts` extracts mandatory `icon` properties directly from sub-auditor classes or instances during auto-discovery, ensuring every task in the streaming runner displays its dedicated visual symbol.
- **Transparent Skip Rendering (`⏭️  SKIP`)**: `audit_full.ts` detects bypassed or skipped suites, clears default rule descriptions, and streams `⏭️  SKIP` in cyan with skip reasons rather than falsely reporting passed status.

## Key Files

- [`audit_build.ts`](./audit_build.ts): Post-build compiled artifact auditor (`auditor-build`, `preset=build`) validating dist bundles and package distribution.
- [`audit_bundle.ts`](./audit_bundle.ts): Bundle budget and duplicate module analyzer parsing `rollup-plugin-visualizer` treemaps.
- [`migrateAuditConfig.ts`](./migrateAuditConfig.ts): `auditor fix` relocation of root-level configs into `.auditor/` with AST-based relative import rebasing.
- [`auditRatchet.ts`](./auditRatchet.ts): Warning ratchet engine (fingerprints, production baseline loading, shrink-only persistence).
- [`audit_full.ts`](./audit_full.ts): Master auditor orchestrator executing discovered suites.
- [`auditScanner.ts`](./auditScanner.ts): Automatic suite discovery and filtering engine.
- [`bump_version.ts`](./bump_version.ts): CLI for `auditor-version` (`analyze`, `bump`, `-v`, `--json`).
- [`check_environment.ts`](./check_environment.ts): Runtime and tooling environment validator.
- [`cliUtils.ts`](./cliUtils.ts): Shared utilities for CLI tools and entrypoint detection.
- [`init_agent.ts`](./init_agent.ts): Antigravity agent plugin and skills registrator (`.agents/skills.json` and `.agents/plugins.json`).
- [`make_executable.ts`](./make_executable.ts): Cross-platform utility applying executable permissions (`0o755`) to compiled CLI binaries in `dist/cli/` and purging orphaned compiled files in `dist/`.
- [`report_complexity.ts`](./report_complexity.ts): Cyclomatic and cognitive complexity reporter.
- [`report_coverage_map.ts`](./report_coverage_map.ts): Audit file and rule coverage map reporter (`auditor-coverage-map`).
- [`report_css.ts`](./report_css.ts): Interactive CLI tool (`auditor-css`) reporting CSS duplication, similar selectors, and token hygiene.
- [`report_fallow.ts`](./report_fallow.ts): Consolidated Fallow static analysis reporter.
- [`report_findings.ts`](./report_findings.ts): Interactive query tool (`auditor-findings`, `auditor-by-file`) for inspecting audit findings filtered by category, severity, directory, and hierarchical file/line tree view (`audit:by-file`).
- [`report_flags.ts`](./report_flags.ts): Feature flags usage, single-read sites, and retirement analysis CLI (`auditor-flags`).
- [`report_guard.ts`](./report_guard.ts): Pre-flight architecture boundaries and import guard CLI (`auditor-guard`).
- [`report_review.ts`](./report_review.ts): Differential architectural review tool leveraging Fallow code-review graphs.
- [`report_similar_code.ts`](./report_similar_code.ts): Box-drawing report tool for Fallow semantic and structural similar-code candidates.
- [`report_test_coverage.ts`](./report_test_coverage.ts): Test execution coverage reporter (`auditor-coverage`) with Box-Drawing tables and uncovered files detection.
- [`setup_env.ts`](./setup_env.ts): Environment configuration setup runner.
- [`stamp_version.ts`](./stamp_version.ts): Standalone CLI for generating and stamping `src/core/version.ts`.
- [`sync_env_scripts.ts`](./sync_env_scripts.ts): Synchronizer for environment setup scripts across OS environments.
- [`update_package.ts`](./update_package.ts): Native CLI updater (`auditor-update`) for updating `@francogp/auditor` across host repositories.

## Child DOX Index

- _This directory contains CLI entrypoint executables with no subdirectories._
