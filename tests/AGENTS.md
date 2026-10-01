# Purpose

Hermetic unit and integration tests for `@francogp/auditor`. Executed under Vitest in Node.js environment. Guarantees 100% test coverage across all sub-auditor rules, BaseAuditor lifecycle methods, CLI scripts, and architecture conformance.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Hermetic Isolation**: Tests must never scan the live repository root. They must use `testScanFile(...)` or isolated temporary sandboxes via `projectRoot: tempDir`.
- **Negative Verification Mandate**: Every test file must include a test asserting that compliant code yields exactly 0 errors and `status: 'passed'` (`missing-clean-auditor-test`).
- **Complete RuleId Coverage**: Every declared rule ID has dedicated dirty fixture assertions for both error and warning severities.

## Key Files

- [`auditor_architecture_conformance.test.ts`](./auditor_architecture_conformance.test.ts): Meta-test verifying 100% companion test coverage and rule descriptors.
- [`auditor_base.test.ts`](./auditor_base.test.ts): Tests for `BaseAuditor` and `FileScanAuditor` base class lifecycle.
- [`audit_bundle.test.ts`](./audit_bundle.test.ts): Tests for `audit_bundle.ts` treemap parsing and budget enforcement.
- [`audit_for_commit.test.ts`](./audit_for_commit.test.ts): Tests for differential pre-commit gate.
- [`audit_metadata_contract.test.ts`](./audit_metadata_contract.test.ts): Verification of `AuditRunMetadata` serialization and freshness.

## Child DOX Index

- _This directory contains flat unit test suites with no subdirectories._
