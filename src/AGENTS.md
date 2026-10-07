# Purpose

Core source directory for `@francogp/auditor`. Contains framework foundations (`core/`), CLI runners and reporting tools (`cli/`), static code analyzers (`analyzers/`), Antigravity agent plugin registration (`plugin/`), and modular audit suites (`suites/`).

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Agnostic & Zero Host Coupling**: No host-domain-specific terms, types, or business data are permitted inside `src/`.
- **Primordial Mandate on Configuration Integrity**: Disabling or tampering with configurations (`.auditor/audit.config.ts`, linters, rules) to bypass errors or warnings without explicit human consultation is strictly prohibited.
- **Node.js 26+ Native Execution**: All modules execute under `--permission` model and `--experimental-strip-types`.
- **Canonical Imports**: Internal modules import from sibling source files using relative `.ts` extensions.
- **Export Discipline**: Public APIs are re-exported cleanly via [`src/index.ts`](./index.ts).

## Key Files

- [`src/index.ts`](./index.ts): Main framework entrypoint exporting public base classes, configurations, and utilities.

## Work Guidance

- Ensure all source code adheres strictly to TypeScript strict mode without `any` or loose casts.
- Use explicit Node.js protocol imports (`node:path`, `node:fs`, etc.) and relative file extensions (`.ts`).
- Coordinate changes with downstream suites and update `src/index.ts` exports when introducing public APIs.

## Verification

- Run TypeScript syntax and strip-types check: `node --experimental-strip-types src/index.ts`
- Run core unit tests: `npm test`
- Run source linter and auditors: `npm run audit:lint`

## Child DOX Index

- [`core/AGENTS.md`](./core/AGENTS.md): Abstract base classes (`BaseAuditor`, `FileScanAuditor`), configuration loaders, and theme rendering.
- [`cli/AGENTS.md`](./cli/AGENTS.md): CLI orchestrators (`audit_full.ts` with the built-in warning ratchet, `audit_bundle.ts`, and reports).
- [`analyzers/AGENTS.md`](./analyzers/AGENTS.md): Specialized static analyzers (AST constant analysis, Z-index rules, DOX integrity, TypeScript AST helpers).
- [`plugin/AGENTS.md`](./plugin/AGENTS.md): Antigravity plugin manifest discovery and agent hooks.
- [`suites/AGENTS.md`](./suites/AGENTS.md): Automated verification suites grouped by architectural families.
