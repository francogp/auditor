# Purpose

Security hardening, credential protection, and vulnerability prevention static analysis suites for `@francogp/auditor`. Enforces defense-in-depth across frontend and backend codebase surfaces.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Security Hardening (`validate_security_hardening.ts`)**: Enforces OWASP and CWE best practices:
  - Prohibits hardcoded credentials, JWT secrets, and bearer tokens (`hardcoded-secrets`).
  - Flags insecure pseudo-random numbers (`Math.random()`) for security-sensitive tokens or entropy (`insecure-random`).
  - Detects ReDoS-vulnerable regular expressions with nested or overlapping quantifiers (`vulnerable-regex-redos`).
  - Blocks unsanitized HTML injection via `v-html` or `.innerHTML` (`raw-html-injection`).
  - Verifies presence of CSRF tokens in HTML/mutation form submissions (`missing-csrf-token`).
  - Prohibits dynamic evaluation via `eval()` or `new Function()` (`eval-or-function-constructor`).
  - Blocks permissive wildcard CORS headers (`Access-Control-Allow-Origin: *`) (`permissive-cors`).
  - Prevents unvalidated open redirects (`unvalidated-redirect`).
- **Universal Empirical Individual Timing**: Multi-rule security audits measure each declared rule with microsecond accuracy using `this.runSubAuditorSync` or `await this.runSubAuditor`.
- **Zero False-Positive Compromises**: Explicit escape hatches (`secret-ok`, `random-ok`, `regex-ok`, `v-html-ok`, `csrf-ok`, `eval-ok`, `cors-ok`, `redirect-ok`) must be accompanied by explicit technical justifications.

## Key Files

- [`validate_security_hardening.ts`](./validate_security_hardening.ts): Core security posture, CWE vulnerability patterns, and OWASP Top 10 compliance auditor.

## Work Guidance

- Resolve scannable roots dynamically from `config.paths`.
- Extend `FileScanAuditor` for automatic file collection, coverage recording, and line/column coordinate resolution.

## Verification

- Run security suite tests: `vp test tests/validate_security_hardening.test.ts` (or `npm test -- tests/validate_security_hardening.test.ts`)
- Run general security audit: `auditor family=security` (or `npm run auditor -- family=security`)

## Child DOX Index

- _This directory contains security sub-auditor suites with no subdirectories._
