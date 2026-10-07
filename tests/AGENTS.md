# Purpose

Hermetic unit and integration tests for `@francogp/auditor`. Executed under Vitest in Node.js environment. Guarantees 100% test coverage across all sub-auditor rules, BaseAuditor lifecycle methods, CLI scripts, and architecture conformance.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Hermetic Isolation**: Tests must never scan the live repository root. They must use `testScanFile(...)` or isolated temporary sandboxes via `projectRoot: tempDir`.
- **Negative Verification Mandate**: Every test file must include a test asserting that compliant code yields exactly 0 errors and `status: 'passed'` (`missing-clean-auditor-test`).
- **Complete RuleId Coverage & Rule Description Verification**: Every declared rule ID in `ruleDescriptions` of every sub-auditor has dedicated dirty fixture assertions for both error and warning severities. `validate_auditor_tests.ts` statically enforces that 100% of declared rules are exercised by corresponding test files.
- **Mandatory Constructor Metadata Enforcement Tests**: `tests/auditor_contract_enforcement.test.ts` rigorously proves the impossibility of instantiating `BaseAuditor` or registering extensions without mandatory `configKey` and `defaultConfig` (with explicit boolean `enabled`).
- **Idempotent Injection & Anti-Duplication Pruning Tests**: `tests/validate_agents_config_mandate.test.ts` and `tests/validate_documentation_language.test.ts` rigorously test and prove that auto-repair operations in `AGENTS.md` never duplicate mandates or whitespace across repeated fix runs.

## Key Files

- [`agents_mandate_analyzer.test.ts`](./agents_mandate_analyzer.test.ts): Tests for AGENTS.md mandate parsing, language validation, and in-place injection helper.
- [`all_auditors_contract_conformance.test.ts`](./all_auditors_contract_conformance.test.ts): Dynamic 5-point contract conformance test across all discovered suites.
- [`auditor_architecture_conformance.test.ts`](./auditor_architecture_conformance.test.ts): Meta-test verifying 100% companion test coverage and rule descriptors.
- [`auditor_base.test.ts`](./auditor_base.test.ts): Tests for `BaseAuditor` and `FileScanAuditor` base class lifecycle.
- [`auditor_capabilities.test.ts`](./auditor_capabilities.test.ts): Tests for dynamic sub-auditor capability detection, zero-boilerplate inheritance, and fix mode filtering.
- [`auditor_contract_enforcement.test.ts`](./auditor_contract_enforcement.test.ts): Rigorous verification of mandatory constructor metadata contract, dynamic gating, and dynamic scaffolding.
- [`audit_build.test.ts`](./audit_build.test.ts): Tests for post-build compiled artifact audit runner (`auditor-build`, `preset=build`).
- [`audit_bundle.test.ts`](./audit_bundle.test.ts): Tests for `audit_bundle.ts` treemap parsing and budget enforcement.
- [`audit_ratchet.test.ts`](./audit_ratchet.test.ts): Git-sandbox tests for the warning ratchet (fingerprint stability, new-warning detection, shrink-only baseline, tamper rejection).
- [`audit_metadata_contract.test.ts`](./audit_metadata_contract.test.ts): Verification of `AuditRunMetadata` serialization and freshness.
- [`config_file_registry.test.ts`](./config_file_registry.test.ts): Tests for centralized `ConfigFileRegistry`, declarative sub-auditor configuration requirements, and auto-scaffolding in fix mode.
- [`report_coverage_map.test.ts`](./report_coverage_map.test.ts): Tests for audit coverage map CLI and reporting.
- [`report_test_coverage.test.ts`](./report_test_coverage.test.ts): Tests for test execution coverage reporting CLI.
- [`streaming_runner.test.ts`](./streaming_runner.test.ts): Tests for out-of-order immediate console streaming and atomic print lock.
- [`streaming_row_colorization.test.ts`](./streaming_row_colorization.test.ts): Tests for streaming row colorization based on error vs warning presence.
- [`test_coverage_core.test.ts`](./test_coverage_core.test.ts): Tests for coverage metric calculation, unmapped file detection, and parsing.
- [`validate_accessibility.test.ts`](./validate_accessibility.test.ts): Tests for WCAG 2.2 accessibility verification via `eslint-plugin-vuejs-accessibility`.
- [`validate_agents_config_mandate.test.ts`](./validate_agents_config_mandate.test.ts): Tests for mandatory architecture and anti-tampering configuration clauses in root `AGENTS.md`.
- [`validate_documentation_language.test.ts`](./validate_documentation_language.test.ts): Tests for documentation language verification, root AGENTS mandate auto-fix and modernization, and exemption matching.
- [`validate_audit_config.test.ts`](./validate_audit_config.test.ts): Tests for `.auditor/` configuration integrity (paths, scripts, ratchet ref and baseline) and the AST-based migration of root-level configs.
- [`validate_dox_integrity.test.ts`](./validate_dox_integrity.test.ts): Tests for DOX hierarchy completeness, mandatory sections order, and empty section rejection.
- [`validate_eslint_config.test.ts`](./validate_eslint_config.test.ts): Tests for ESLint Domain-Type-First configuration enforcement.
- [`validate_dependency_vulnerabilities.test.ts`](./validate_dependency_vulnerabilities.test.ts): Tests for dependency CVE vulnerability scanning via npm audit.
- [`validate_package_distribution.test.ts`](./validate_package_distribution.test.ts): Tests for package export map and type distribution hygiene via Publint.
- [`validate_package_hygiene.test.ts`](./validate_package_hygiene.test.ts): Tests for orphan dependency and unused script detection via Knip.
- [`validate_package_types.test.ts`](./validate_package_types.test.ts): Tests for package types resolution and dual-package hazard checks via ATTW.
- [`validate_secret_leaks.test.ts`](./validate_secret_leaks.test.ts): Tests for high-entropy secret, API key, and token leak detection via Secretlint.
- [`validate_similar_code.test.ts`](./validate_similar_code.test.ts): Tests for semantic and structural code similarity verification.
- [`validate_stylelint.test.ts`](./validate_stylelint.test.ts): Tests for Stylelint CSS/SCSS hygiene, nesting, Vue 3 SFCs, and configuration overrides.
- [`validate_test_coverage.test.ts`](./validate_test_coverage.test.ts): Tests for test execution coverage thresholds and uncovered files detection.
- [`validate_type_coverage.test.ts`](./validate_type_coverage.test.ts): Tests for quantitative TypeScript type coverage threshold enforcement.
- [`validate_valibot_parity.test.ts`](./validate_valibot_parity.test.ts): Tests for Valibot schema and save persistence parity validator.
- [`version_bump.test.ts`](./version_bump.test.ts): Tests for SemVer bump calculation, build timestamp formatting, and git diff heuristics.

## Work Guidance

- Test fixtures must be isolated from the live repository using temporary scratch directories or virtual file inputs.
- Always include clean path tests verifying that valid code produces 0 errors and status 'passed'.
- Concatenate banned strings (such as banned import tokens) in fixtures to prevent static scanners from misidentifying test fixtures as live code violations.

## Verification

- Run full test suite: `npm test`
- Run architecture conformance tests: `npm test -- tests/auditor_architecture_conformance.test.ts`

## Child DOX Index

- _This directory contains flat unit test suites with no subdirectories._
