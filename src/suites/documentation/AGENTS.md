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
- **Bidirectional DOX Code Indexing Mandate (`dox-unindexed-file`)**: Every non-test source code file (`.ts`, `.vue`, `.js`, etc.) residing in a directory governed by `AGENTS.md` MUST be documented under `## Key Files` with its architectural role.
- **Canonical DOX Hierarchy & Section Order Governance (`validate_dox_integrity`)**: Every `AGENTS.md` file MUST contain all 6 canonical sections (`# Purpose`, `## Ownership`, `## Local Contracts`, `## Work Guidance`, `## Verification`, `## Child DOX Index`) in strict sequential order. Optional `## Key Files` must be canonically placed immediately after `## Local Contracts` or immediately before `## Child DOX Index`. Sections must not be empty, whitespace-only, comment-only, or contain placeholder junk (`dox-missing-section`, `dox-section-order`, `dox-empty-section`).
- **Non-Destructive Actionable Diagnostics for Broken Documentation Links**: Broken markdown and DOX links must provide intelligent relocation recommendations searching the repository file index (`buildRepositoryFileIndex`), reporting `"pero aparentemente fue localizado en: ..."` without applying dangerous automated file mutations.
- **Mandatory Root AGENTS.md Architecture Mandates Verification (`validate_agents_config_mandate`)**: Verifies that root `AGENTS.md` strictly contains mandatory architecture governance clauses under `## Local Contracts`: (1) prohibition on modifying/disabling auditor configurations without prior programmer consultation, (2) absolute prohibition on backward-compatible code and loud failure mandate, (3) absolute prohibition on suppressing or silencing rules for fake clean passes, and (4) AI agent conversational chat communication language mandate dynamically resolved from `config.documentation.chatLanguage`. Provides `--fix` auto-injection, in-place modernization, and bilingual synchronization (`config.documentation.language`).
- **Documentation Natural Language Verification & Root AGENTS.md Governance (`validate_documentation_language`)**: Asserts that natural language prose across markdown files and AI skills conforms strictly to `config.documentation.language` (default: `'en'`), cleanly stripping technical blocks, inline code, URLs, and frontmatter. Validates that root `AGENTS.md` strictly contains the mandatory language governance mandate under `## Local Contracts`, providing automated injection and in-place modernization of legacy versions in `--fix` mode.
- **Idempotent Injections & Anti-Duplication Pruning in `AGENTS.md` Auto-Repair**: Both `validate_agents_config_mandate.ts` and `validate_documentation_language.ts` (along with `agentsMandateAnalyzer.ts`) MUST operate idempotently during auto-repair (`--fix`). When injecting or synchronizing mandates under `## Local Contracts`, the analyzer collects all matching line occurrences, replaces the first instance in place, and splices out all subsequent duplicate matches in reverse order. Running `audit fix` repeatedly across cycles or toggling language settings is guaranteed never to duplicate sections or accumulate extra empty lines.

## Key Files

- [`validate_agents_config_mandate.ts`](./validate_agents_config_mandate.ts): Verifier for mandatory anti-tampering configuration, backward-compatibility prohibition, fake-pass prevention, and AI chat language clauses in root `AGENTS.md`.
- [`validate_documentation_language.ts`](./validate_documentation_language.ts): Validator ensuring documentation and DOX indices conform to configured language (`en` / `es`).
- [`validate_documented_commands.ts`](./validate_documented_commands.ts): Validator for npm and npx commands documented across markdown files.
- [`validate_dox_integrity.ts`](./validate_dox_integrity.ts): DOX hierarchy completeness, child registration, and relative link validator.
- [`validate_markdown_code_references.ts`](./validate_markdown_code_references.ts): Verifier for referenced source files, npm scripts, and skill paths.
- [`validate_markdown_links.ts`](./validate_markdown_links.ts): Markdown relative link integrity auditor.
- [`validate_markdown_lint.ts`](./validate_markdown_lint.ts): Markdown formatting and style verifier via `markdownlint`.
- [`validate_markdown_syntax.ts`](./validate_markdown_syntax.ts): Markdown table formatting and npm script exclusivity verifier.

## Work Guidance

- Enforce all 6 canonical sections in DOX indices (`# Purpose`, `## Ownership`, `## Local Contracts`, `## Work Guidance`, `## Verification`, `## Child DOX Index`) in strict sequential order.
- Forbid empty sections, comments-only sections, or placeholder garbage (`TODO`, `TBD`, `N/A`, `...`) in `AGENTS.md`.
- Ensure all relative links use POSIX format without absolute paths or unversioned gitignored resources.

## Verification

- Run DOX integrity suite: `node --experimental-strip-types src/suites/documentation/validate_dox_integrity.ts`
- Run markdown links suite: `node --experimental-strip-types src/suites/documentation/validate_markdown_links.ts`
- Run markdown preset: `npm run auditor:md`

## Child DOX Index

- _This directory contains documentation sub-auditor suites with no subdirectories._
