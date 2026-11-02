# Evidence Mining & Documentation Harmonization Guide

Comprehensive reference guide for mining session evidence, extracting lessons from user prompts and artifacts, and eradicating legacy, deprecated, or contradictory content across repository documentation, DOX indices, and agent skills.

---

## 1. Multi-Source Evidence Mining

When executing `learn-with-docs`, the agent must never rely on subjective recollection. Evidence must be collected across three concrete surfaces:

### 1.1 Git Changes Since Last Commit

Run `git status -s` and inspect `git diff HEAD` (or staged/unstaged changes) to identify:

- **Modified/New Analyzers & Code (`src/**`)**: Identifies newly added features, refactored components, and architectural boundary changes. Internal implementation details and private functions are NOT documented for their own sake.
- **Modified Package Scripts (`package.json`, `src/cli/**`)**: Identifies new CLI entrypoints, changed command-line arguments, or deprecated script aliases that require updating `README.md`.
- **Modified Configurations (`.auditor/audit.config.ts`, `vite.config.ts`, `.fallowrc.json`, etc.)**: Identifies new configuration options, changed defaults, or newly added exemptions.
- **Modified Tests (`tests/**`)**: Identifies newly established regression tests and expected behaviors.

### 1.2 Conversation Artifacts & Work Plans

Inspect `<appDataDir>/brain/<conversation-id>/`:

- **`walkthrough.md`**: Contains the chronological log of verified tasks, test outputs, resolved bugs, root causes, and verification commands.
- **Work Plans (`plan.md`, `task.md`)**: Contains the structured plan of record, technical designs, user-approved architectural decisions, and rejected alternatives.
- **Other Brain Artifacts**: Contains ad-hoc design documents, benchmark results, or specialized reports generated during the conversation.

### 1.3 User Prompts & Session Transcript

Scrutinize every prompt provided by the user in the session. Classify findings into four categories:

1. **Explicit Corrections**: User directly corrected an error or assumption made by the agent (e.g. instructions correcting mistaken file ownership, incorrect parser choices, or wrong flag formats).
2. **Flagged Bad Practices**: User warned against an anti-pattern or prohibited behavior (e.g. warning against regular expressions for AST traversal, or warning against creating ad-hoc scripts when official CLIs exist).
3. **Advice & Tips**: User provided optimization tips, platform nuances, or best practices (e.g. recommending `;` in PowerShell over `&&`, or mandating `--` for npm script arguments).
4. **Architectural Directives**: User established a long-term architectural constraint or invariant for the repository.

#### Latest Directive Precedence Rule

When reviewing prompts across a multi-turn conversation, if the user provides an instruction in an early turn and subsequently refines, narrows, or contradicts it in a later turn, the **latest confirmed directive takes absolute precedence**. The agent must formulate invariants strictly reflecting the latest stance and discard superseded instructions, preventing internal contradictions in the proposal.

---

## 2. Invariant Formulation Heuristics

Transform raw user feedback into high-leverage, permanent engineering contracts:

| Feedback Category         | Anti-Pattern                             | Formulated Enforceable Invariant                                                                                                                                                               |
| :------------------------ | :--------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code Traversal Correction | Brittle textual pattern matching on code | **AST Traversing Mandate**: All TypeScript code inspection must use official AST parsers (`ts.createSourceFile`, AST visitors); regular expressions are strictly forbidden for code traversal. |
| CLI Parsing Advice        | Inconsistent or homebrew CLI parsing     | **Canonical CLI Governance Mandate**: All CLI executables must use `citty` harnesses (`defineCommand`, `runMain`); direct access to `process.argv` or unapproved parsers is forbidden.         |
| Dependency Isolation      | Patching external runtime artifacts      | **Dependency Immutability Mandate**: Dependencies in `node_modules/` are strictly immutable; bugs must be resolved upstream or via canonical package scripts.                                  |

---

## 3. Detecting Legacy, Deprecated & Contradictory Content

### 3.1 Host Program Documentation (`README.md`, `docs/**`)

- **Script Table Sync**: Verify that every script in `package.json` is accurately documented in `README.md` with correct arguments and flags.
- **Removed Flags / Options**: Search for references to CLI flags or configuration parameters that were deleted or renamed.
- **Outdated Architecture Diagrams / Text**: Update descriptions of directory layouts or module flows that were refactored in the session.

### 3.2 AGENTS.md Governance Files (Local Contracts & Invariants)

- **Boundary Precision**: Place new invariants and behavioral contracts into the most specific child `AGENTS.md` governing the affected directory under `## Local Contracts`. Only place repository-wide policies in root `AGENTS.md`.
- **Contract Harmonization**: Search child `AGENTS.md` files for legacy statements that contradict the new invariant (e.g. an older contract permitting an approach now banned).

### 3.3 Hierarchical DOX Indices (Navigation Trees & Child DOX Index)

- **Index Integrity**: Ensure that newly introduced directories or restructured modules are registered in the parent's `## Child DOX Index` navigation table.
- **Path Validity**: Verify relative link integrity across the DOX hierarchy using `npm run auditor:md`.

### 3.4 Agent Skills & Bundled Resources (`.agents/skills/**`)

- **Instructions (`SKILL.md`)**: Ensure the skill's instructions mandate the new standard.
- **References (`references/**`)**: Update API manuals, schemas, and catalogs to eradicate deprecated patterns.
- **Examples (`examples/**`)**: Modernize sample code to demonstrate current, idiomatic usage.
- **Templates (`templates/**`, `assets/**`)**: Ensure boilerplate files include newly required properties, types, or imports.

---

## 4. Deduplication & Zero Re-Learning Protocol

Before generating `learning_proposal.md`:

1. Check `git status -s` and inspect documentation files already modified.
2. If an invariant, README update, or skill diff was already applied during the session, **omit it from the proposal**.
3. Only propose diffs that are genuinely pending application.
4. If zero pending updates or contradictions exist, state clearly in `chatLanguage` that all documentation and learnings are up to date and conclude without creating a proposal artifact.

---

## 5. Autonomous Loop Termination Checklist (`/goal` Mode)

When executing inside an autonomous loop (such as `/goal` or an unattended multi-turn task):

### 5.1 Categorical Prohibition on Premature Completion

Applying changes in an iteration does NOT mean learning is complete. Modifying a document or contract frequently triggers secondary requirements, such as updating referenced files or removing downstream contradictions. The agent must NEVER emit the completion statement merely because iteration 1 or an edit pass concluded.

### 5.2 Strict Zero-Delta Convergence Verification

Before emitting the terminal completion statement, the agent must perform an independent, exhaustive sweep confirming all four criteria:

1. **Zero Missing Public Script & CLI Documentation**: Newly added or modified package scripts in `package.json`, CLI entrypoints in `src/cli/**`, or configuration keys in `.auditor/audit.config.ts` are accurately reflected in `README.md` or host documentation. (Internal implementation code, private helper functions, and bugfix refactors are NEVER documented just for the sake of it).
2. **Zero Missing Architectural Contracts**: Any new design constraint, invariant, or non-obvious root cause resolution is recorded in the corresponding child `AGENTS.md` under `## Local Contracts`.
3. **Zero Unpersisted User Prompts**: Every explicit user correction, bad-practice warning, and piece of advice from the conversation history is captured as an enforceable invariant.
4. **Zero Active Contradictions or Legacy Snippets**: No obsolete commands, deprecated APIs, removed flags, or conflicting instructions remain across any documentation surface.

### 5.3 Loop Continuation & Terminal Action

- **If any pending item or contradiction is found**: Apply the updates, run `npm run auditor:md`, and loop back to Step 1 for another independent verification pass.
- **When and ONLY when all criteria are 100% satisfied (Zero Delta)**:
  - Skip generating `learning_proposal.md`.
  - Skip requesting interactive user feedback.
  - Emit the canonical loop completion message in `chatLanguage` confirming that all documentation is fully synchronized and no further learning is required.
  - Conclude the turn immediately so the `/goal` orchestrator recognizes genuine goal attainment and terminates cleanly.
