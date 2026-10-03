# Purpose

Specialized static analyzers supporting auditor suites. Contains AST constant analysis (`constantAnalyzer.ts`), CSS duplication and vendor tooling integration (`cssAnalyzer.ts`), and DOX documentation hierarchy validation (`doxAnalyzer.ts`).

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Native PostCSS AST Analysis & Incremental Caching**: Stylesheet and SFC style hygiene, duplicate rules, similar selectors, and unvariabled tokens are analyzed strictly through pure TypeScript AST engines via PostCSS and `postcss-scss` in memory with zero native binaries. Features dual-tier incremental caching (in-memory `inMemoryCssCache` and disk `scratch/cache/css_ast_cache.json`) validated via `fs.stat()` `mtimeMs` and `size` to eliminate repeated parsing overhead in large projects.
- **Pure Diagnostics**: Analyzers produce canonical violation records without direct terminal side-effects.
- **Hermetic AST Processing**: Utilizes the shared TypeScript AST context and PostCSS memory parser for maximum performance and zero platform dependency.

## Key Files

- [`constantAnalyzer.ts`](./constantAnalyzer.ts): TypeScript AST visitor detecting duplicate or divergent numeric/string constants.
- [`cssAnalyzer.ts`](./cssAnalyzer.ts): Pure PostCSS AST engine analyzing duplicate rules, similar selectors, unvariabled tokens, and CSS hygiene across 6 canonical rules, providing shared AST extraction for scoped dead CSS.
- [`doxAnalyzer.ts`](./doxAnalyzer.ts): AGENTS.md documentation tree walker and link integrity verifier.

## Child DOX Index

- _This directory contains specialized analyzer modules with no subdirectories._
