---
name: learn-with-docs
description: >-
  Specialized skill for capturing and persisting newly acquired lessons, user corrections,
  and architectural decisions into the hierarchical DOX (AGENTS.md) framework, updating host
  program documentation (README.md, docs/**), and affected skill references, examples, and templates,
  while eliminating direct contradictions to the new learning. Use when the user invokes /learn-with-docs,
  asks to persist learnings from the current session, or during the documentation alignment & lessons
  phase of /safe-commit. Does NOT perform unrelated repository-wide audits, does NOT report unrelated
  issues, and NEVER executes git commits or pushes.
license: MIT
metadata:
  author: Franco Gastón Pellegrini
  organization: FrancoGP Core Architecture
  date: October 2026
---

# Learn With Docs

Specialized skill for persisting newly acquired knowledge, explicit user corrections, bug resolutions, and architectural decisions into the hierarchical DOX (`AGENTS.md`) tree, while harmonizing existing documentation across the workspace by strictly eliminating direct contradictions to the new learning.

---

## 🎯 Core Principles

1. **Strictly Lesson-Anchored Scope**:
   - A "learning" is ONLY:
     - An explicit correction or directive given by the user during the current session.
     - A non-obvious bug, edge case, or root cause diagnosed and resolved in the current session.
     - A new architectural standard or contract agreed upon in the current session.

2. **Targeted Contradiction Sweep & Collateral Documentation Harmonization**:
   - When a new learning, architectural standard, or interface contract $L$ is established, the agent MUST search across three primary surfaces directly affected by $L$:
     1. **Host Program & Repository Documentation**: Root and nested `README.md`, `docs/**`, architecture guides, manuals, and script tables of the program where the auditor is running.
     2. **Hierarchical DOX Indices (`AGENTS.md`)**: Local contracts, directory descriptions, index tables, and boundary invariants.
     3. **Agent Skills & Bundled Resources (`.agents/skills/**` or `skills/**`)**: Internal `SKILL.md` files, `references/**`, `examples/**`, and `templates/**`.
   - **What Constitutes a Direct Contradiction, Stale Reference, or Missing Content**:
     - Instructions, script tables, prerequisites, or code samples in `README.md` or `docs/**` describing obsolete behavior, removed flags, or legacy code that contradicts new changes.
     - Missing documentation for newly added commands, parameters, configuration options, or architectural invariants in the host program.
     - An existing DOX contract or skill instruction prescribing pattern $P$ when $L$ explicitly bans or replaces $P$.
     - A code snippet, template, tutorial, or example inside a skill or guide instructing callers to invoke deprecated API $A$ when $L$ establishes that $A$ must not be used or requires newly added options.
     - A boilerplate template or reference implementation lacking newly mandatory properties, arguments, or contracts introduced by $L$.
     - A directive mandating behavior $B$ when $L$ explicitly mandates $\neg B$.
   - **STRICTLY PROHIBITED**: Reporting, proposing, or correcting general defects, typos, or unrelated legacy code in files that do NOT directly touch or contradict $L$. Unrelated maintenance belongs to standalone tasks, never to a learning proposal.

3. **Deduplication Check & Zero Redundant Proposals (Zero Re-Learning)**:
   - The proposal artifact (`learning_proposal.md`) MUST ONLY contain actions, contracts, or harmonizations that have **NOT YET BEEN PERFORMED** on disk.
   - If a file, skill, or document was already modified, harmonized, or deleted earlier in the session, it is already part of the working tree and MUST NOT be re-proposed or asked for approval again.
   - Inspect target `AGENTS.md` files, program docs, and skills:
     - If all lessons are already documented and all contradictions are already resolved on disk, state clearly: `"No se identificaron nuevos aprendizajes ni contradicciones pendientes de persistir en esta sesión."` and stop immediately without creating a proposal artifact or approval gate. DO NOT invent proposals or re-ask for work that is already done.

4. **Precise DOX Placement (Target Boundary)**:
   - Follow the hierarchical DOX structure:
     - Place the primary rule in the **most specific child `AGENTS.md`** governing that module or domain.
     - **NEVER default to root `AGENTS.md`** unless the learning is truly universal and affects the entire repository.
     - Never pollute host project DOX files with upstream framework (`@francogp/auditor`) internals.

5. **Absolute Prohibition of Git Commit and Push**:
   - `learn-with-docs` is **NOT** a version control or release tool.
   - It is **STRICTLY FORBIDDEN** for this skill to run `git commit`, `git push`, create git tags, or modify `package.json` versions.
   - The skill's scope ends when the approved learning and harmonization diffs are written to disk in the working tree. Versioning, staging, committing, and pushing belong exclusively to `/safe-commit` or manual user command.
   - A `learning_proposal.md` MUST NEVER propose or mention `git commit`, `git push`, tags, or release operations. Versioning, staging, committing, and release tags belong solely to `/safe-commit` (Phase 4) or manual user commands.

6. **Dynamic Auditor Configuration Language Governance (Zero Hardcoding)**:
   - The agent MUST dynamically consult `.auditor/audit.config.ts` to determine the configured languages:
     - **Documentation & File Writing Language (`config.documentation.language`)**: Governs repository documentation, markdown files committed to git, DOX indices (`AGENTS.md`), commit messages, git tags, and the code diffs/contracts presented inside `learning_proposal.md`.
     - **AI Chat & Conversational Language (`config.documentation.chatLanguage`)**: Governs all direct interactive chat communication, user interviews, options matrices, `ask_question` dialogs, AND the narrative explanations and context in brain artifacts (`learning_proposal.md`, `walkthrough.md`).
   - **Zero Hardcoding**: Skills and agents MUST NEVER hardcode language names or assume fixed languages without consulting `.auditor/audit.config.ts`.
   - **Zero Language Mixing**: Within each section, code block, or file, the chosen language must be strictly maintained without mixed-language paragraphs. The AI agent must never confuse or conflate the chat communication language with the repository file writing language.

---

## 📋 The 3-Step Execution Protocol

### Step 1: Lesson Identification & Contradiction Sweep

1. **Extract the Core Learning**:
   - What went wrong? What was the user's correction? What invariant must be preserved from now on?
   - Formulate a single, concise, actionable contract statement (1-3 sentences) representing the new learning $L$.
2. **Locate Target DOX Boundary**:
   - Use `dox-navigator` to identify the specific child directory containing the relevant `AGENTS.md`.
   - Verify if the rule already exists in that boundary.
3. **Execute Targeted Contradiction Sweep**:
   - Search other `AGENTS.md` files, references, and guides strictly for statements that affirm the opposite of $L$.
   - Collect exact file paths, line ranges, and conflicting text blocks.
   - If no learning exists and no contradictions are found, notify the user and terminate immediately.

### Step 2: Proposal Artifact (`learning_proposal.md`)

Create `<appDataDir>/brain/<conversation-id>/learning_proposal.md` using `write_to_file` with:

- `ArtifactMetadata`:
  - `UserFacing: true`
  - `RequestFeedback: true`
  - `Summary`: Brief multi-line summary of the lesson learned, the target file, and any contradictory statements to harmonize.

#### Proposal Structure (Keep it minimal and laser-focused)

````markdown
# Learning Proposal: <Concise Title of the Lesson>

## 1. Context & Lesson Learned
- **What happened**: <Brief description of the issue or user correction in this session>
- **The Invariant**: <The concrete rule or behavioral constraint to establish>

## 2. Primary Target File
- `path/to/target/AGENTS.md` (under section `## Local Contracts`)

### Proposed Contract (Diff)

```markdown
- **<Contract Name>**: <Concise, enforceable English rule text>
```

## 3. Direct Contradictions to Harmonize (if any)
<!-- If none found, write: "No direct contradictions detected across the DOX hierarchy or documentation." -->
- **Conflicting File**: `path/to/conflicting/file.md`
- **Contradiction**: <Explain exactly why this text contradicts the new learning>
- **Harmonization Diff**:
```markdown
<<<<
<Old conflicting text>
====
<New harmonized text conforming to the lesson>
>>>>
```
````

> [!IMPORTANT]
> **No Unrelated Sweeps & Strictly Pending Changes**: The proposal MUST NOT contain audits of unimpacted modules, speculative refactoring suggestions, or unrelated documentation edits. It MUST focus strictly on: (1) the primary lesson/contract in target `AGENTS.md` DOX files, (2) host program documentation (`README.md`, `docs/**`), and (3) collateral references, guides, examples, and templates inside affected skills (`.agents/skills/**`) directly affected by or demonstrating the new contract, resolving any direct contradictions to $L$.
> **Zero Re-Asking**: The proposal MUST NEVER list or re-ask approval for changes, file modifications, or deletions that have already been executed in the working tree during the session. Only list genuinely pending contracts or diffs waiting for disk application. If all lessons and harmonizations are already applied to disk, DO NOT generate `learning_proposal.md`.

After writing the artifact with `RequestFeedback: true`, present a clickable link to it in chat and stop your turn to wait for user confirmation.

### Step 3: Application to Working Tree

Once the user approves (via `[ Proceed ]` or chat confirmation):

1. **Apply the Primary Learning**:
   - Insert the proposed rule into the target `AGENTS.md` under `## Local Contracts` using `replace_file_content`.
2. **Apply Direct Contradiction Harmonizations**:
   - Update any files identified in Section 3 of the proposal that directly contradicted the lesson.
3. **Format Sanity Check**:
   - Run `npm run auditor:md` to verify that Markdown syntax, links, and table formatting remain valid.
   - Do NOT run Vitest or code test suites (`npm test`) — this is purely a documentation text update.
4. **Stop & Report**:
   - Report the updated files to the user.
   - **DO NOT COMMIT. DO NOT PUSH.** Leave the working tree modified and ready for the user's next action (such as `/safe-commit` when they decide to commit).
