# Purpose

Documentation verification suites for `@francogp/auditor`. Enforces Markdown syntax standards, relative link integrity, code symbol references, DOX hierarchy completeness (`AGENTS.md`), and markdownlint style.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **DOX Hierarchy**: Every code directory must have an `AGENTS.md` registered in its parent's `Child DOX Index`.
- **Zero Broken Links**: Relative links in Markdown documentation must point to valid files on disk.
- **Anchored Personal Machine Paths Detection**: Personal machine environment path regexes in `validate_markdown_links.ts` must strictly detect absolute root user directories (`/home/<user>`, `C:\Users\<user>`, `/Users/<user>`) and must not match benign relative directory names (such as `./users/`).
- **Comprehensive Documentation Scan Coverage**: Both `validate_markdown_links.ts` and `validate_markdown_code_references.ts` actively scan `docs/`, `README.md`, `AGENTS.md`, `src/`, `tests/`, and `.agents/skills`.
- **Dynamic Markdown Scan Roots**: `validate_markdown_code_references.ts` and `validate_markdown_links.ts` dynamically resolve database paths (`migrationsDir` or `supabase`) only when configured in `config.persistence`, avoiding hardcoded directory assumptions.
- **Abstract Documentation Reference Recognition**: `validate_markdown_code_references.ts` recognizes custom abstract reference paths declared in `config.documentation.knownValidAbstractPaths` to prevent false positives on virtual documentation links.
- **Npm Script Exclusivity**: Documented operational commands must correspond to defined `package.json` scripts.

## Key Files

- [`validate_documented_commands.ts`](./validate_documented_commands.ts): Validator for npm and npx commands documented across markdown files.
- [`validate_dox_integrity.ts`](./validate_dox_integrity.ts): DOX hierarchy completeness, child registration, and relative link validator.
- [`validate_markdown_code_references.ts`](./validate_markdown_code_references.ts): Verifier for referenced source files, npm scripts, and skill paths.
- [`validate_markdown_links.ts`](./validate_markdown_links.ts): Markdown relative link integrity auditor.
- [`validate_markdown_lint.ts`](./validate_markdown_lint.ts): Markdown formatting and style verifier via `markdownlint`.
- [`validate_markdown_syntax.ts`](./validate_markdown_syntax.ts): Markdown table formatting and npm script exclusivity verifier.

## Child DOX Index

- _This directory contains documentation sub-auditor suites with no subdirectories._
