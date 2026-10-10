# Safe Commit Task Ledger

> Location: `<appDataDir>/brain/<conversation-id>/task.md`
> Status: IN_PROGRESS

---

## Task Progress Checklist

- [ ] **Phase 0: Mandatory Artifact Initialization**
  - [ ] Write `<appDataDir>/brain/<conversation-id>/task.md` with complete checklist
  - [ ] Note scratch directory path: `<appDataDir>/brain/<conversation-id>/scratch/`
- [ ] **Phase 1: Test Gap Analysis & Zero-Commit Safety Backup**
  - [ ] `git status` & `git diff` review (Inspect changes, session artifacts, and `.auditor/audit-baseline.json`)
  - [ ] Test Gap Analysis (Audit non-trivial logic for unit tests in `tests/`)
  - [ ] `npm run auditor:fallow` (Record BASELINE_HEALTH)
  - [ ] Code-Only Safety Backup (`mkdir -p scratch/backups && git diff HEAD -- '*.ts' '*.vue' '*.js' '*.scss' '*.css' '*.sql' ':!*.json' > scratch/backups/pre_audit_backup.patch`)
  - [ ] Version Bump Decision (Display analysis table in chat & `ask_question` with updated build stamps across all 3 SemVer options + build-only; run `version:bump` if approved)
  - [ ] Pre-draft commit message (The Elegant Protocol synthesis in `task.md`)
- [ ] **Phase 2: Active Verification & Repair Loop 🔁 (Exits ONLY on All 3 Gates Passing)**
  - [ ] **Loop Cycle Checks (Must ALL pass consecutively on final code)**:
    - [ ] `npm run test:coverage` (Gate 2.1: 100% test suites passing + freshly emitted `coverage/coverage-final.json` artifact; conditionally `[SKIPPED]` if `testCoverage.enabled === false` or `enforceInAudit === false`)
    - [ ] `npm run build` 🔒 **THE MASTER BUILD GATE** (Gate 2.2: STRICT Exit Code 0 — atomic single run chaining pre-build `auditor`, compilation, and post-build `auditor:build`)
    - [ ] `npm run auditor:fallow` (Gate 2.3: Score ≥ 85 and ≥ BASELINE_HEALTH)
  - [ ] **Loop Repair Action (Triggered on ANY failure above; repeat until all gates pass)**:
    - [ ] `npm run auditor:fix` / manual code fixes applied in workspace
    - [ ] Re-run cycle checks until all 3 gates exit with code 0
- [ ] **Phase 3: Documentation Alignment, Lessons Extraction & 🛑 Hard Stop**
  - [ ] 3-Pillar Documentation Audit (Verify src/, package.json, and config diffs against README.md, AGENTS.md, skills)
  - [ ] Generate learning_proposal.md via learn-with-docs (MANDATORY whenever code, scripts, or configs changed and docs are pending on disk)
  - [ ] Workspace cleanup (Clean temporary files from `scratch/`)
  - [ ] Create/Update `<appDataDir>/brain/<conversation-id>/walkthrough.md` (Informative record, `RequestFeedback: false`)
  - [ ] Present artifact links (`learning_proposal.md` & `walkthrough.md`) in chat
  - [ ] 🛑 HARD STOP (Mandatory stop: await user approval on learning_proposal.md before advancing to Phase 4)
- [ ] **Phase 4: Single Atomic Certified Commit & Completion**
  - [ ] Apply approved lessons and modernizations to `AGENTS.md` and documentation
  - [ ] Pre-commit Sanity Check (`npm run auditor:md`)
  - [ ] Synthesize final Elegant Protocol commit message
  - [ ] Atomic Commit & Tag:
    - [ ] If version bumped: `git add . && git commit -F scratch/release_notes.txt && git tag -a v<base_version> -F scratch/release_notes.txt`
    - [ ] If version unchanged: `git add . && git commit -F scratch/release_notes.txt`
  - [ ] Mark Phase 4 `[x]`
  - [ ] Render final Safe Commit Completion Template (Autonomous push prohibited; display `git push` command for user)

---

## Step Records & Execution Metrics

### Workspace Safety Backup

- **Modified Files**:
  - `(none recorded yet)`
- **Safety Patch File**: `scratch/backups/pre_audit_backup.patch`
- **Baseline Fallow Health**: `BASELINE_HEALTH = UNSET`
- **Pre-Drafted Commit Message**:
  - `(drafted in Step 1.4)`

### Verification & Repair Loop Status

- **Loop Iteration Count**: `0`
- **test:coverage (Tests & Dynamic Coverage)**: `PENDING (100% PASS OR SKIPPED)`
- **npm run build (THE MASTER GATE: auditor + compile + auditor:build)**: `PENDING (MUST BE EXIT 0)`
- **auditor:fallow (Final Fallow Health)**: `PENDING (SCORE ≥ 85)`
- **Repairs Applied**:
  - `(none yet)`
