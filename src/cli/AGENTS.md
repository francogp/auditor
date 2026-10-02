# Purpose

Command-line interfaces, orchestrators, and developer reporting tools for `@francogp/auditor`. Provides the full audit runner (`audit_full.ts`), pre-commit differential audit (`audit_for_commit.ts`), production bundle visualizer analyzer (`audit_bundle.ts`), findings query reporters, and environment setup scripts.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Configuration Pre-Flight Validation**: All CLI orchestrators (`audit_full.ts`, `audit_for_commit.ts`, `audit_bundle.ts`) MUST execute `assertAuditConfigComplete(config)` immediately after loading `audit.config.ts`, failing fast with exit code 1 if any mandatory subsystem is omitted.
- **Streaming Execution**: The master orchestrator streams step-by-step progress and writes full structured output to `scratch/audits/latest_audit.json`.
- **Exit Code Integrity**: Any suite error exits with code 1; passing audits exit with code 0.
- **Differential Pre-Commit Gate**: `audit_for_commit.ts` inspects Git diffs against target base branch (`origin/main`) and enforces zero new warnings or errors.
- **Bundle Analysis**: `audit_bundle.ts` validates client assets against chunk size budgets and detects duplicate module bloat.
- **Similar-Code Bypassing for CI/Deployments (`--skip-similar`)**: `audit_full.ts` and `auditScanner.ts` support `--skip-similar` (and `AUDIT_SKIP_SIMILAR=1`) to cleanly omit vector embeddings analysis in GitHub Pages or lightweight CI builds without requiring model downloads or breaking pipelines.

## Key Files

- [`audit_bundle.ts`](./audit_bundle.ts): Bundle budget and duplicate module analyzer parsing `rollup-plugin-visualizer` treemaps.
- [`audit_for_commit.ts`](./audit_for_commit.ts): Pre-commit differential auditor gatekeeper.
- [`audit_full.ts`](./audit_full.ts): Master auditor orchestrator executing discovered suites.
- [`auditScanner.ts`](./auditScanner.ts): Automatic suite discovery and filtering engine.
- [`bump_version.ts`](./bump_version.ts): CLI for `auditor-version` (`analyze`, `bump`, `-v`, `--json`).
- [`check_environment.ts`](./check_environment.ts): Runtime and tooling environment validator.
- [`cliUtils.ts`](./cliUtils.ts): Shared utilities for CLI tools and entrypoint detection.
- [`init_agent.ts`](./init_agent.ts): Antigravity agent plugin registrator.
- [`report_complexity.ts`](./report_complexity.ts): Cyclomatic and cognitive complexity reporter.
- [`report_fallow.ts`](./report_fallow.ts): Consolidated Fallow static analysis reporter.
- [`report_findings.ts`](./report_findings.ts): Interactive query tool for inspecting audit findings.
- [`report_review.ts`](./report_review.ts): Differential architectural review tool leveraging Fallow code-review graphs.
- [`report_similar_code.ts`](./report_similar_code.ts): Box-drawing report tool for Fallow semantic and structural similar-code candidates.
- [`setup_env.ts`](./setup_env.ts): Environment configuration setup runner.
- [`stamp_version.ts`](./stamp_version.ts): Standalone CLI for generating and stamping `src/core/version.ts`.
- [`sync_env_scripts.ts`](./sync_env_scripts.ts): Synchronizer for environment setup scripts across OS environments.
- [`update_package.ts`](./update_package.ts): Native CLI updater (`auditor-update`) for updating `@francogp/auditor` across host repositories.

## Child DOX Index

- _This directory contains CLI entrypoint executables with no subdirectories._
