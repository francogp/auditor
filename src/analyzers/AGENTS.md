# Purpose

Specialized static analyzers supporting auditor suites. Contains AST constant analysis (`constantAnalyzer.ts`), CSS duplication and vendor tooling integration (`cssAnalyzer.ts`), and DOX documentation hierarchy validation (`doxAnalyzer.ts`).

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Tooling Discovery**: Cross-platform resolution of native build tools (e.g. `css-checker` from `css-checker-kit`) via `getCssCheckerCmd`.
- **Pure Diagnostics**: Analyzers produce canonical violation records without direct terminal side-effects.
- **Hermetic AST Processing**: Utilizes the shared TypeScript AST context for performance and caching.

## Key Files

- [`constantAnalyzer.ts`](./constantAnalyzer.ts): TypeScript AST visitor detecting duplicate or divergent numeric/string constants.
- [`cssAnalyzer.ts`](./cssAnalyzer.ts): CSS checker bridge detecting duplicate CSS/SCSS selector blocks.
- [`doxAnalyzer.ts`](./doxAnalyzer.ts): AGENTS.md documentation tree walker and link integrity verifier.

## Child DOX Index

- _This directory contains specialized analyzer modules with no subdirectories._
