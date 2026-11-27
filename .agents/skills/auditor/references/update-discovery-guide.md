# Update Discovery Protocol (`"busca actualizaciones"`)

This guide defines the standardized workflow whenever the user asks to check or search for updates (`"busca actualizaciones"`, `"buscar actualizaciones"`, `"revisar actualizaciones"`, `"check for updates"`, `"changelogs"`).

---

## 1. Mandatory Template & Consistent Execution

At the start of every update-discovery request, copy [`update-discovery-task-template.md`](./update-discovery-task-template.md) into `<appDataDir>/brain/<conversation-id>/task.md` (`Status: IN_PROGRESS`) and follow Phases 0–4 in exact order so every report uses the same structure and tables.

---

## 2. Context-Aware Scoping (`AUDITOR_REPO` vs `CONSUMER_PROJECT`)

Inspect `package.json#name` at the active workspace root first:

| Mode | Condition | Scope of `/find-skills` & `npm outdated` | How `@francogp/auditor` Updates Are Handled |
| :--- | :--- | :--- | :--- |
| `AUDITOR_REPO` | `package.json#name === '@francogp/auditor'` | Auditor's own `dependencies`, `devDependencies`, `peerDependencies`, `skills-lock.json`, and upstream `supabase/supabase` `docker/` changelog. | Updates may be executed normally inside the repo upon user approval (updating `peerDependencies`, skills, and `SUPABASE_DOCKER_SCHEMA_VERSION` if needed). |
| `CONSUMER_PROJECT` | `package.json#name !== '@francogp/auditor'` | Strictly the **user's host project** (`package.json`, `skills-lock.json`, and stack-relevant skills). | Check read-only via `npm run auditor:update check` (NEVER run `npm run auditor:update` during discovery). If outdated, report `@francogp/auditor` as **one more row** in the Pending Libraries table with its changelog summary and `npm run auditor:update` as the upgrade action. |

---

## 3. Step-by-Step Discovery Rules

1. **Skills Check via `/find-skills` (Phase 1)**:
   - Activate `/find-skills` to check for updates to installed skills and discover new official skills relevant to the active project's stack.
   - Run `npm exec --yes -- skills check` (never `npx`) when `skills-lock.json` is present.
2. **Libraries & Changelogs (Phase 2)**:
   - Run `npm outdated --json` (and `npm run auditor:update check` in `CONSUMER_PROJECT`).
   - Fetch official changelogs or GitHub release notes for every outdated package so the **Changelog Summary** column explains real new features, deprecations, and breaking changes rather than version numbers alone.
3. **Required Project Changes Plan (Phase 3)**:
   - Always close the report with a concrete **Required Project Changes** checklist covering:
     - Code migrations or breaking-change adaptations.
     - Configuration updates in `.auditor/audit.config.ts` or `package.json`.
     - Supabase Docker regeneration (`auditor-supabase clone` / `generate`) when `SUPABASE_DOCKER_SCHEMA_VERSION` or upstream Compose changed.
     - Skill additions/updates and post-update verification (`npm run auditor:fix`, `npm run test:coverage`, `npm run build` / `npm run auditor`).
4. **Approval Gate (Phase 4)**:
   - Do not modify `package.json`, `package-lock.json`, or `.agents/skills/` until the user confirms which updates to apply.
