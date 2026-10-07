---
name: learn-with-docs
description: >-
  Specialized learning, behavior persistence, and documentation consistency skill within the DOX (AGENTS.md) framework.
  Trigger ONLY during the `/safe-commit` workflow (Phase 3: Lessons Extraction, Step 3.1) or when explicitly
  directed during safe commit.
  DO NOT trigger for standard `/learn` slash commands, general design interviews, or general learning sessions outside of safe commit.
  Enforces precise DOX boundary targeting, DOX index traversal for inconsistencies and legacy code,
  auditor-configured language governance (defaulting to English when in doubt), legacy/contradictory README and documentation sweeps,
  learning_proposal.md artifact creation, and prevents polluting host DOX indices with upstream @francogp/auditor tooling rules.
---

# Learn With Docs

Specialized learning, behavior persistence, and documentation consistency skill executed strictly during the `/safe-commit` workflow (Phase 3, Step 3.1). Ensures newly acquired patterns, corrections, and architectural rules are persisted correctly in the hierarchical DOX (`AGENTS.md`) framework, systematically audits the entire DOX index hierarchy (`AGENTS.md` files) to eliminate legacy code and inconsistencies compared to the new learning, and audits `README.md` files and documentation to eliminate stale or contradictory content.

---

## 1. Precise Placement Strategy

When saving a new behavior, constraint, or success pattern:
- **Do NOT default to the root `AGENTS.md` index** unless it is a universal, project-wide rule.
- **Navigate and Find the Proper Boundary**: Analyze the target directory tree. Locate the specific child `AGENTS.md` (via [dox-navigator](../dox-navigator/SKILL.md)) matching the scope of the learning, or create a new child index if one is needed.
- **Upstream Tooling Boundary Check (`@francogp/auditor`)**:
  - Explicitly evaluate repository ownership: Does this learning belong to the **current host project** (e.g. host business logic, views, stores, database models, host `.auditor/audit.config.ts`, or bespoke local extensions in `scripts/auditors/`), or does it belong to the **upstream auditor engine** (`@francogp/auditor`, such as core base classes, built-in generic sub-auditors, core CLI orchestrators, or exported skills like `auditor`)?
  - **Host Repository Isolation**: If executing inside a consumer host workspace (e.g. any consumer application importing `@francogp/auditor`), NEVER mutate `node_modules/@francogp/auditor/` and NEVER pollute the host project's local `AGENTS.md` with upstream engine rules.
- **Domain Rules Cross-Check**: Any new domain calculations, business logic rules, or system constraints MUST be recorded in the nearest applicable child `AGENTS.md` file governing that domain logic.
- **DOX Hierarchy Integrity**: The hierarchical `AGENTS.md` tree is the sole architectural Single Source of Truth (SSoT). Ensure child DOX files accurately document exported contracts, rules, and child indices.

---

## 2. DOX Index Traversal for Inconsistencies & Legacy Code

Whenever a new pattern, rule, or architectural shift is captured, the agent MUST traverse the DOX index hierarchy (`AGENTS.md` files) across the repository starting from the root index down through relevant child indices:

1. **Target DOX Files**:
   - Root `AGENTS.md` and all child `AGENTS.md` indices across the workspace.
2. **Defect Patterns to Detect in the DOX Hierarchy**:
   - **Contradictory Local Contracts**: Existing contracts, mandates, or guidelines in parent, child, or sibling `AGENTS.md` files that contradict the new learning (e.g. an older index mandating a deprecated pattern, abolished workflow, or superseded rule).
   - **Legacy Code Snippets & Signatures**: Code blocks, function signatures, DTOs, or examples inside `AGENTS.md` files that demonstrate superseded patterns, obsolete options, or deprecated APIs.
   - **Stale References & Deprecated Rules**: Outdated links, superseded section titles, or duplicate rules that survived earlier refactorings.
   - **Inconsistent Standards**: Deviations across subtrees where an older index still prescribes patterns that the new learning explicitly replaces or modernizes.
3. **DOX Harmonization in Proposal**:
   - Every detected DOX inconsistency, legacy contract, or obsolete code snippet MUST be captured in `learning_proposal.md`.
   - Propose exact diffs modernizing or removing the conflicting directives across all affected `AGENTS.md` files so the DOX hierarchy remains 100% harmonious with the newly learned behavior.

---

## 3. Legacy & Contradictory Documentation Consistency Pass

Whenever a new pattern, rule, or architectural shift is captured, the agent MUST perform a cross-repository documentation sweep to identify and eliminate stale, conflicting, or outdated text:

1. **Target Documentation Files**:
   - Root `README.md` and any submodule or package READMEs.
   - Reference manuals and blueprints in `.agents/skills/*/references/`.
   - Guides, architectural specs, and documentation markdown files in `docs/` or `references/`.
2. **Defect Patterns to Detect**:
   - **Contradictory Guidelines**: Text or directives advocating obsolete patterns directly contradicted by the newly acquired learning (e.g. recommending manual helpers instead of stdlib, obsolete configurations, or repealed conventions).
   - **Stale Command Scripts**: Outdated CLI invocations, deprecated runner flags, or removed script gates (e.g. `audit:for-commit`).
   - **Obsolete Code Snippets**: Fenced code examples or JSON/TypeScript configurations that demonstrate superseded APIs or invalid options.
   - **Version Inconsistencies**: Descriptions referring to previous major/minor versions that conflict with current architecture.
3. **Harmonization in Proposal**:
   - Every detected contradictory or legacy statement MUST be reported and scheduled for correction directly inside `learning_proposal.md`.
   - Propose exact diffs fixing the contradictory text in the respective documentation files alongside the DOX changes.

---

## 4. Language & Integrity Constraints

- **Auditor Configuration Language Governance (`config.documentation.language`)**:
  - The language used for documentation, DOX indices, and the writing of `learning_proposal.md` depends directly on the project's auditor configuration (`config.documentation.language` in `.auditor/audit.config.ts`, e.g. `'es'`, `'en'`).
  - **Default to English on Doubt**: Whenever in doubt, or if `config.documentation.language` is omitted or unconfigured, the DEFAULT is STRICTLY AND UNCONDITIONALLY English (`'en'`).
  - **Zero Language Mixing**: Within each file, DOX index, or proposed section, the chosen language must be strictly maintained without mixed-language paragraphs. Direct interactive chat communication with the user remains in the user's preferred language (Spanish).
- **Relative Paths**: Always use relative paths when linking files and DOX indices (e.g., `[dox-navigator](../dox-navigator/SKILL.md)`). Refer to [dox-navigator](../dox-navigator/SKILL.md) for examples of linking within the DOX framework.

---

## 5. Safe-Commit Integration Workflow (Phase 3, Step 3.1)

1. **Identify Learnings & Audit Scope**: Analyze the session's debugging discoveries, user corrections, or architectural changes.
2. **Repository Boundary Determination**:
   - Determine whether the learning targets the **current workspace** or the **upstream `@francogp/auditor` package**:
     - **Local Host Learning**: Changes apply to current project files or host DOX indices. Proceed to local proposal flow.
     - **Upstream Engine Learning**: Changes apply to `@francogp/auditor` (core framework, built-in suites, or auditor skills). If currently in a host repository without write access to `@francogp/auditor`, proceed to Upstream Proposal Flow.
3. **DOX Hierarchy & Documentation Sweep**:
   - **DOX Hierarchy Traversal**: Traverse `AGENTS.md` files across the DOX tree. Search for any existing rules, contracts, code snippets, or instructions that conflict with, or are made obsolete by, the new learning.
   - **Legacy Documentation Sweep**: Scan relevant `README.md` files, references, and guides for text that conflicts with or is made obsolete by the new learning.
   - Prepare concrete replacement/deletion diffs for each occurrence.
4. **Mandatory Proposal Workflow**: Do NOT modify files immediately. You MUST create/update the `learning_proposal.md` artifact outlining the classification, rationale, and precise text additions/diffs:
   - Save the artifact strictly to the Artifact Directory `<appDataDir>/brain/<conversation-id>/learning_proposal.md`. NEVER save it inside `scratch/` or the project repository workspace.
   - Pass complete `ArtifactMetadata` containing `UserFacing: true`, `RequestFeedback: true`, and a detailed multi-line `Summary` describing the proposed rules/lessons and documentation corrections.
   - Write the proposal in the language defined by `config.documentation.language` (defaulting to English if unconfigured or in doubt).
   - **Section 1: DOX Additions**: Exact diffs for placing the new learning at the proper `AGENTS.md` boundary.
   - **Section 2: DOX Modernization & Consistency Diffs**: Exact diffs correcting, modernizing, or removing conflicting contracts and legacy code across existing `AGENTS.md` files.
   - **Section 3: Documentation & README Modernization**: Exact diffs correcting legacy or contradictory text in `README.md`, reference guides, or manuals.
   - **Upstream Alert Protocol (When running in a host project targeting `@francogp/auditor`)**:
     - Prepend a prominent warning banner at the very top of `learning_proposal.md`:
       ```markdown
       > [!WARNING] LEARNING TARGET: UPSTREAM REPOSITORY (@francogp/auditor)
       > This learning belongs to the `@francogp/auditor` engine/package, NOT to the current host project (`<host-project-name>`).
       > These changes MUST NOT be applied locally or inside `node_modules/`. They must be transferred and applied to the `@francogp/auditor` repository.
       ```
5. **Language Integrity Check**: Verify that `learning_proposal.md`, proposed rules, and documentation additions are written in the project's configured language (`config.documentation.language`), strictly defaulting to English (`'en'`) if unconfigured or when in doubt, ensuring zero language mixing.
6. **Phase 3 Hard Stop & User Approval**: Wait for the user's explicit approval on `learning_proposal.md` via `ask_question` before proceeding to Phase 4.
7. **Phase 4 Application & Verification**:
   - Apply approved lessons and modernizations across all targeted `AGENTS.md` files in the DOX hierarchy.
   - Apply approved corrections to the affected `README.md` and documentation files.
   - Run pre-commit sanity check: `npm run audit:md`.
   - **STRICT PROHIBITION ON RUNNING TESTS FOR DOCS**: You are STRICTLY FORBIDDEN from running `npm run test`, Vitest, Node test runners, or E2E simulations when updating documentation, DOX indices, or `.md` files. Test suites are exclusively for code logic changes in `src/` or `database/`.
