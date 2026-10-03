# Purpose

Specialized static analyzers supporting auditor suites. Contains AST constant analysis (`constantAnalyzer.ts`) and DOX documentation hierarchy validation (`doxAnalyzer.ts`). CSS, SCSS, and Vue SFC style verification is delegated to the official Stylelint engine (`validate_stylelint.ts`).

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Pure Diagnostics**: Analyzers produce canonical violation records without direct terminal side-effects.
- **Hermetic AST Processing**: Utilizes the shared TypeScript AST context and visitors for maximum performance and zero platform dependency.

## Key Files

- [`constantAnalyzer.ts`](./constantAnalyzer.ts): TypeScript AST visitor detecting duplicate or divergent numeric/string constants.
- [`doxAnalyzer.ts`](./doxAnalyzer.ts): AGENTS.md documentation tree walker and link integrity verifier.

## Child DOX Index

- _This directory contains specialized analyzer modules with no subdirectories._
