# Safe Commit Task Ledger

> Location: `<appDataDir>/brain/<conversation-id>/task.md`
> Status: IN_PROGRESS

---

## Task Progress Checklist

- [ ] **Phase 0: Pre-Flight Configuration Ratchet & Setup Gate & Artifact Initialization**
  - [ ] Gate 0.0: Pre-Flight Setup & Ratchet Gate (`npm run auditor:setup` / `npm run auditor phase=setup`; zero unauthorized relaxations or satellite config desync)
  - [ ] Step 0.1: Write `<appDataDir>/brain/<conversation-id>/task.md` with complete checklist
  - [ ] Step 0.2: Note scratch directory path: `<appDataDir>/brain/<conversation-id>/scratch/`
- [ ] **Phase 1: Test Gap Analysis & Zero-Commit Safety Backup**
  - [ ] `git status` & `git diff` review (Inspect changes, session artifacts, and `.auditor/audit-baseline.json`)
  - [ ] Test Gap Analysis (Audit non-trivial logic for unit tests in `tests/`)
  - [ ] Code-Only Safety Backup (`git diff HEAD --output=scratch/backups/pre_audit_backup.patch -- "*.ts" "*.vue" "*.js" "*.scss" "*.css" "*.sql" ":!*.json"`)
  - [ ] Version Bump Decision (If explicit in prompt: apply requested canonical type; if unspecified/ambiguous: display analysis table in chat & prompt via `ask_question`; run `version:bump`)
  - [ ] Pre-draft commit message (The Elegant Protocol synthesis in `task.md`)
- [ ] **Phase 2: Active Verification & Repair Loop 🔁 (Exits ONLY on Gates 2.1 & 2.2 Passing)**
  - [ ] **Loop Cycle Checks (No redundant sub-commands)**:
    - [ ] `npm run test:coverage` (Gate 2.1: 100% test suites passing + freshly emitted `scratch/coverage/coverage-final.json` artifact; skip re-running if `src/` and `tests/` were unchanged)
    - [ ] `npm run build` 🔒 **THE MASTER BUILD GATE** (Gate 2.2: STRICT Exit Code 0 — atomic single run chaining `auditor:full` [incl. `validate_fallow`, `validate_similar_code`, `auditor:md`, `oxlint`, `oxfmt`], compilation, and `auditor:post-build`)
  - [ ] **Loop Repair Action (Triggered on ANY failure above)**:
    - [ ] `npm run auditor:fix` / manual fixes applied (`task=<id>` verified)
    - [ ] Re-run Gate 2.1 (only if `src/` or `tests/` changed) + Gate 2.2 until exit code 0
- [ ] **Phase 3: Documentation Alignment, Lessons Extraction & 🛑 Hard Stop**
  - [ ] Step 3.1: Workspace cleanup (Clean temporary files from `scratch/`, keeping `scratch/backups/`)
  - [ ] Step 3.2: Create/Update `<appDataDir>/brain/<conversation-id>/walkthrough.md` (Informative record, `RequestFeedback: false`)
  - [ ] Step 3.3: 3-Pillar Documentation Audit (Verify `src/`, `package.json`, and config diffs against `README.md`, `AGENTS.md`, owned skills)
  - [ ] Step 3.3: Generate `learning_proposal.md` via `learn-with-docs` as the FINAL tool call (`RequestFeedback: true`; MANDATORY whenever code, scripts, or configs changed and docs are pending on disk)
  - [ ] Present artifact links (`learning_proposal.md` & `walkthrough.md`) in chat
  - [ ] 🛑 HARD STOP (Mandatory stop: await user approval on `learning_proposal.md` before advancing to Phase 4)
- [ ] **Phase 4: Single Atomic Certified Commit & Completion**
  - [ ] Apply approved lessons and modernizations to `AGENTS.md` and documentation
  - [ ] Pre-commit Sanity Check (Run `npm run auditor:md` ONLY if Step 4.1 edited `.md` files + staged secret leak scan)
  - [ ] Synthesize final Elegant Protocol commit message
  - [ ] Atomic Commit & Tag:
    - [ ] If version bumped: `git add . ; git commit -F scratch/release_notes.txt ; git tag -a v<base_version> -F scratch/release_notes.txt` (or `&&` in Bash)
    - [ ] If version unchanged: `git add . ; git commit -F scratch/release_notes.txt` (or `&&` in Bash)
  - [ ] Mark Phase 4 `[x]`
  - [ ] Render final Safe Commit Completion Template (Autonomous push prohibited; display `git push` command for user)

---

## Step Records & Execution Metrics

### Workspace Safety Backup

- **Modified Files**:
  - `(none recorded yet)`
- **Safety Patch File**: `scratch/backups/pre_audit_backup.patch`
- **Pre-Drafted Commit Message**:
  - `(drafted in Step 1.5)`

### Verification & Repair Loop Status

- **Loop Iteration Count**: `0`
- **test:coverage (Tests & Dynamic Coverage)**: `PENDING (100% PASS OR SKIPPED)`
- **npm run build (THE MASTER GATE: auditor:full + compile + auditor:post-build)**: `PENDING (MUST BE EXIT 0)`
- **Repairs Applied**:
  - `(none yet)`
