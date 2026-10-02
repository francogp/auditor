# Safe Commit Task Ledger

> Location: `<appDataDir>/brain/<conversation-id>/task.md`
> Status: IN_PROGRESS

---

## Task Progress Checklist

- [ ] **Phase 0: Mandatory Artifact Initialization**
  - [ ] Write `<appDataDir>/brain/<conversation-id>/task.md` with complete checklist
  - [ ] Note scratch directory path: `<appDataDir>/brain/<conversation-id>/scratch/`
- [ ] **Phase 1: Test Gap Analysis & Zero-Commit Safety Backup**
  - [ ] `git status` & `git diff` review (Inspect changes and session artifacts)
  - [ ] Test Gap Analysis (Audit non-trivial logic for unit tests in `tests/`)
  - [ ] `npm run audit:fallow` (Record BASELINE_HEALTH)
  - [ ] Code-Only Safety Backup (`mkdir -p scratch/backups && git diff HEAD -- '*.ts' '*.vue' '*.js' '*.scss' '*.css' '*.sql' ':!*.json' > scratch/backups/pre_audit_backup.patch`)
  - [ ] Version Bump Decision (`npx auditor-version analyze` & `ask_question`; run `bump` if approved)
  - [ ] Pre-draft commit message (The Elegant Protocol synthesis in `task.md`)
- [ ] **Phase 2: Active Verification & Repair Loop 🔁 (Exits ONLY on All 6 Gates Passing)**
  - [ ] **Loop Cycle Checks (Must ALL pass consecutively on final code)**:
    - [ ] `npm run audit:md` (Gate 2.1: DOX Maintenance & fast Markdown audit — 0 errors)
    - [ ] `npm run audit:for-commit` (Gate 2.2: 0 errors, 0 new warnings vs origin/main)
    - [ ] `npm run test` (Gate 2.3: 100% test suites passing)
    - [ ] `npm run build` 🔒 **THE BUILD GATE** (Gate 2.4: STRICT Exit Code 0 — zero bypasses, single run)
    - [ ] `npm run audit:bundle` (Gate 2.5: Build optimization & chunk budget validation)
    - [ ] `npm run audit:fallow` (Gate 2.6: Score ≥ 85 and ≥ BASELINE_HEALTH)
  - [ ] **Loop Repair Action (Triggered on ANY failure above; repeat until all gates pass)**:
    - [ ] `npm run audit:fix` / manual code fixes applied in workspace
    - [ ] Re-run cycle checks until all 6 gates exit with code 0
- [ ] **Phase 3: Lessons Extraction, Walkthrough & 🛑 Hard Stop**
  - [ ] Extract lessons via `/learn-with-docs`
  - [ ] Create `<appDataDir>/brain/<conversation-id>/learning_proposal.md`
  - [ ] Create/Update `<appDataDir>/brain/<conversation-id>/walkthrough.md`
  - [ ] Workspace cleanup (Clean temporary files from `scratch/`)
  - [ ] Call `ask_question` for learning proposal & commit approval
  - [ ] 🛑 HARD STOP (Wait for approval before Phase 4)
- [ ] **Phase 4: Single Atomic Certified Commit & Completion**
  - [ ] Apply approved lessons to `AGENTS.md`
  - [ ] Pre-commit Sanity Check (`npm run audit:md`)
  - [ ] Synthesize final Elegant Protocol commit message
  - [ ] `git add .` & `git commit -m "<message>"` (Single Atomic Certified Commit)
  - [ ] Git tag & push with `--follow-tags` (if version bumped in Phase 1)
  - [ ] Mark Phase 4 `[x]`

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
- **audit:md**: `PENDING`
- **audit:for-commit**: `PENDING`
- **test**: `PENDING`
- **npm run build (THE GATE)**: `PENDING (MUST BE EXIT 0)`
- **audit:bundle**: `PENDING`
- **final fallow health**: `PENDING`
- **Repairs Applied**:
  - `(none yet)`
