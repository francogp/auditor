---
name: dox-navigator
description: MANDATORY skill for searching components, files, manuals, database schemas, or project context. You MUST activate this skill whenever navigating the directory structure, reading or updating DOX indices (AGENTS.md files), performing refactorings or major structural changes where DOX indices must be refreshed, executing the /learn command to persist lessons, or performing the DOX pass / lessons extraction step during /safe-commit. It enforces relative paths, language integrity (English-first or native file language, strictly prohibiting language mixing in DOX), and correct targeting of child AGENTS.md files.
---

# DOX Navigator Skill

This skill governs directory structure navigation, context discovery, component search, and knowledge persistence within the project's **DOX Framework** (the hierarchical `AGENTS.md` documentation tree).

---

## 1. Triggering Contexts

Consult this skill whenever you need to:

- Access general project info, domain models, or manual files.
- Search for components or locate specific directories.
- **Audit DOX integrity & detect missing/unindexed AGENTS.md files**: Always run `npm run audit:md` to discover missing indices or broken DOX hierarchy links.
- **Perform refactorings or major structural changes** to the codebase (which require refreshing and updating DOX indices/AGENTS.md files).
- Run the `/learn` command to persist new rules or behaviors.
- Perform the **Lessons Extraction** (Phase 3, Step 3.1) or **DOX Maintenance** (Phase 4, Step 4.1) during `/safe-commit`.

---

## 2. Language & Style Integrity (CRITICAL)

- **Language Uniformity**: All DOX indices, `AGENTS.md` files, and `.agents/` configuration files MUST be written in English or the native language of the file.
- **NO Language Mixing**: It is strictly forbidden to mix languages within a single file. Since `AGENTS.md` and skill files are in English, any changes, additions, or proposed rules to them MUST be written in English.
- **Relative Paths Mandate**: All links to other files and indices in all `AGENTS.md` files MUST use relative paths (e.g. `./database/AGENTS.md` or `../database/AGENTS.md`). Absolute paths are strictly forbidden.
- **Gitignored Paths**: Directories or files excluded via `.gitignore` that represent a real domain boundary MUST still be referenced in their parent's `Child DOX Index` with the suffix `_(gitignored — reason)_`.

---

## 3. DOX Framework Rules & Core Contracts

### DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits
- **Relative Paths Mandate**: All links to other files and indices in all `AGENTS.md` files MUST use relative paths (e.g. `./database/AGENTS.md` or `../database/AGENTS.md`). Absolute paths (e.g., `file:///C:/...` or absolute file system URLs) are strictly forbidden to ensure portability across different development environments. If any absolute paths are found in any `AGENTS.md` files, they must be corrected to relative paths immediately.
- **Mandatory Bidirectional Code Indexing (`## Key Files` & `dox-unindexed-file`)**: Every source code file (`.ts`, `.vue`, `.js`, etc.) residing in a subtree directory that contains an `AGENTS.md` MUST be registered and indexed under `## Key Files` in that local `AGENTS.md`. `validate_dox_integrity` enforces `dox-unindexed-file` with zero tolerance (excluding test suites and ambient type definitions).
- **Intelligent Link Relocation & Broken Reference Resolution**: All relative links across markdown documents, reference manuals, and `AGENTS.md` files are strictly verified against disk. If a referenced target file was relocated or reorganized to another directory, `validate_dox_integrity` and `validate_markdown_links` detect the target file elsewhere in the repository, outputting the exact relative path correction or auto-repairing it via `--fix`.
- **Gitignored Paths in DOX Indices**: Directories or files that exist locally but are excluded via `.gitignore` (e.g. credential folders, generated local configs) MUST still be referenced in their parent's Child DOX Index if they represent a real domain boundary. Mark them with the suffix `_(gitignored — reason)_` so agents and reviewers understand why they are absent from the repo. The DOX audit engine skips existence checks for gitignored paths automatically, so these entries will never produce CI failures.

### Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

### Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX
8. **Strict Zero-Fallback Mandate**: Under NO circumstances implement runtime fallbacks, compatibility patches, default returns, or recovery adapters (`||`, `??`, dummy objects, fallback choices) to make tests pass or hide errors. System logic MUST fail fast and loudly (`throw new Error`).
9. **Strict Event-Driven Mandate**: Application design, state transitions, and save loading MUST be 100% event-driven. Timers and timeouts (`setTimeout`, `setInterval`, race timeouts) are STRICTLY FORBIDDEN in application code (`src/`), and are only allowed as max execution failure caps in E2E tests.
10. **Strict Test Execution Mandate**: Automated test runs (`npm test` or `npm run test`) MUST execute 100% of unit and integration test suites natively in Vitest / Node test runner without bypasses.

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

### Update After Editing & Refactoring

Every meaningful change or **refactoring/major structural change** requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change or refactoring affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

### Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

### Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:

- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

### Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist
- **Type-First Mandate**: When documenting any data domain (e.g., in a child AGENTS.md or domain manual), always identify and reference the strict TypeScript type (union, `keyof`, or `as const` derived) for finite-value fields. Any domain whose values are finite and known MUST have a canonical TypeScript type declared before it can be used in code. This must be reflected in any DOX index that describes that domain.

### Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index (especially after refactoring, reorganizing, or adding/deleting directories)
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

### Naming & Language Preferences

- **Consistent Domain Identifiers**: All system-level finite domain identifiers (statuses, categories, configuration keys) must adhere strictly to canonical union definitions.
- **Code Language Uniformity**: Core code architecture, functions, variables, and type definitions MUST be written in English. Maintain language uniformity across each file and avoid mixing languages within the same documentation file.

---

## 4. Updates & Knowledge Persistence (`/learn` and `/safe-commit`)

Whenever persisting new knowledge, rules, lessons, or constraints:

### Precise Location Targeting

- **NO Arbitrary Placements**: Do NOT place lessons, rules, or guidelines in the root `AGENTS.md` file unless they are project-wide behavioral preferences.
- **Target Child `AGENTS.md`**: You MUST target the most specific and logical child `AGENTS.md` file that matches the folder tree of the modified code files, mapping each proposed rule to its proper domain boundary.
- **DOX Pass (Closeout)**:
  1. Re-check changed paths against the DOX chain.
  2. Update the nearest owning docs and any affected parents/children.
  3. Refresh every affected `Child DOX Index`.
  4. Run `npm run audit:md` to verify there are 0 errors in the `DOX (AGENTS.md) Integrity` category.
  5. **Strict No-Test Mandate for Documentation**: Never run `npm run test`, Vitest, or test runners when performing DOX updates, docs maintenance, or markdown edits. Verification is strictly restricted to DOX audit and markdown linting via `npm run audit:md`.

---

## 5. Automated DOX Integrity Audit Tools

To detect missing `AGENTS.md` files, unindexed child DOX indices, absolute path violations, or broken relative links across `src/` and the root `AGENTS.md`:

### Dedicated DOX & Markdown Audit Suite
Use the project's dedicated npm script:
```bash
npm run audit:md
```

### Full Project Audit (Errors Only Filter)
Alternatively, execute the project-wide audit filtered for errors:
```bash
npm run audit:errors
```

### What the Audit Detects:
1. **Missing `AGENTS.md` Files**: Any non-gitignored directory in `src/` containing code files (`.ts`, `.vue`, `.js`, `.scss`, `.css`) without an `AGENTS.md` file.
2. **Unindexed Child DOX Indices**: Any child `AGENTS.md` file that is not linked/indexed in its nearest ancestor parent `AGENTS.md` (up to root `AGENTS.md`).
3. **Forbidden Absolute Paths**: Any markdown links in `AGENTS.md` using absolute file system paths instead of relative paths.
4. **Broken Relative Links**: Any markdown links pointing to non-existent files or directories on disk.
