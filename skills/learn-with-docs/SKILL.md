---
name: learn-with-docs
description: Custom learning and behavior persistence skill leveraging `/learn` within the DOX (AGENTS.md) documentation framework. Use when executing `/learn` or saving newly acquired patterns, rules, or domain behaviors. It ensures learnings are written to the correct child DOX indices in their native file language, and detects cross-repository boundaries when improvements belong to upstream tooling (@francogp/auditor).
---

# Learn With Docs

This skill customizes the behavior of the `/learn` slash command to ensure that newly acquired patterns, corrections, and rules are persisted correctly in the hierarchical DOX (AGENTS.md) framework.

## 1. Precise Placement Strategy

When saving a new behavior, constraint, or success pattern:
- **Do NOT default to the first or root `AGENTS.md` index** unless it is a universal, project-wide rule.
- **Navigate and Find the Proper Boundary**: Analyze the target directory tree. Locate the specific child `AGENTS.md` (via [dox-navigator](../dox-navigator/SKILL.md)) matching the scope of the learning, or create a new child index if one is needed.
- **Upstream Tooling Boundary Check (`@francogp/auditor`)**:
  - Explicitly evaluate repository ownership: Does this learning belong to the **current host project** (e.g. host business logic, views, stores, database models, host `audit.config.ts`, or bespoke local extensions in `scripts/auditors/`), or does it belong to the **upstream auditor engine** (`@francogp/auditor`, such as core base classes, built-in generic sub-auditors, core CLI orchestrators, or exported skills like `auditor`)?
  - **Host Repository Isolation**: If executing inside a consumer host workspace (e.g. any consumer application importing `@francogp/auditor`), NEVER mutate `node_modules/@francogp/auditor/` and NEVER pollute the host project's local `AGENTS.md` with upstream engine rules.
- **Domain Rules Cross-Check**: Any new domain calculations, business logic rules, or system constraints MUST be recorded in the nearest applicable child `AGENTS.md` file governing that domain logic.
- **DOX Hierarchy Integrity**: The hierarchical `AGENTS.md` tree is the sole architectural Single Source of Truth (SSoT). Ensure child DOX files accurately document exported contracts, rules, and child indices.

## 2. Language & Integrity Constraints

- **Preserve Native Language**: Check the target file's primary language before updating it. Do not mix languages within a single file.
- **English-First**: Since all configuration files and most docs are in English, any changes or additions to them MUST be written in English. Direct user communication, proposals, and summaries must remain in Spanish.
- **Relative Paths**: Always use relative paths when linking files and DOX indices (e.g., `[dox-navigator](../dox-navigator/SKILL.md)`). Refer to [grill-with-docs](../grill-with-docs/SKILL.md) for examples of linking within the DOX framework.

## 3. Workflow Steps & Learn Artifacts

1. **Identify Learnings & Audit Scope**: Analyze recent interactions to identify what to learn (Rules vs. Skills) and determine the correct target DOX scope.
2. **Repository Boundary Determination**:
   - Determine whether the learning targets the **current workspace** or the **upstream `@francogp/auditor` package**:
     - **Local Host Learning**: Changes apply to current project files or host DOX indices. Proceed to local proposal flow.
     - **Upstream Engine Learning**: Changes apply to `@francogp/auditor` (core framework, built-in suites, or auditor skills). If currently in a host repository without write access to `@francogp/auditor`, proceed to Upstream Proposal Flow.
3. **Mandatory Proposal Workflow**: Do NOT modify files immediately. You MUST create/update the `learning_proposal.md` artifact outlining the classification, rationale, and precise text additions/diffs:
   - Save the artifact strictly to the Artifact Directory `<appDataDir>/brain/<conversation-id>/learning_proposal.md`. NEVER save it inside `scratch/` or the project repository workspace.
   - Pass complete `ArtifactMetadata` containing `UserFacing: true`, `RequestFeedback: true`, and a detailed multi-line `Summary` describing the proposed rules/lessons.
   - **Upstream Alert Protocol (When running in a host project targeting `@francogp/auditor`)**:
     - Prepend a prominent warning banner at the very top of `learning_proposal.md`:
       ```markdown
       > [!WARNING] DESTINO DE APRENDIZAJE: REPOSITORIO UPSTREAM (@francogp/auditor)
       > Este aprendizaje pertenece al motor/librería `@francogp/auditor`, NO al proyecto anfitrión actual (`<host-project-name>`).
       > Estos cambios NO se aplicarán localmente ni dentro de `node_modules/`. Deben trasladarse y aplicarse en el repositorio de `@francogp/auditor`.
       ```
     - In the chat response, explicitly notify the programmer:
       1. That the learning and diff were drafted and saved in `learning_proposal.md`.
       2. That this change belongs to the `@francogp/auditor` repository, not the current host project.
       3. That it cannot be applied automatically in the current session unless the developer opens the `@francogp/auditor` workspace. Provide the diff and recommendations clearly so the programmer can carry them over.
       4. Stop and do NOT modify any host project files or `node_modules/`.
4. **Language Integrity Check**: Ensure the proposed rules or additions inside the `learning_proposal.md` diff blocks are written in English (matching the target files), while all descriptions, justifications, and chat explanations are in Spanish.
5. **Get User Approval (Local Workspace Only)**: If the learning is for the local workspace, stop and wait for the user's explicit approval on the proposal before applying any changes to the files.
6. **Documentation-Only Verification**: After applying changes to local `AGENTS.md` or skill files, ONLY run the unified documentation and DOX audit (`npm run audit:md`). Running full project audits (`npm run lint` or `npm run audit`) for documentation or skill edits is strictly forbidden.
   - **STRICT PROHIBITION ON RUNNING TESTS FOR DOCS**: You are STRICTLY FORBIDDEN from running `npm run test`, Vitest, Node test runners, or E2E simulations when updating documentation, DOX indices, or `.md` files. Test suites are exclusively for code logic changes in `src/` or `database/`.


