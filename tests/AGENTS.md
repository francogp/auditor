# Purpose

Hermetic unit and integration tests for `@francogp/auditor`. Executed under Vitest in Node.js environment. Guarantees 100% test coverage across all sub-auditor rules, BaseAuditor lifecycle methods, CLI scripts, and architecture conformance.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Hermetic Isolation**: Tests must never scan the live repository root. They must use `testScanFile(...)` or isolated temporary sandboxes via `projectRoot: tempDir`.
- **Negative Verification Mandate**: Every test file must include a test asserting that compliant code yields exactly 0 errors and `status: 'passed'` (`missing-clean-auditor-test`).
- **Complete RuleId Coverage & Rule Description Verification**: Every declared rule ID in `ruleDescriptions` of every sub-auditor has dedicated dirty fixture assertions for both error and warning severities. `validate_auditor_tests.ts` statically enforces that 100% of declared rules are exercised by corresponding test files.
- **Mandatory Constructor Metadata Enforcement Tests**: `tests/auditor_contract_enforcement.test.ts` and `tests/validate_critical_config.test.ts` rigorously prove the impossibility of instantiating `BaseAuditor` or registering extensions without mandatory `configKey`, `defaultConfig` (with explicit boolean `enabled`), and `criticalConfig`.
- **Idempotent Injection & Anti-Duplication Pruning Tests**: `tests/validate_agents_config_mandate.test.ts` and `tests/validate_documentation_language.test.ts` rigorously test and prove that auto-repair operations in `AGENTS.md` never duplicate mandates or whitespace across repeated fix runs.
- **Mandatory Universal Canary Testing Across All Scenarios Mandate**: Whenever testing any sub-auditor, rule, CLI command, or architectural checker, test suites MUST include dedicated canary tests (`describe('Canary Tests & Auto-Repair', ...)`) systematically exercising all operational scenarios: missing files/configurations, syntax errors and corrupted content, anti-castration enforcement of strict baselines, automated `--fix` scaffolding and repair idempotency, clean path compliance (0 errors, status passed), and clean conditional skips (status skipped). Writing tests that omit canary coverage across positive, negative, and auto-fix failure modes is strictly prohibited.
- **Single Test File Per Source Module**: New tests for a source module MUST be added to that module's existing test file instead of a new file, otherwise `validate_test_fragmentation` fails.

## Key Files

- [`agents_mandate_analyzer.test.ts`](./agents_mandate_analyzer.test.ts): Tests for AGENTS.md mandate parsing, language validation, and in-place injection helper.
- [`all_auditors_contract_conformance.test.ts`](./all_auditors_contract_conformance.test.ts): Dynamic 5-point contract conformance test across all discovered suites.
- [`all_auditors_ignores_conformance.test.ts`](./all_auditors_ignores_conformance.test.ts): Tests asserting uniform escape hatch and ignore directives across all sub-auditors.
- [`audit_executive_output.test.ts`](./audit_executive_output.test.ts): Tests for compact AI-friendly console theme output and summary rendering.
- [`auditor_architecture_conformance.test.ts`](./auditor_architecture_conformance.test.ts): Meta-test verifying 100% companion test coverage and rule descriptors.
- [`auditor_base.test.ts`](./auditor_base.test.ts): Tests for `BaseAuditor` and `FileScanAuditor` base class lifecycle.
- [`auditor_capabilities.test.ts`](./auditor_capabilities.test.ts): Tests for dynamic sub-auditor capability detection, zero-boilerplate inheritance, and fix mode filtering.
- [`auditor_contract_enforcement.test.ts`](./auditor_contract_enforcement.test.ts): Rigorous verification of mandatory constructor metadata contract, dynamic gating, and dynamic scaffolding.
- [`auditor_permissions_contract.test.ts`](./auditor_permissions_contract.test.ts): Tests for requiredPermissions constructor contract enforcement across all sub-auditors.
- [`auditor_subsystem_ignores.test.ts`](./auditor_subsystem_ignores.test.ts): Tests asserting subsystem-level ignore configuration adherence.
- [`audit_build.test.ts`](./audit_build.test.ts): Tests for post-build compiled artifact audit runner (`auditor-post-build`, `phase=post-build`).
- [`audit_bundle.test.ts`](./audit_bundle.test.ts): Tests for `audit_bundle.ts` treemap parsing and budget enforcement.
- [`audit_ratchet.test.ts`](./audit_ratchet.test.ts): Git-sandbox tests for the warning ratchet (fingerprint stability, new-warning detection, shrink-only baseline, tamper rejection).
- [`audit_metadata_contract.test.ts`](./audit_metadata_contract.test.ts): Verification of `AuditRunMetadata` serialization and freshness.
- [`cli_permission_execution.test.ts`](./cli_permission_execution.test.ts): Tests for Node.js Permission Model flag propagation and PERM0002 suppression.
- [`config_file_registry.test.ts`](./config_file_registry.test.ts): Tests for centralized `ConfigFileRegistry`, declarative sub-auditor configuration requirements, and auto-scaffolding in fix mode.
- [`config_ratchet.test.ts`](./config_ratchet.test.ts): Tests for unidirectional config ratchet, relaxation code hashing, and branded types.
- [`markdown_lint_config_remediations.test.ts`](./markdown_lint_config_remediations.test.ts): Tests for markdownlint configuration remediation and MD033 table line break auto-injection.
- [`native_paths_ignores.test.ts`](./native_paths_ignores.test.ts): Tests for native path and URL analyzer ignore comments and escape hatches.
- [`refactor_harness_compact.test.ts`](./refactor_harness_compact.test.ts): Tests for refactoring harness execution under compact console mode.
- [`report_coverage_map.test.ts`](./report_coverage_map.test.ts): Tests for audit coverage map CLI and reporting.
- [`report_test_coverage.test.ts`](./report_test_coverage.test.ts): Tests for test execution coverage reporting CLI.
- [`scanner_utils.test.ts`](./scanner_utils.test.ts): Tests for lexical scanner utilities, delimiter balancing, and multiline comment lookbacks.
- [`script_command_extractors.test.ts`](./script_command_extractors.test.ts): Tests for AST and syntax-aware command extraction across Shell, YAML, Dockerfile, PowerShell, and TypeScript scripts.
- [`similar_code_audit_target.test.ts`](./similar_code_audit_target.test.ts): Tests for similar-code package.json and audit.config.ts target attribute resolution.
- [`streaming_runner.test.ts`](./streaming_runner.test.ts): Tests for out-of-order immediate console streaming and atomic print lock.
- [`streaming_row_colorization.test.ts`](./streaming_row_colorization.test.ts): Tests for streaming row colorization based on error vs warning presence.
- [`stylelint_and_security_config_sync.test.ts`](./stylelint_and_security_config_sync.test.ts): Tests for stylelint and security configuration synchronization.
- [`test_coverage_core.test.ts`](./test_coverage_core.test.ts): Tests for coverage metric calculation, unmapped file detection, and parsing.
- [`transcript_authorization_verifier.test.ts`](./transcript_authorization_verifier.test.ts): Tests for Antigravity conversation transcript parsing, CI fallback, and tampering detection.
- [`validate_accessibility.test.ts`](./validate_accessibility.test.ts): Tests for WCAG 2.2 accessibility verification via AST template checks and living specification standards.
- [`validate_agents_config_mandate.test.ts`](./validate_agents_config_mandate.test.ts): Tests for mandatory architecture, anti-tampering configuration, and AI chat language clauses in root `AGENTS.md`.
- [`validate_documentation_language.test.ts`](./validate_documentation_language.test.ts): Tests for documentation language verification, root AGENTS mandate auto-fix and modernization, and exemption matching.
- [`validate_audit_config.test.ts`](./validate_audit_config.test.ts): Tests for `.auditor/` configuration integrity (paths, scripts, ratchet ref and baseline) and the AST-based migration of root-level configs.
- [`validate_cli_contracts.test.ts`](./validate_cli_contracts.test.ts): Tests for Citty CLI contract validation, banned parsers, homebrew flags, and positional arg normalization.
- [`validate_critical_config.test.ts`](./validate_critical_config.test.ts): Exhaustive tests for the mandatory AuditorCriticalConfig contract across BaseAuditor, manifests, constructor validation, and ValidateAuditConfigAuditor enforcement.
- [`validate_domain_types.test.ts`](./validate_domain_types.test.ts): Tests for nominal domain types, untyped collections, ambiguous unions, and chained literal comparisons.
- [`validate_native_paths.test.ts`](./validate_native_paths.test.ts): Tests for Node.js native path and standard URL AST architecture suite.
- [`validate_vite_plus_config.test.ts`](./validate_vite_plus_config.test.ts): Tests for Vite+ unified configuration and Domain-Type-First enforcement.
- [`validate_oxlint.test.ts`](./validate_oxlint.test.ts): Tests for Vite+ Oxlint and code hygiene validator.
- [`validate_dependency_vulnerabilities.test.ts`](./validate_dependency_vulnerabilities.test.ts): Tests for dependency CVE vulnerability scanning via npm audit.
- [`validate_package_hygiene.test.ts`](./validate_package_hygiene.test.ts): Tests for orphan dependency and unused script detection via Knip.
- [`validate_script_commands.test.ts`](./validate_script_commands.test.ts): Tests for npm run, direct npm commands, and npx binary verification in scripts, Dockerfiles, and CI/CD pipelines.
- [`validate_secret_leaks.test.ts`](./validate_secret_leaks.test.ts): Tests for high-entropy secret, API key, and token leak detection via Secretlint.
- [`validate_similar_code.test.ts`](./validate_similar_code.test.ts): Tests for semantic and structural code similarity verification.
- [`validate_stylelint.test.ts`](./validate_stylelint.test.ts): Tests for Stylelint CSS/SCSS hygiene, nesting, Vue 3 SFCs, and configuration overrides.
- [`validate_test_coverage.test.ts`](./validate_test_coverage.test.ts): Tests for test execution coverage thresholds and uncovered files detection.
- [`validate_type_coverage.test.ts`](./validate_type_coverage.test.ts): Tests for quantitative TypeScript type coverage threshold enforcement.
- [`validate_valibot_parity.test.ts`](./validate_valibot_parity.test.ts): Tests for Valibot schema and save persistence parity validator.
- [`validate_web_performance.test.ts`](./validate_web_performance.test.ts): Tests for web asset optimization and Core Web Vitals auditor.
- [`validate_query_performance.test.ts`](./validate_query_performance.test.ts): Tests for SQL indexing, query limits, and N+1 loop pattern detection.
- [`validate_security_hardening.test.ts`](./validate_security_hardening.test.ts): Tests for security hardening and OWASP Top 10 guardrails auditor.
- [`validate_code_simplification.test.ts`](./validate_code_simplification.test.ts): Tests for code simplification, boolean traps, and nesting reduction.
- [`validate_scss_architecture.test.ts`](./validate_scss_architecture.test.ts): Tests for SCSS architecture, :deep() governance, and theme token usage.
- [`version_bump.test.ts`](./version_bump.test.ts): Tests for SemVer bump calculation, build timestamp formatting, and git diff heuristics.

## Work Guidance

- Test fixtures must be isolated from the live repository using temporary scratch directories or virtual file inputs.
- Always include clean path tests verifying that valid code produces 0 errors and status 'passed'.
- Always author comprehensive canary tests covering all cases (missing config scaffolding, syntax errors, anti-castration enforcement, auto-repair, clean paths, and conditional skips).
- Concatenate banned strings (such as banned import tokens) in fixtures to prevent static scanners from misidentifying test fixtures as live code violations.

## Verification

- Run full test suite: `vp test` (or `npm test`)
- Run architecture conformance tests: `vp test tests/auditor_architecture_conformance.test.ts` (or `npm test -- tests/auditor_architecture_conformance.test.ts`)

## Child DOX Index

- [`core/refactor/AGENTS.md`](./core/refactor/AGENTS.md): Test suites and verification contracts for the deterministic code refactoring engine.
