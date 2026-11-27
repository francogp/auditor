# Update Discovery Task Ledger

> Location: `<appDataDir>/brain/<conversation-id>/task.md`
> Status: IN_PROGRESS

---

## Task Progress Checklist

- [ ] **Phase 0: Context Detection & Ledger Initialization**
  - [ ] Read `package.json` (`name`, `dependencies`, `devDependencies`, `peerDependencies`) directly (NEVER via `node -e`) to classify execution mode:
    - `AUDITOR_REPO` (`package.json#name === '@francogp/auditor'`) -> apply updates inside this repository when approved.
    - `CONSUMER_PROJECT` (`package.json#name !== '@francogp/auditor'`) -> scope `/find-skills` and outdated library analysis strictly to the user's host project, and check `@francogp/auditor` in read-only mode via `npm run auditor:update check` (NEVER run `auditor:update` during discovery).
  - [ ] Initialize `<appDataDir>/brain/<conversation-id>/task.md` from `.agents/skills/auditor/references/update-discovery-task-template.md` (NEVER grep `node_modules/@francogp/auditor/`). Even on compound prompts, complete Phases 0–3 in full before any library mutation.
- [ ] **Phase 1: Skills Update Discovery (`/find-skills`) & Auditor Deduplication**
  - [ ] Activate `/find-skills` to check for updates to installed skills and discover relevant new official skills for the active project's stack.
  - [ ] Inspect lockfile status (`skills-lock.json`) via `npm exec --yes -- skills check` (NEVER invoke `npx`).
  - [ ] Deduplicate against `/auditor` built-in docs (`supabase-docker-guide.md`, `modal-stack-governance-guide.md`, `vite-plus-guide.md`); mark redundant skills as `REDUNDANT (covered by /auditor)` in the **Skills Status Table**.
- [ ] **Phase 2: Pending Libraries, Compatibility Guard & Changelog Research**
  - [ ] Run `npm outdated --json` and `npm run auditor:dependencies` in the active project root.
  - [ ] Flag packages constrained by `AUDITOR_MAXIMUM_VERSIONS` (e.g. `typescript >= 7.0.0`) or `vite-plus` toolchain pinning (e.g. `@vitest/coverage-v8`, `vitest`, `vite`) as `HOLD / PINNED` (never recommend them as safe updates).
  - [ ] If `CONSUMER_PROJECT`: run `npm run auditor:update check` (read-only) and include `@francogp/auditor` in the **Pending Libraries Table** whenever a newer tag exists.
  - [ ] If `AUDITOR_REPO`: also inspect `peerDependencies` floors and upstream `supabase/supabase` `docker/` changelog (per `references/supabase-docker-guide.md`).
  - [ ] Research official changelogs and release notes for every pending library to identify new features, deprecations, and breaking changes.
- [ ] **Phase 3: Consolidated Report & Required Project Changes Plan**
  - [ ] Render the **Skills Status Table** (`Skill | Status | Source | Action`).
  - [ ] Render the **Pending Libraries & Changelogs Table** (`Library | Current | Latest | Bump | Changelog Summary`).
  - [ ] Render the **Required Project Changes** checklist at the end of the report detailing every code, config (`.auditor/audit.config.ts`, `package.json`), Supabase artifact (`auditor-supabase clone` / `generate` if `SUPABASE_DOCKER_SCHEMA_VERSION` changed), and skill migration needed to adopt the changelogs.
  - [ ] Pause for explicit user approval before applying any updates.
- [ ] **Phase 4: Approved Execution & Verification (Only After User Approval)**
  - [ ] Apply approved skill updates (`npm exec --yes -- skills update -p -y` or targeted installs).
  - [ ] Apply approved library updates (in `CONSUMER_PROJECT`, update `@francogp/auditor` strictly via `npm run auditor:update`; in `AUDITOR_REPO`, apply updates normally and align `peerDependencies` / `SUPABASE_DOCKER_SCHEMA_VERSION` if needed).
  - [ ] Implement the required project changes listed in Phase 3.
  - [ ] Verify cleanly (`npm run auditor:fix`, `npm run test:coverage`, `npm run build` or `npm run auditor`) and mark `task.md` `Status: COMPLETED`.

---

## Discovery Records & Report Tables

- **Project Mode**: `<AUDITOR_REPO | CONSUMER_PROJECT>` (`<package.json#name>`)
- **Installed Auditor Version**: `<version>`

### Skills Status Table

| Skill | Status | Source | Action |
| :--- | :--- | :--- | :--- |
| `(pending)` | `PENDING` | `-` | `-` |

### Pending Libraries & Changelogs Table

| Library | Current | Latest | Bump | Changelog Summary |
| :--- | :--- | :--- | :--- | :--- |
| `(pending)` | `-` | `-` | `-` | `-` |

### Required Project Changes

- `(list every concrete code, config, Supabase Docker, and skill change required to adopt the changelogs)`
