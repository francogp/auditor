# Commit Message Standards (The Elegant Protocol)

Commit messages MUST NOT be terse. They MUST provide a clear, technical chronicle of the "what", "why", and "how" to maintain the project's high-rigor history.

## Source of Truth for Commit Synthesis (Full Working Tree Mandate)

The final commit message is synthesized exclusively in **Phase 4 (Step 4.3)** from:

1. The actual **`git diff HEAD` and `git status` covering 100% of all modified, added, and deleted files across the ENTIRE working tree**.
   - **MANDATORY FULL REPOSITORY AUDIT**: Because Phase 4 executes `git add .` to create a single atomic certified commit, the commit message MUST reflect all modified files in the working tree.
   - **MULTI-SUBSYSTEM MANDATE**: It is STRICTLY FORBIDDEN to restrict the commit message to only the immediate chat conversation, prompt, or last bugfix when `git status` contains uncommitted changes across other features or modules. If multiple subsystems are modified, the commit message MUST categorize and detail every single modified subsystem (e.g., grouped by subsystem headers or categorized bullets).
2. All **session artifacts** stored in `<appDataDir>/brain/<conversation-id>/` (`implementation_plan.md`, `task.md`, `walkthrough.md`, custom skill artifacts, scratch notes, and plan logs).
3. The **unit tests added in Phase 1**, **audit repairs / optimizations in Phase 2**, and **lessons / DOX updated in Phase 3**.

You MUST cross-reference the complete `git diff HEAD` and `git status` with the functional intent and feature/fix context from these artifacts to produce a precise, high-rigor technical chronicle. Do not rely on unverified memory or narrow conversation scope alone.

## Single Atomic Certified Commit Strategy

The project mandates **Atomic Commits**. A commit is never created until all tests, audits, typechecks, builds, and documentation approvals are complete.

| Phase | Action | Purpose | Output |
|:---|:---|:---|:---|
| **Phase 1** | Safety Backup & Pre-Draft | Safe local recovery & early message drafting | Patch file in `scratch/backups/` (Zero git commits) |
| **Phase 2** | Active Verification Loop | Verify and repair code in workspace | Clean code, 0 errors, 0 new warnings, build exit 0 |
| **Phase 3** | Documentation & Approval | Document lessons & get user review | `AGENTS.md` and walkthrough updated |
| **Phase 4** | Single Atomic Commit | Consolidate entire verified unit of work | Exactly ONE elegant commit in Git history |

## Structure (The Elegant Protocol)

```text
<type>(<scope>): <short imperative description>

- <what changed and why — bullet 1>
- <what changed and why — bullet 2>
- <what changed and why — bullet 3>
```

**Types**: `feat`, `fix`, `refactor`, `perf`, `chore`, `docs`, `test`

**Rules**:

- The header line is the commit summary — make it clear, concise, and descriptive across the primary modified scopes. Never artificially truncate or cripple header clarity for arbitrary character limits.
- Every bullet must specify *what* changed and *why* it matters technically.
- For changes across 2+ files, a bulleted list is MANDATORY.

## Hierarchical Synthesis for Large Working Trees

When the working tree contains extensive, multi-subsystem changes across multiple files:

1. **Mandatory Subsystem Grouping**: Group changes under clear subsystem categories (e.g., `Core Engine & AST Parsers:`, `Bundle & Production Chunks:`, `CLI Tools:`, `DOX & Governance:`).
2. **File List**: Each subsystem list MUST specify the affected files.
3. **Behavioral Detail**: Describe the specific functional enhancements, bug fixes, or performance gains.

### Standard Feature Multi-Subsystem Commit Template

```markdown
feat(core,bundle): integrate production chunk bottleneck analyzer and expand budget config

Core Engine & AST Parsers:
- src/core/auditConfig.ts: add ChunkBudgetConfig and extend AuditBundleConfig with custom budget matchers
- src/core/unifiedTheme.ts: format 80-column Box-Drawing tables for bundle and chunk metrics

Bundle & Production Chunks:
- src/cli/audit_bundle.ts: extract and analyze treemap data from rollup-plugin-visualizer (scratch/bundle_stats.html)
- tests/audit_bundle.test.ts: verify hermetic chunk size budget validation and duplicate module detection

DOX & Framework Governance:
- AGENTS.md: document canonical production bundle gatekeeper contracts
```

## Forbidden Patterns

- Single-word messages (`commit`, `update`, `fix`).
- Messages without a bulleted list for changes involving 2+ files.
- Arbitrary truncation or chopping of commit headers to appease legacy character limits.
- Vague descriptions like "minor changes" or "various fixes" without specifying the technical "what".
- Commit messages written from memory instead of reviewing the actual `git diff`.
- Drafting commit messages that only describe the current chat conversation or last bugfix while omitting other uncommitted changes present in `git status` / `git diff HEAD` across the working tree.
