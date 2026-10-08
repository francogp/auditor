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
- **Similar-Code Cache Execution & CI Bypass (`AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1`)**: `audit_full.ts` orchestrates `validate_similar_code` using OS vector caches (`models/`, `vectors/`) and CPU threading. On setup failure, it renders a prominent Box-Drawing warning banner with the manual installation command (`fallow similar-code setup --local --yes`). It supports the environment variable `AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1` (or `AUDIT_SKIP_SIMILAR=1`) to cleanly omit vector embeddings analysis in GitHub Pages or lightweight CI builds without requiring model downloads or breaking pipelines. There is no CLI flag.
- **Introspection CLI Modes (`--list`, `--info`, `--json`, `--help`)**: `audit_full.ts` supports dynamic discovery flags: `--list` (80-column Box-Drawing overview table), `--list --json` (machine-readable array of `AuditorManifestDTO[]`), `--info=<suiteId>` (inspection card with purpose, capabilities, evaluated rules, and configuration key), and `--help` (interactive manual).
- **Dynamic Thematic Emoji Propagation**: `auditScanner.ts` extracts mandatory `icon` properties directly from sub-auditor classes or instances during auto-discovery, ensuring every task in the streaming runner displays its dedicated visual symbol.
- **Transparent Skip Rendering (`⏭️  SKIP`)**: `audit_full.ts` detects bypassed or skipped suites, clears default rule descriptions, and streams `⏭️  SKIP` in cyan with skip reasons rather than falsely reporting passed status.
- **CLI Flag Precedence & Loud Argument Validation (`bump_version.ts`)**: State-mutating CLI commands MUST intercept `--help` and `-h` flags before parsing positional arguments or executing mutations. Positional parameters and type arguments MUST be strictly validated against the finite domain using O(1) Set membership (`CLI_BUMP_TYPES`: `major`, `minor`, `patch`, `build`, `auto`), failing loudly with exit code 1 on unknown arguments and strictly banning silent fallback to defaults.
- **Dynamic Task Metadata Resolution (`auditTaskFactory.ts`)**: Task creation extracts mandatory `configKey` and `defaultConfig` directly from auditor instances or manifests, ensuring downstream execution engines and scaffolding routines have zero hardcoded knowledge of specific suite options.
- **Post-Build Compiled Artifact Partitioning (`audit_build.ts`)**: Default audit runs exclude suites with `capabilities.requiresBuild === true` (`validate_bundle_budget`, `validate_package_distribution`, `validate_package_types`), routing them to `audit_build.ts` (`npm run auditor:build` / `auditor-build`) to execute post-build against `dist/`.
- **Dynamic Configuration Scaffolding (`auditor fix`)**: When repairing or generating `.auditor/audit.config.ts`, `audit_full.ts` dynamically collects `task.defaultConfig` from all discovered tasks across the repository via `collectConfigSectionsFromTasks`, eliminating hardcoded configuration block lists.

## Key Files

- [`audit_build.ts`](./audit_build.ts): Post-build compiled artifact auditor (`auditor-build`, `preset=build`) validating dist bundles and package distribution.
- [`audit_bundle.ts`](./audit_bundle.ts): Bundle budget and duplicate module analyzer parsing `rollup-plugin-visualizer` treemaps.
- [`migrateAuditConfig.ts`](./migrateAuditConfig.ts): `auditor fix` relocation of root-level configs into `.auditor/` with AST-based relative import rebasing.
- [`auditRatchet.ts`](./auditRatchet.ts): Warning ratchet engine (fingerprints, production baseline loading, shrink-only persistence).
- [`auditScanner.ts`](./auditScanner.ts): Automatic suite discovery and filtering engine.
- [`auditTaskFactory.ts`](./auditTaskFactory.ts): Task definition creation, CLI argument builders, and permission resolution for audit tasks.
- [`auditorMetadata.ts`](./auditorMetadata.ts): Static and runtime auditor metadata extraction (capabilities, gitignore, icons).
- [`audit_full.ts`](./audit_full.ts): Master auditor orchestrator executing discovered suites.
- [`bump_version.ts`](./bump_version.ts): CLI for `auditor-version` (`analyze`, `bump`, `-v`, `--json`, `--help`, `--type=`, `--target-version=`).
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

## Work Guidance

- CLI scripts must use `isMainModule(import.meta.url)` from `cliUtils.ts` to detect direct execution.
- Maintain pure stream isolation when running child processes; avoid dumping large JSON over stdout.
- Ensure all interactive commands handle ANSI formatting and terminal width dynamically via `unifiedTheme`.

## Verification

- Run full audit CLI: `node --experimental-strip-types src/cli/audit_full.ts preset=md`
- Run list flag: `node --experimental-strip-types src/cli/audit_full.ts --list`
- Run unit tests: `npm test -- tests/audit_full.test.ts`

## Child DOX Index

- _This directory contains CLI entrypoint executables with no subdirectories._
