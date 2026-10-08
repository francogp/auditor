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
- **Audit DOX integrity & detect missing/unindexed AGENTS.md files**: Run `npm run auditor:md` to discover missing indices or broken DOX hierarchy links.
- **Perform refactorings or major structural changes** to the codebase (which require refreshing and updating DOX indices and `AGENTS.md` files).
- Run the `/learn` command to persist new rules, preferences, or lessons.
- Perform the **Lessons Extraction** (Phase 3, Step 3.1) or **DOX Maintenance** (Phase 4, Step 4.1) during `/safe-commit`.

---

## 2. Language & Path Integrity (CRITICAL)

- **Dynamic Configuration-Driven Language Resolution (Zero Hardcoding)**:
  - The agent MUST dynamically consult `.auditor/audit.config.ts` to determine the configured languages:
    - **Documentation & File Writing Language (`config.documentation.language`)**: All DOX indices, `AGENTS.md` files, and `.agents/` configuration files MUST be written in the configured language (strictly defaulting to English `'en'` if unconfigured).
    - **AI Chat & Conversational Language (`config.documentation.chatLanguage`)**: Interactive chat searches, context explanations, and developer dialogues in the chat interface MUST strictly use the resolved chat language (strictly defaulting to Spanish `'es'` if unconfigured).
  - **Zero Hardcoding**: Skills and agents MUST NEVER hardcode language names or assume fixed languages without consulting `.auditor/audit.config.ts`.
- **Zero Language Mixing**: It is strictly forbidden to mix languages within a single file. Within each DOX index or documentation file, the chosen language must be maintained consistently without mixed-language paragraphs. The AI agent must never confuse or conflate the chat communication language with the repository file writing language.
- **Relative Paths Mandate**: All links to other files and indices in all `AGENTS.md` files MUST use relative paths (e.g. `./database/AGENTS.md` or `../database/AGENTS.md`). Absolute paths (e.g., `file:///C:/...` or `/home/...`) are strictly forbidden to ensure portability across different development environments.
- **Gitignored Paths in DOX Indices**: Directories or files excluded via `.gitignore` that represent a real domain boundary MUST still be referenced in their parent's `Child DOX Index` with the suffix `_(gitignored — reason)_`. The audit engine skips existence checks for gitignored paths automatically.

---

## 3. DOX Framework Specification

### Core Concept

- DOX is a highly performant `AGENTS.md` hierarchy that gives agents precise project context without bloating the context window.
- The agent MUST follow DOX instructions across all edits.

### Core Contract

- `AGENTS.md` files are **binding work contracts** for their subtrees.
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable `AGENTS.md` plus every parent `AGENTS.md` above it.

### Read Before Editing

1. **Read the root `AGENTS.md`**.
2. **Identify every file or folder** you expect to touch.
3. **Walk from the repository root** to each target path.
4. **Read every `AGENTS.md`** found along each route.
5. If a parent `AGENTS.md` lists a child `AGENTS.md` whose scope contains the path, read that child and continue from there.
6. **Use the nearest `AGENTS.md`** as the local contract, and parent docs for repo-wide rules.
7. **If docs conflict**, the closer doc controls local work details, but no child doc may weaken DOX.

> **Rule**: Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

### Update After Editing & Refactoring

Every meaningful change requires a **DOX pass** before the task is done.

Update the closest owning `AGENTS.md` when a change affects:

- Purpose, scope, ownership, or responsibilities.
- Durable structure, contracts, workflows, or operating rules.
- Required inputs, outputs, permissions, constraints, side effects, or artifacts.
- User preferences about behavior, communication, process, organization, or quality.
- `AGENTS.md` creation, deletion, move, rename, or index contents.

**Propagation rules:**
- Update parent docs when parent-level structure, ownership, workflow, or child index changes.
- Update child docs when parent changes alter local rules.
- Remove stale or contradictory text immediately.
- Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

### Hierarchy & Proximity Principle

- **Root `AGENTS.md` is the DOX rail**: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index.
- **Child `AGENTS.md` files own domain-specific instructions** and their own Child DOX Index.
- Each parent explains what its direct children cover and what stays owned by the parent.
- **Proximity principle**: The closer a doc is to the work, the more specific and practical it must be.

### Child Doc Shape

Create a child `AGENTS.md` when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards.

- **Work Guidance**: Must reflect the current operational standards of the project, subsystem practices, or development instructions. Leaving it empty, whitespace-only, or filled with placeholder/garbage text (`TODO`, `TBD`, `N/A`, `...`) is strictly prohibited (`dox-empty-section`).
- **Verification**: Must document concrete verification checks and execution commands (e.g. `npm test -- ...`, `npm run auditor:...`). Leaving it empty or using placeholder stubs is strictly prohibited (`dox-empty-section`).

**Default section order:**
1. `# Purpose`
2. `## Ownership`
3. `## Local Contracts`
   *(Optional: `## Key Files` — bidirectional code inventory when mandated by local contracts)*
4. `## Work Guidance`
5. `## Verification`
   *(Alternative placement: `## Key Files` immediately before `## Child DOX Index`)*
6. `## Child DOX Index`

> **Tutorial & Templates**: For comprehensive templates, step-by-step authoring walkthroughs, and error triage, consult the [DOX Authoring Tutorial & Canonical Guidelines](./references/dox-authoring-tutorial.md).

### Style

- Keep docs concise, current, and operational.
- Document stable contracts, not diary entries.
- Put broad rules in parent docs and concrete details in child docs.
- Prefer direct bullets with explicit names.
- Do not duplicate rules across many files unless each scope needs a local version.
- Delete stale notes instead of explaining history.
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist.

### User Preferences

When the user requests a durable behavior change, record it in the root `AGENTS.md` (if project-wide) or in the relevant child `AGENTS.md` (if specific to a subsystem).

### Initializing Unindexed Projects

When scanning a project or subtree that is not yet indexed:
1. Scan the project structure recursively to evaluate boundaries and complexity.
2. Build the DOX tree and create nested child `AGENTS.md` files where needed.
3. Replace placeholder notes with the actual `Child DOX Index`.

### Closeout Protocol

Before concluding any task that touched code or docs:
1. **Re-check changed paths** against the DOX chain.
2. **Update nearest owning docs** and any affected parents or children.
3. **Refresh every affected Child DOX Index**.
4. **Remove stale or contradictory text**.
5. **Run existing verification** when relevant (`npm run auditor:md`).
6. **Report any docs intentionally left unchanged and why**.

---

## 4. Updates & Knowledge Persistence (`/learn` and `/safe-commit`)

Whenever persisting new knowledge, rules, lessons, or constraints:

### Precise Location Targeting
- **NO Arbitrary Placements**: Do NOT dump local lessons, subsystem rules, or module guidelines into the root `AGENTS.md` file unless they represent project-wide behavioral preferences.
- **Target Child `AGENTS.md`**: You MUST target the most specific child `AGENTS.md` file that matches the folder tree of the modified code files, mapping each rule to its proper domain boundary.
- **Governed by `learn-with-docs`**: During safe-commit (Phase 3, Step 3.1), lessons extraction, DOX index traversal for inconsistencies, and proposal drafting are governed strictly by [learn-with-docs](../learn-with-docs/SKILL.md).

### Strict Verification Contract for Documentation
- **DOX Audit Only**: Run `npm run auditor:md` to verify there are 0 errors in the `DOX (AGENTS.md) Integrity` category.
- **Strict No-Test Mandate for Documentation**: Never run `npm test`, Vitest, or test runners when performing DOX updates, docs maintenance, or markdown edits. Verification is strictly restricted to DOX audit and markdown linting via `npm run auditor:md`.

---

## 5. Automated DOX Integrity Audit Tools

To detect missing `AGENTS.md` files, unindexed child DOX indices, absolute path violations, or broken relative links:

```bash
# General DOX + Markdown Preset:
npm run auditor:md

# Direct DOX Suite Execution (via canonical @francogp/auditor runner):
node --experimental-strip-types .agents/skills/dox-navigator/scripts/audit_dox.ts
```

### What the Audit Detects:
1. **Missing Mandatory Sections (`dox-missing-section`)**: Any `AGENTS.md` missing any of the 6 canonical sections (`# Purpose`, `## Ownership`, `## Local Contracts`, `## Work Guidance`, `## Verification`, `## Child DOX Index`).
2. **Section Ordering Violations (`dox-section-order`)**: Any sections appearing out of the canonical sequence, duplicated, or non-standard H1/H2 headings.
3. **Empty or Garbage Placeholder Content (`dox-empty-section`)**: Any mandatory section left empty, whitespace-only, comment-only, or filled with placeholder/filler tokens (`TODO`, `TBD`, `N/A`, `None`, `...`).
4. **Missing `AGENTS.md` Files (`dox-missing-agents-md`)**: Any non-gitignored directory in `src/` containing code files without an `AGENTS.md` file.
5. **Unindexed Child DOX Indices (`dox-unregistered-child`)**: Any child `AGENTS.md` file that is not linked/indexed in its nearest ancestor parent `AGENTS.md` (up to root `AGENTS.md`).
6. **Unindexed Code Files (`dox-unindexed-file`)**: Any non-test source code file residing in a documented directory that is not referenced in its local `AGENTS.md`.
7. **Forbidden Absolute Paths (`dox-absolute-link`)**: Any markdown links in `AGENTS.md` using absolute file system paths instead of relative paths.
8. **Broken Relative Links (`dox-broken-link`)**: Any markdown links pointing to non-existent files or directories on disk.
9. **Gitignored Targets (`dox-gitignore-target`)**: Any relative links pointing to unversioned paths ignored by Git.
