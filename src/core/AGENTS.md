# Purpose

Core runtime foundations of `@francogp/auditor`. Provides the base auditor OOP hierarchy (`BaseAuditor`, `FileScanAuditor`), contract types, configuration loading (`audit.config.ts`), terminal Box-Drawing rendering (`unifiedTheme`), shared AST parsing context, streaming execution runners, and filesystem permission guards.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Base Class Inheritance**: All sub-auditors across the system must inherit from `BaseAuditor` or `FileScanAuditor`.
- **Unified Terminal Rendering**: Output formatting must utilize `unifiedTheme` utilities (`renderBanner`, `renderBoxTable`, `formatStatusBadge`, `getVisualWidth`) within 80-column limits.
- **Config Single Source of Truth**: All dynamic thresholds, custom paths, and extensions are loaded via `auditConfig.ts`.
- **Configurable Bundle Auditing for Non-Web Packages (`bundle.enabled: false`)**: `AuditBundleConfig` in `auditConfig.ts` must expose `readonly enabled?: boolean`. Sub-auditors and the `auditor-bundle` CLI check `bundleConfig?.enabled === false` and exit 0 cleanly with an informational notice, avoiding false-positive gate failures in non-bundled packages or standalone CLI engines.
- **Permission Boundaries**: File operations adhere to Node.js 26 `--permission` flags with paths verified via `permissionGuard.ts` and `safePath.ts`.

## Key Files

- [`astContext.ts`](./astContext.ts): Shared TypeScript AST cache and parsing engine.
- [`auditConfig.ts`](./auditConfig.ts): SSoT configuration loader (`getAuditConfig`, `defineAuditConfig`).
- [`auditContract.ts`](./auditContract.ts): Core TypeScript interfaces for findings, suites, and results.
- [`auditorBase.ts`](./auditorBase.ts): Abstract base classes (`BaseAuditor`, `FileScanAuditor`) and canonical ignore directories.
- [`gitignoreMatcher.ts`](./gitignoreMatcher.ts): Gitignore parsing and fast path matching utility.
- [`permissionGuard.ts`](./permissionGuard.ts): Node.js `--permission` flag validation and capability probing.
- [`reportUtils.ts`](./reportUtils.ts): Utilities for serializing audit results and summaries to `scratch/audits/`.
- [`safePath.ts`](./safePath.ts): Cross-platform path normalization and traversal prevention.
- [`streamingRunner.ts`](./streamingRunner.ts): Streaming auditor execution engine.
- [`unifiedTheme.ts`](./unifiedTheme.ts): Box-Drawing terminal rendering engine.

## Child DOX Index

- _This directory contains pure core foundation modules with no subdirectories._
