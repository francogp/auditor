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
  - [ ] `npm run audit:fallow` (Record BASELINE_HEALTH)
  - [ ] Code-Only Safety Backup (`mkdir -p scratch/backups && git diff HEAD -- '*.ts' '*.vue' '*.js' '*.scss' '*.css' '*.sql' ':!*.json' > scratch/backups/pre_audit_backup.patch`)
  - [ ] Version Bump Decision (`npm run version:analyze` & `ask_question` with updated build stamps across all 3 SemVer options + build-only; run `version:bump` if approved)
  - [ ] Pre-draft commit message (The Elegant Protocol synthesis in `task.md`)
- [ ] **Phase 2: Active Verification & Repair Loop 🔁 (Exits ONLY on All 5 Gates Passing)**
  - [ ] **Loop Cycle Checks (Must ALL pass consecutively on final code)**:
    - [ ] `git fetch origin` + `npm run audit` (Gate 2.1: 0 errors + warning ratchet with 0 new warnings vs `ratchet.productionRef`; commit any shrunk `.auditor/audit-baseline.json`)
    - [ ] `npm run test` (Gate 2.2: 100% test suites passing)
    - [ ] `npm run build` 🔒 **THE BUILD GATE** (Gate 2.3: STRICT Exit Code 0 — zero bypasses, single run)
    - [ ] `npm run audit:build` (Gate 2.4: Post-build compiled artifact audit, unless already chained by `build`)
    - [ ] `npm run audit:fallow` (Gate 2.5: Score ≥ 85 and ≥ BASELINE_HEALTH)
  - [ ] **Loop Repair Action (Triggered on ANY failure above; repeat until all gates pass)**:
    - [ ] `npm run audit:fix` / manual code fixes applied in workspace
    - [ ] Re-run cycle checks until all 5 gates exit with code 0
- [ ] **Phase 3: Lessons Extraction, Walkthrough & 🛑 Hard Stop**
  - [ ] Extract lessons learned via `learn-with-docs`
  - [ ] Create `<appDataDir>/brain/<conversation-id>/learning_proposal.md`
  - [ ] Create/Update `<appDataDir>/brain/<conversation-id>/walkthrough.md`
  - [ ] Workspace cleanup (Clean temporary files from `scratch/`)
  - [ ] Call `ask_question` for learning proposal & commit approval
  - [ ] 🛑 HARD STOP (Wait for approval before Phase 4)
- [ ] **Phase 4: Single Atomic Certified Commit & Completion**
  - [ ] Apply approved lessons and modernizations to `AGENTS.md` and documentation
  - [ ] Pre-commit Sanity Check (`npm run audit:md`)
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
- **audit (Full Auditor + Warning Ratchet)**: `PENDING (0 ERRORS, 0 NEW WARNINGS REQUIRED)`
- **test**: `PENDING`
- **npm run build (THE GATE)**: `PENDING (MUST BE EXIT 0)`
- **audit:build**: `PENDING`
- **final fallow health**: `PENDING`
- **Repairs Applied**:
  - `(none yet)`
