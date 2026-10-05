# Purpose

Core source directory for `@francogp/auditor`. Contains framework foundations (`core/`), CLI runners and reporting tools (`cli/`), static code analyzers (`analyzers/`), Antigravity agent plugin registration (`plugin/`), and modular audit suites (`suites/`).

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Agnostic & Zero Host Coupling**: No host-domain-specific terms, types, or business data are permitted inside `src/`.
- **Node.js 26+ Native Execution**: All modules execute under `--permission` model and `--experimental-strip-types`.
- **Canonical Imports**: Internal modules import from sibling source files using relative `.ts` extensions.
- **Export Discipline**: Public APIs are re-exported cleanly via [`src/index.ts`](./index.ts).

## Key Files

- [`src/index.ts`](./index.ts): Main framework entrypoint exporting public base classes, configurations, and utilities.

## Child DOX Index

- [`core/AGENTS.md`](./core/AGENTS.md): Abstract base classes (`BaseAuditor`, `FileScanAuditor`), configuration loaders, and theme rendering.
- [`cli/AGENTS.md`](./cli/AGENTS.md): CLI orchestrators (`audit_full.ts` with the built-in warning ratchet, `audit_bundle.ts`, and reports).
- [`analyzers/AGENTS.md`](./analyzers/AGENTS.md): Specialized static analyzers (CSS checker, DOX integrity, TypeScript AST helpers).
- [`plugin/AGENTS.md`](./plugin/AGENTS.md): Antigravity plugin manifest discovery and agent hooks.
- [`suites/AGENTS.md`](./suites/AGENTS.md): Automated verification suites grouped by architectural families.
