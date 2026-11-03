# Purpose

Security hardening, credential protection, and vulnerability prevention static analysis suites for `@francogp/auditor`. Enforces defense-in-depth across frontend and backend codebase surfaces natively via Oxlint rules (`validate_oxlint`).

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Security Hardening**: Enforces OWASP and CWE best practices via native Oxlint rules (`no-hardcoded-secrets`, `no-insecure-random`, `no-vulnerable-regex`, `no-raw-html-injection`, `no-eval`, etc.).
- **Zero-Escape Mandate**: Security rules strictly prohibit bypass directives or escape hatches. All credentials, redirects, and HTML bindings must be hardened cleanly in source code.

## Key Files

- _All security hardening rules have been unified into native Oxlint plugins and `validate_oxlint.ts`._

## Work Guidance

- Resolve scannable roots dynamically from `config.paths`.
- Ensure new security rules are implemented with native AST visitor performance in Oxlint.

## Verification

- Run security suite tests: `vp test tests/oxlint_security_hardening_migration.test.ts` (or `npm test -- tests/oxlint_security_hardening_migration.test.ts`)
- Run general audit: `auditor task=validate_oxlint`

## Child DOX Index

- _This directory contains security sub-auditor documentation with no subdirectories._
