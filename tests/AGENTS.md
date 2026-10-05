# Purpose

Hermetic unit and integration tests for `@francogp/auditor`. Executed under Vitest in Node.js environment. Guarantees 100% test coverage across all sub-auditor rules, BaseAuditor lifecycle methods, CLI scripts, and architecture conformance.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Hermetic Isolation**: Tests must never scan the live repository root. They must use `testScanFile(...)` or isolated temporary sandboxes via `projectRoot: tempDir`.
- **Negative Verification Mandate**: Every test file must include a test asserting that compliant code yields exactly 0 errors and `status: 'passed'` (`missing-clean-auditor-test`).
- **Complete RuleId Coverage & Rule Description Verification**: Every declared rule ID in `ruleDescriptions` of every sub-auditor has dedicated dirty fixture assertions for both error and warning severities. `validate_auditor_tests.ts` statically enforces that 100% of declared rules are exercised by corresponding test files.

## Key Files

- [`auditor_architecture_conformance.test.ts`](./auditor_architecture_conformance.test.ts): Meta-test verifying 100% companion test coverage and rule descriptors.
- [`auditor_base.test.ts`](./auditor_base.test.ts): Tests for `BaseAuditor` and `FileScanAuditor` base class lifecycle.
- [`auditor_capabilities.test.ts`](./auditor_capabilities.test.ts): Tests for dynamic sub-auditor capability detection, zero-boilerplate inheritance, and fix mode filtering.
- [`audit_bundle.test.ts`](./audit_bundle.test.ts): Tests for `audit_bundle.ts` treemap parsing and budget enforcement.
- [`audit_ratchet.test.ts`](./audit_ratchet.test.ts): Git-sandbox tests for the warning ratchet (fingerprint stability, new-warning detection, shrink-only baseline, tamper rejection).
- [`audit_metadata_contract.test.ts`](./audit_metadata_contract.test.ts): Verification of `AuditRunMetadata` serialization and freshness.
- [`report_coverage_map.test.ts`](./report_coverage_map.test.ts): Tests for audit coverage map CLI and reporting.
- [`report_test_coverage.test.ts`](./report_test_coverage.test.ts): Tests for test execution coverage reporting CLI.
- [`test_coverage_core.test.ts`](./test_coverage_core.test.ts): Tests for coverage metric calculation, unmapped file detection, and parsing.
- [`validate_accessibility.test.ts`](./validate_accessibility.test.ts): Tests for WCAG 2.2 accessibility verification via `eslint-plugin-vuejs-accessibility`.
- [`validate_audit_config.test.ts`](./validate_audit_config.test.ts): Tests for `.auditor/` configuration integrity (paths, scripts, ratchet ref and baseline) and the AST-based migration of root-level configs.
- [`validate_eslint_config.test.ts`](./validate_eslint_config.test.ts): Tests for ESLint Domain-Type-First configuration enforcement.
- [`validate_package_distribution.test.ts`](./validate_package_distribution.test.ts): Tests for package export map and type distribution hygiene via Publint.
- [`validate_package_hygiene.test.ts`](./validate_package_hygiene.test.ts): Tests for orphan dependency and unused script detection via Knip.
- [`validate_similar_code.test.ts`](./validate_similar_code.test.ts): Tests for semantic and structural code similarity verification.
- [`validate_stylelint.test.ts`](./validate_stylelint.test.ts): Tests for Stylelint CSS/SCSS hygiene, nesting, Vue 3 SFCs, and configuration overrides.
- [`validate_test_coverage.test.ts`](./validate_test_coverage.test.ts): Tests for test execution coverage thresholds and uncovered files detection.
- [`validate_type_coverage.test.ts`](./validate_type_coverage.test.ts): Tests for quantitative TypeScript type coverage threshold enforcement.
- [`version_bump.test.ts`](./version_bump.test.ts): Tests for SemVer bump calculation, build timestamp formatting, and git diff heuristics.

## Child DOX Index

- _This directory contains flat unit test suites with no subdirectories._
