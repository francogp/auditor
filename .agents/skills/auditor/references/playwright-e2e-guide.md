# Playwright E2E & Browser Runtime Guide

This reference provides the canonical operational guide for installing, updating, auditing, and running Playwright (`@playwright/test` and `/playwright-cli`) in projects governed by `@francogp/auditor`.

---

## 1. Installing & Updating Playwright Browser Binaries (Zero `npx`)

When `@playwright/test` is installed or upgraded, Playwright bumps its expected Chromium revision (e.g. `chromium_headless_shell-1255`). If `~/.cache/ms-playwright/` lacks that revision, Playwright throws:

> `Error: browserType.launch: Executable doesn't exist at .../ms-playwright/chromium_headless_shell-<rev>/...`

**Canonical Remediation (Zero `npx` Mandate)**:
- **Automated via Auditor**: Run `npm run auditor:fix`. The `validate_playwright_config` suite detects `playwright-browser-missing` in `phase: 'setup'` and executes the local installer automatically.
- **Direct CLI Invocation**: Run `npm exec -- playwright install chromium` (or `node_modules/.bin/playwright install chromium`).
- **Linux System Libraries (if missing)**: Run `npm exec -- playwright install-deps chromium`.
- **Prohibition**: NEVER invoke `npx` to install or run Playwright; always use `npm exec -- ...` or local binaries in `node_modules/.bin/`.

---

## 2. Running Playwright E2E Tests

- **Single Isolated Spec (Direct Runner Invocation)**:
  ```bash
  npm exec -- playwright test tests/e2e/<spec_file>.spec.ts --project=chromium --reporter=line
  ```
- If the host project defines a `test:e2e` script in `package.json`, pass the single isolated spec path after `--` instead of running the full matrix.

---

## 3. Reproducing Live UI Bugs: `/playwright-cli` vs `@playwright/test`

Choose the right Playwright tool based on the task:

### A. Interactive Probing with `/playwright-cli`
Activate and follow the **`/playwright-cli`** skill when diagnosing a live dev/preview server (`http://localhost:PORT`) interactively (inspecting DOM snapshots, console errors, network 404/500 responses, and taking screenshots):

```bash
npm exec -- playwright-cli open http://localhost:5173
npm exec -- playwright-cli snapshot
npm exec -- playwright-cli click e15
npm exec -- playwright-cli console
npm exec -- playwright-cli requests
npm exec -- playwright-cli screenshot --filename=scratch/ui_bug.png
npm exec -- playwright-cli close
```

*(If `playwright-cli` is installed globally, `playwright-cli <subcommand>` works directly without `npm exec --`.)*

### B. Automated Deterministic Regression (`reproduce_<slug>.spec.ts`)
When reproducing a UI/API/chart/modal bug under `/systematic-debugging` (Tier 3), write an **isolated** reproduction test under `config.paths.e2eRoots` (e.g. `tests/e2e/reproduce_<slug>.spec.ts`):

1. **Never Depend on Unrelated Legacy E2E Matrices**: Do NOT blindly run unrelated multi-table or visual E2E suites whose assertions depend on mutable database rows (`#tab-table-2`, seeded counts) and fail for reasons unrelated to the bug.
2. **Capture Console, Page Errors, and HTTP 4xx/5xx Responses**:
   ```ts
   const consoleErrors: string[] = [];
   const pageErrors: string[] = [];
   const failedResponses: string[] = [];

   page.on('console', (msg) => {
     if (msg.type() === 'error') consoleErrors.push(msg.text());
   });
   page.on('pageerror', (err) => pageErrors.push(err.message));
   page.on('response', (res) => {
     if (res.status() >= 400) failedResponses.push(`${res.status()} ${res.url()}`);
   });
   ```
3. **Deterministic State**: Isolate client↔API contracts cleanly with `page.route(...)` or dedicated test seeding, reproduce the exact failure in **RED** before editing `src/`, and verify **GREEN** (`consoleErrors`, `pageErrors`, and `failedResponses` all empty) after the fix.

---

## 4. Configuration Governance (`validate_playwright_config`)

- **`playwright-config-missing`**: Auto-scaffolds canonical `playwright.config.ts` in `npm run auditor:fix`.
- **`playwright-config-missing-setting`**: Enforces `timeout`, `reporter`, `use.trace`, and `vp dev` (never `npx` with Vite) in `webServer.command`.
- **`playwright-browser-missing`**: Verifies the Chromium executable required by `playwright-core` exists on disk and auto-installs it in `npm run auditor:fix`.
- **Oxlint Scoping**: Files under `paths.e2eRoots` automatically receive E2E/test Oxlint overrides in `vite.config.ts` via `npm run auditor:fix`.
