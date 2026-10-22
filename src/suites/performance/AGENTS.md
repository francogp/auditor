# Purpose

Performance optimization, Core Web Vitals, and database query efficiency static analysis suites for `@francogp/auditor`. Enforces web asset delivery hygiene, DOM depth bounds, unindexed SQL queries, N+1 query patterns, and cursor pagination standards.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Core Web Vitals & Frontend Hygiene (`validate_web_performance.ts`)**: Enforces modern image compression (WebP/AVIF), `@font-face` `font-display: swap`, inline SVG payload bounds (<=2KB), render-blocking stylesheet prevention, DOM depth limits (<=16 levels), explicit layout dimensions on media (`width` and `height`), and compressed streaming video codecs (`webm`/`preload="none"`).
- **Database Query & Index Performance (`validate_query_performance.ts`)**: Enforces foreign key secondary indexing in relational schemas, prohibits unbounded `SELECT *` in SQL/ORM queries, flags unpaginated collection queries missing `.limit` or `.range`, detects N+1 async database queries inside iterative loops, blocks full-table `SELECT COUNT(*)`, and mandates cursor pagination over high `OFFSET`.
- **Universal Empirical Individual Timing**: Every performance sub-auditor executes rules wrapped in `this.runSubAuditorSync` or `await this.runSubAuditor` to guarantee microsecond precision and zero synthetic division.
- **Engine Gating**: When `config.persistence.engine === 'none'`, query performance analysis cleanly marks rules not applicable and skips database execution without false positives.

## Key Files

- [`validate_web_performance.ts`](./validate_web_performance.ts): Web performance, asset payload budgets, and Core Web Vitals auditor.
- [`validate_query_performance.ts`](./validate_query_performance.ts): SQL query optimization, secondary index presence, and N+1 loop pattern auditor.

## Work Guidance

- Resolve scannable roots and extensions dynamically from `config.paths`.
- Zero-Escape Mandate: All queries and asset budgets are verified without bypass comments. Resolve performance bottlenecks directly in queries or config.
- Inherit from `FileScanAuditor` for automatic file collection, coverage recording, and hermetic `testScanFile` verification.

## Verification

- Run performance suite tests: `vp test tests/validate_web_performance.test.ts tests/validate_query_performance.test.ts` (or `npm test -- tests/validate_web_performance.test.ts tests/validate_query_performance.test.ts`)
- Run general performance audit: `auditor family=performance` (or `npm run auditor -- family=performance`)

## Child DOX Index

- _This directory contains performance sub-auditor suites with no subdirectories._
