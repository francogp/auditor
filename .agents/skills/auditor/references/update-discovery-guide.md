# Update Discovery Protocol (`"busca actualizaciones"`)

This guide defines the standardized workflow whenever the user asks to check or search for updates (`"busca actualizaciones"`, `"buscar actualizaciones"`, `"revisar actualizaciones"`, `"check for updates"`, `"changelogs"`).

---

## 1. Mandatory Template & Consistent Execution

At the start of every update-discovery request (including typos and compound requests such as `"busca actualizaciones y corregí errores nuevos"`), copy [`update-discovery-task-template.md`](./update-discovery-task-template.md) from the active skill directory (`.agents/skills/auditor/references/`) into `<appDataDir>/brain/<conversation-id>/task.md` (`Status: IN_PROGRESS`) and follow Phases 0–4 in exact order so every report uses the same structure and tables.

- **Active Skill Path**: Always read these guides from `.agents/skills/auditor/references/` — NEVER search or grep inside `node_modules/@francogp/auditor/`.
- **Compound Prompts Rule**: If the user asks to search for updates **and** fix audit errors in the same turn, you may diagnose/fix blocking audit errors, but you MUST still produce the complete Update Discovery report (Phases 0–3) and you MUST NOT run `node -e` or modify `package.json` / `package-lock.json` to upgrade libraries until Phase 4 approval.

---

## 2. Context-Aware Scoping (`AUDITOR_REPO` vs `CONSUMER_PROJECT`)

Inspect `package.json#name` at the active workspace root first:

| Mode | Condition | Scope of `/find-skills` & `npm outdated` | How `@francogp/auditor` Updates Are Handled |
| :--- | :--- | :--- | :--- |
| `AUDITOR_REPO` | `package.json#name === '@francogp/auditor'` | Auditor's own `dependencies`, `devDependencies`, `peerDependencies`, `skills-lock.json`, and upstream `supabase/supabase` `docker/` changelog. | Updates may be executed normally inside the repo upon user approval (updating `peerDependencies`, skills, and `SUPABASE_DOCKER_SCHEMA_VERSION` if needed). |
| `CONSUMER_PROJECT` | `package.json#name !== '@francogp/auditor'` | Strictly the **user's host project** (`package.json`, `skills-lock.json`, and stack-relevant skills). | Check read-only via `npm run auditor:update check` (NEVER run `npm run auditor:update` during discovery). If outdated, report `@francogp/auditor` as **one more row** in the Pending Libraries table with its changelog summary and `npm run auditor:update` as the upgrade action. |

---

## 3. Step-by-Step Discovery Rules

1. **Skills Check via `/find-skills` & Auditor Deduplication (Phase 1)**:
   - Activate `/find-skills` to check for updates to installed skills and discover new official skills relevant to the active project's stack.
   - Run `npm exec --yes -- skills check` (never `npx`) when `skills-lock.json` is present.
   - **Auditor Deduplication**: Before recommending installing or keeping a skill, verify whether `@francogp/auditor` already documents/provides that capability natively (e.g., `supabase-docker-guide.md` for multi-server `.env` parsing like `env-multi-server-parser`, `modal-stack-governance-guide.md`, `vite-plus-guide.md`). Mark overlapping skills as `REDUNDANT (covered by /auditor)` and recommend removing or skipping them.
2. **Libraries, Compatibility Guard & Changelogs (Phase 2)**:
   - Run `npm outdated --json` AND `npm run auditor:dependencies` (plus `npm run auditor:update check` in `CONSUMER_PROJECT`). Never use `node -e` to inspect `package.json`.
   - **Compatibility & Ceiling Guard**: Cross-check every outdated package against `AUDITOR_MAXIMUM_VERSIONS` (e.g. `typescript >= 7.0.0`, which drops `ts.createProgram()` and breaks AST analyzers / `vue-tsc`) and `vite-plus` toolchain pinning (`@vitest/coverage-v8`, `vitest`, `vite`). Mark held/pinned packages explicitly as `HOLD / PINNED` — NEVER place them in "Safe Updates" batches.
   - Fetch official changelogs or GitHub release notes for every outdated package so the **Changelog Summary** column explains real new features, deprecations, and breaking changes rather than version numbers alone.
3. **Required Project Changes Plan (Phase 3)**:
   - Always close the report with a concrete **Required Project Changes** checklist covering:
     - Code migrations or breaking-change adaptations.
     - Configuration updates in `.auditor/audit.config.ts` or `package.json`.
     - Supabase Docker regeneration (`auditor-supabase clone` / `generate`) when `SUPABASE_DOCKER_SCHEMA_VERSION` or upstream Compose changed.
     - Skill additions/updates and post-update verification (`npm run auditor:fix`, `npm run test:coverage`, `npm run build` / `npm run auditor`).
4. **Approval Gate (Phase 4)**:
   - Do not modify `package.json`, `package-lock.json`, or `.agents/skills/` until the user confirms which updates to apply.
