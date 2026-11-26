# Host Installation, NPM Updates & Dependency Governance (`@francogp/auditor`)

This reference details the canonical architecture and workflow for installing, updating, and consuming `@francogp/auditor` as a standard GitHub npm dependency in consumer host applications (such as standalone web apps, monorepos, and CLI tooling packages).

---

## 1. Initial Installation in Consumer Host Projects

To install `@francogp/auditor` in a host application, run standard `npm install`:

```bash
npm install -D github:francogp/auditor#v10.15.4 --allow-git=all
```

- **Lockfile Registration**: `npm install` fetches the package from GitHub and records the exact commit hash and checksum in `package-lock.json`.
- **Pre-Compiled Artifacts in Git**: The `dist/` directory is pre-compiled and tracked directly in the repository with executable permissions (`100755`), ensuring immediate availability in `node_modules/.bin/` without requiring local compilation or install hooks.
- **npm 12+ Zero-Setup Pre-Flight Auto-Bootstrap**: In npm 12+, dependency lifecycle scripts (`postinstall`) are disabled by default. `@francogp/auditor` features an automated pre-flight bootstrap engine (`ensureProjectBootstrapped`) that executes transparently whenever `auditor` or `npm run auditor` is called. It scaffolds `.auditor/audit.config.ts` on virgin projects, automatically injects missing configuration sections via AST on older projects, registers `.agents/skills.json` and `.agents/plugins.json`, and synchronizes `.gitignore` entries. It also persists `allow-git=all` in the host `.npmrc` (`ensureNpmrcAllowGit`), required by npm 12+ for Git-hosted dependencies.
- **Antigravity Skills & Plugin Registration**: Generated automatically during pre-flight bootstrap (or manually via `auditor-init-agent`), declaring:

  ```json
  // .agents/skills.json
  {
    "entries": [
      {
        "path": "node_modules/@francogp/auditor/.agents/skills"
      }
    ]
  }
  ```

  ```json
  // .agents/plugins.json
  {
    "entries": [
      {
        "path": "node_modules/@francogp/auditor"
      }
    ]
  }
  ```

  This allows Antigravity AI agents to dynamically discover all official skills (`.agents/skills/*`) and rules (`AGENTS.md`) directly from `node_modules/@francogp/auditor` without duplicating files in-tree or using fragile symlinks.

---

## 2. Bringing Updates from GitHub (Updating `package-lock.json`)

> 🔴 **NATIVE NPM UPDATE MANDATE (ZERO CLONING OR MAKESHIFT SCRIPTS)**:
> When a user or task requests to _"update the auditor"_, _"pull latest auditor changes"_, _"update skills"_, or sync the static analysis engine, developers and AI agents **MUST NEVER** execute `git clone`, create submodules, run ad-hoc `node -e` scripts, inspect `git log` inside `node_modules`, or copy files between repositories.
> Updates MUST be performed 100% natively through the official updater or npm.
>
> [!CAUTION]
> **ABSOLUTE PROHIBITION ON MANUAL VERSION OR CONFIG BUMPS IN CONSUMER REPOSITORIES**: AI agents and developers are STRICTLY AND CATEGORICALLY PROHIBITED from manually editing (`write_file`, `edit_file`) `package.json`, `package-lock.json`, or `.auditor/audit.config.ts` (including `auditorVersion`) in consumer projects to simulate or apply an update. Modifying versions or configs by hand desynchronizes lockfiles, shims, installed modules, satellite configs, and environment scripts. Upgrades MUST be executed exclusively through `npm run auditor:update` (or `auditor-update`) inside the consumer project, or `npm run auditor:update project=<path>` (`auditor-update --project <path>`) from the auditor workspace.

### Canonical Update Command

```bash
npm run auditor:update
# or directly:
auditor-update
```

Under the hood, `auditor-update`:

1. Queries upstream release tags via `git ls-remote --tags` with numerical SemVer sorting (`parseTagSemver` / `compareTagsDescending`), or accepts an explicit target tag via `npm run auditor:update [targetVersion]`.
2. Snapshots `package.json`, `package-lock.json`, and `.npmrc` (restoring them atomically on failure), elevates declared dependency ranges dynamically from SSoT `peerDependencies`, prunes stale coupled `vite-plus`/`vitest`/`@vitest/*` lockfile entries to prevent `ERESOLVE`, and executes `npm install -D github:francogp/auditor#<targetTag>`.
3. Synchronizes Antigravity agent skills in `.agents/skills/` and setup scripts (`setup-windows.ps1`, `setup-linux.sh`).
4. Executes `auditor fix` to synchronize satellite configurations and canonical scripts.
5. Automatically enforces and installs any production or development dependencies that fall below the newly installed `@francogp/auditor`'s `peerDependencies` floors, then runs `phase=setup` verification.
6. **Post-Update Dependency Inspection (`auditor-dependencies`)**: Run `npm run auditor:dependencies` (or `auditor-dependencies`) anytime to verify that all declared project libraries and lockfile versions satisfy the active SSoT floors (or `npm run auditor:dependencies commands` to inspect manual install commands).
7. Commit the updated `package.json` and `package-lock.json` to lock the audited version for the entire team and CI.

---

## 3. Hermetic, Reproducible Installs with `npm ci`

In CI/CD environments, production Docker containers, and clean developer checkouts:

```bash
npm ci
```

- `npm ci` strictly honors `package-lock.json`, installing the exact pinned commit without contacting GitHub or allowing unexpected supply chain drift.
- Because `dist/` is pre-compiled and tracked in git, `npm ci` functions hermetically and securely even when `--ignore-scripts` is enforced.

---

## 4. `package.json` Script Inheritance (Zero Duplication)

Host projects **MUST NOT** rewrite or duplicate generic audit scripts manually in their `package.json`.
`@francogp/auditor` exports 35 native CLI binaries to `node_modules/.bin`:

- `auditor` (master orchestrator `audit_full.ts`)
- `auditor-post-build` (post-build compiled artifact runner `audit_post_build.ts`)
- `auditor-build-deploy` (production build runner setting `AUDITOR_ENV=production`, `build_deploy.ts`)
- `auditor-version` (version inspection, diff analysis, and SemVer bumping `bump_version.ts`)
- `auditor-next` / `auditor-findings` / `auditor-report-findings` / `auditor-rules` / `auditor-by-rule` / `auditor-by-file` (interactive findings reporters `report_findings.ts`)
- `auditor-fallow` (Fallow intelligence suite `report_fallow.ts`)
- `auditor-complexity` (complexity hotspot analysis `report_complexity.ts`)
- `auditor-similar` (semantic code clone detection `report_similar_code.ts`)
- `auditor-review` (architectural review brief `report_review.ts`)
- `auditor-css` (Stylelint style duplication & orphan reporter `report_css.ts`)
- `auditor-guard` (architecture boundary and dependency gating `report_guard.ts`)
- `auditor-flags` (feature flags status and dead code reporter `report_flags.ts`)
- `auditor-coverage-map` (static audit suite file-coverage mapper `report_coverage_map.ts`)
- `auditor-coverage` / `auditor-test-coverage` (V8/Istanbul test coverage report `report_test_coverage.ts`)
- `auditor-config` (Unidirectional Config Ratchet hardening advisor `report_config_recommendations.ts`)
- `auditor-dependencies` (mandatory library version floor inspector `report_dependencies.ts`)
- `auditor-dupes`, `auditor-magic`, `auditor-motion`, `auditor-o1`, `auditor-types`, `auditor-domain`, `auditor-hygiene` (7 Dirac interactive refactor engines)
- `auditor-update` (package updater and skill synchronizer `update_package.ts`)
- `auditor-init` / `auditor-init-agent` (repository & agent plugin initializers)
- `auditor-sync-env` / `auditor-setup-env` / `auditor-check-env` (environment setup & validation CLIs)

### Dynamic Script Injection via `auditor fix`

Hardcoding manual package script lists is strictly prohibited. `PackageScriptRegistry` dynamically collects canonical script requirements from all discovered sub-auditors and registered extensions.

To inject all missing auditor and extension scripts into `package.json`:

```bash
auditor fix
# or
npm run auditor:fix
```

Missing scripts are appended non-destructively without modifying your existing scripts, custom aliases, or project build commands.

Host extensions declared in `.auditor/audit.config.ts` are automatically discovered and executed by `npm run auditor`. No manual runner registration is required.

---

## 5. Universal Standard `build` Script Contract

The build execution is partitioned into a **3-stage auditor lifecycle**:

1. **Pre-build verification** (`npm run auditor:full`): enforces source code architecture, linting, and domain type constraints before compilation starts at full ceiling (`🐘`).
2. **Compilation**: runs the Vite+ bundler / packager (`vp build` for applications, `vp pack` for libraries).
3. **Post-build verification** (`npm run auditor:post-build`): verifies compiled distribution artifacts in `dist/` (bundle budgets, export maps, type definitions).

- **Tooling Packages (TypeScript CLI / Library Packages)**:
  Tool packages distributing CLI tools or pre-compiled distribution bundles (`dist/`) MUST strictly use the cross-platform Node.js executable script:

  ```json
  {
    "scripts": {
      "build": "npm run auditor:full && vp pack && node --experimental-strip-types src/cli/make_executable.ts && npm run auditor:post-build",
      "build:deploy": "auditor-build-deploy"
    }
  }
  ```

  Using platform-specific shell commands like `chmod` that fail on Windows is strictly forbidden; executable permissions are set via cross-platform Node.js filesystem APIs. Inventing arbitrary non-standard script names (such as `compile` or `build:dist`) is strictly forbidden across the framework.

- **Web Application Host Projects (Vite+ / Vue)**:
  Host web applications compile their production assets through `vp build` chained with both pre-audit and post-audit:

  ```json
  {
    "scripts": {
      "build": "npm run auditor:full && vp build && npm run auditor:post-build",
      "build:deploy": "auditor-build-deploy"
    }
  }
  ```

### 5.1 Canonical `check` and `typecheck` Script Governance

All consumer host projects standardize their static verification and type checking scripts via canonical definitions managed by `packageScriptRegistry.ts` and `vitePlusConfigSync.ts`:

```json
{
  "scripts": {
    "check": "npm run auditor:lint",
    "check:fix": "auditor speed=light fix",
    "typecheck": "npm run check"
  }
}
```

- **`check`**: Executes `@francogp/auditor` at ultra-fast static analysis speed (`speed=light` / `auditor:lint`), evaluating linters, syntax hygiene, and domain typing without heavy metrics or dynamic coverage runs.
- **`check:fix`**: Runs the light auditor in automated repair mode (`auditor speed=light fix`).
- **`typecheck` (and legacy `type-check`)**: Unified canonical alias delegating to `npm run check`. Legacy commands such as `vp check` or `vue-tsc --noEmit` are automatically detected and migrated to `npm run check` during `npm run auditor:fix`.

---

## 6. Host Extension Governance & Zero-Tolerance Backward Compatibility

When authoring or maintaining host extensions in `scripts/auditors/`:

1. **Mandatory Thematic Emojis (`AuditorOptions.icon`)**:
   Every host extension sub-auditor extending `BaseAuditor` or `FileScanAuditor` **MUST** declare `icon: string` (e.g. `icon: '⚔️'`, `icon: '🎮'`, `icon: '🎒'`). If omitted or empty, `validateAuditorOptions` throws an explicit, loud runtime `Error`. Generic cogs (`⚙️`) are reserved exclusively for internal configuration validators.
2. **Strict Booleans in `.auditor/audit.config.ts`**:
   Configurations MUST use strict compile-time booleans (`true` / `false`). Legacy string values like `'off'`, `'on'`, `'essential'` have zero backward compatibility and will fail validation immediately.
3. **Anti-Abuse in `coverage.exemptGlobs`**:
   Broad wildcards (`*`, `**`, `src/**`, `scripts/**`) or whole code roots are strictly rejected. Exemption patterns must be narrow, specific, and declare an explicit technical `reason` of at least 15 characters.
4. **Declarative Configuration File Requirements (`configFiles`, `AuditorConfigFileRequirement`)**:
   Host extensions or sub-auditors requiring external configuration files declare them declaratively via `AuditorOptions.configFiles` without ad-hoc file write scripts. `verifyAndFixConfigFiles()` auto-creates canonical configurations in `--fix` mode.
5. **Primary Documentation Language Contract (`documentation.language`)**:
   The host project specifies `documentation.language: 'en' | 'es'` in `.auditor/audit.config.ts` (strictly defaulting to `'en'`).

---

## 7. Production Builds, Docker Containers & Remote Deployments (`AUDITOR_ENV=production`)

In consumer host projects deploying to production, building Docker containers, running deployment scripts (`deploy-install.sh`, `deploy-update.sh`), or deploying to GitHub Pages:

- The full auditor normally validates 100% of architectural and quality checks.
- In production environments, coverage files (`scratch/coverage/coverage-final.json`) are git-ignored and not generated during build, and computing vector embeddings via Candle CPU is undesirable.
- Setting `AUDITOR_ENV=production` (or invoking `npm run build:deploy` / `auditor-build-deploy`) cleanly skips `validate_similar_code` and `validate_test_coverage` with 0 violations.
- All other pre-build suites and post-build artifact verification (`auditor:post-build`) execute at 100% strictness.

```yaml
# In GitHub Actions workflow step (e.g. GitHub Pages deploy):
- name: Audit & Build
  run: npm run build:deploy
  # or:
  # run: npm run build
  # env:
  #   AUDITOR_ENV: production
```

> [!CAUTION]
> **Strict Local Execution Mandate & Absolute Bypassing Prohibition in Local/Development**:
> AI agents and developers MUST NEVER set `AUDITOR_ENV=production` or bypass vector analysis/test coverage during local development, interactive coding turns, bug triage, or local verification runs. Vector semantic duplication executes locally on Candle CPU in ~2 seconds leveraging disk cache. Production mode is strictly and exclusively reserved for headless production builds, Docker containers, and deployment workflows.

---

## 8. Master Environment Setup Scripts Governance (`setup-linux.sh`, `setup-windows.ps1`)

The root environment initialization and update scripts (`setup-linux.sh`, `setup-windows.ps1`, `update-linux.sh`, `update-windows.ps1`) and `scripts/setup/plugins/` belong canonically to `@francogp/auditor` and are automatically installed and synchronized into host projects during `auditor init`, `auditor:fix`, `auditor:update`, and local pre-flight execution (`ensureProjectBootstrapped`).

> [!CAUTION]
> **Prohibition on Local Host Patches**: AI agents and developers **MUST NEVER** attempt to apply ad-hoc local patches, temporary regex replacements, or logic mutations directly inside a host project's `setup-linux.sh` or `setup-windows.ps1`.
>
> If an issue, defect, version synchronization gap (e.g. Node vs NPM in `--declared-versions`), or platform incompatibility is discovered:
>
> 1. The agent **MUST PROACTIVELY NOTIFY THE USER**, clearly explaining the root cause.
> 2. The agent **MUST INSTRUCT THE USER** that the change must be requested and made upstream in the `@francogp/auditor` repository.
> 3. Once resolved and released upstream, the host project updates via `npm run auditor:update` and synchronizes the official scripts.

---

## 9. Absolute Prohibition on Suppressing, Silencing, Nullifying, or Bypassing Audit Rules

> [!CAUTION]
> **Zero Tolerance on Fake Passes & Rule Nullification**:
> When auditing a repository or modernizing configurations, AI agents and developers are **STRICTLY AND CATEGORICALLY PROHIBITED** from suppressing, silencing, disabling, or nullifying auditor rules, stylelint rules, Oxlint / Vite+ rules, or any static analysis checks (e.g., setting `"rule": null`, `"rule": "off"`, `"rule": 0`, creating dummy override configs that neuter checks, or passing arbitrary skip flags) to make an audit pass or hide findings.
>
> If the number of errors or warnings is massive (even hundreds or thousands of errors), **THEY ARE REAL ARCHITECTURAL, HYGIENE, OR SECURITY DEFECTS THAT MUST BE LEGITIMATELY RESOLVED IN THE SOURCE CODE OR FIXED WITH CANONICAL TOOLS (`auditor fix`)**.
>
> Modernizing host configurations means **elevating the codebase to meet strict modern standards and exposing defects that were previously hidden**, NEVER degrading, diluting, or castrating the auditor's rules to fit legacy code. Silencing rules to achieve a fake clean pass is considered a critical architectural violation and gross misconduct.

---

## 10. Prohibition on Modifying Configurations & Auditor Exclusive SSoT Sovereignty

> [!CAUTION]
> **Mandatory Consultation Gate & Auditor Exclusive SSoT Sovereignty**
>
> The framework enforces strict separation between the central source of truth and satellite configuration files:
>
> 1. **Sole Single Source of Truth**: `.auditor/audit.config.ts` is the SOLE Single Source of Truth (SSoT) for repository architecture, rules, and boundaries. All satellite configuration files (`.fallowrc.json`, `vite.config.ts`, `.stylelintrc.json`, `tsconfig.json`, `.htmlvalidate.json`, `.markdownlint.json`) are derived artifacts owned exclusively by `@francogp/auditor`.
> 2. **Prohibition of Manual Satellite Config Edits & Plans**: AI agents and developers are **STRICTLY AND CATEGORICALLY PROHIBITED** from proposing in work plans (`/plan`, `/brainstorming`) or executing manual edits (`write_file`, `edit_file`) on satellite configuration files. Whenever an audit flags satellite config diagnostics (such as `*-undeclared-config-entry` or `fallow-workspace-diagnostic`), the ONLY canonical action is running `npm run auditor:fix`.
> 3. **Mandatory Human Consultation for Policy Changes**: Developers and AI agents are strictly prohibited from disabling, turning off, relaxing, or altering `.auditor/audit.config.ts` to silence errors without consulting and obtaining explicit prior authorization from the human programmer via `ask_question`. When requesting authorization, provide a comprehensive technical explanation detailing pros, cons, and trade-offs. Once approved, declare changes strictly in `.auditor/audit.config.ts` and synchronize with `npm run auditor:fix`.
>
> 📘 **Detailed Architectural Guide**: See [satellite-configs-sovereignty-guide.md](./satellite-configs-sovereignty-guide.md).

---

## 11. Upstream Build Sequencing & Consumer Safety Mandate

When implementing core auditor features or script modernizations in `@francogp/auditor`:

1. **Upstream First**: Complete all code changes, coverage-enabled tests (`npm run test:coverage`, once), and full distribution build (`npm run build`, once — which already executes `auditor:full`, `vp pack`, and `auditor:post-build`; NEVER re-run `npm test`, `auditor`, or `auditor:post-build` separately alongside `build`!) exclusively inside `@francogp/auditor`.
2. **Zero Premature Host Updates**: NEVER edit or run auto-fix scripts on consumer applications (`package.json`) before the upstream package is committed and ready.
3. **Consumer Upgrade via Canonical Workflow**: Once upstream is published or committed, upgrade consumer projects exclusively via `npm run auditor:update` (or `auditor-update`) — which already runs `auditor fix` automatically.

---

## 12. Local Cross-Repository Testing via `--project` (`project=`, `-p`)

During upstream `@francogp/auditor` development, you can test new suites, refactorings, and auto-fixers against existing local consumer repositories on the same machine **without committing, publishing, or linking (`npm link`)**:

```bash
# In @francogp/auditor repository:
npm run auditor project="../my-app"
npm run auditor:lint project="../my-app"
npm run auditor:fix project="../my-app"
npm run auditor:findings project="../my-app"
```

### Key Principles of Remote Execution

- **Early Chdir**: Operates natively in the host's directory, using the host's `package.json`, `.auditor/audit.config.ts`, `vite.config.ts`, and git baseline.
- **Dynamic Extension Discovery**: Discovers both upstream suites and the host's bespoke extensions in `scripts/auditors/`.
- **Zero Pollution**: Output reports and cache are saved strictly in `host/scratch/audits/`.
- **Zero Premature Modifications**: Allows verifying that upstream changes do not introduce false positives on consumer code before releasing upstream versions.

## Conditional Minimum Library Versions (`auditor-dependencies` / `validate_dependency_minimums`)

- **Single Source of Truth**: the mandatory floors live in the optional `peerDependencies` (with `peerDependenciesMeta.<name>.optional: true`) of `@francogp/auditor/package.json`. `getAuditorMinimumVersions()` (`src/core/auditorMinimums.ts`) reads them dynamically and throws if the list is missing or empty. Hardcoding versions in `.ts` code is prohibited.
- **Dedicated Inspection CLI (`auditor-dependencies`)**: host projects and AI agents can inspect, diagnose, and copy update commands without running whole-project audits or loading host extensions:

  ```bash
  # Render Box-Drawing diagnostic table:
  auditor-dependencies
  # or
  npm run auditor:dependencies
  # or
  auditor dependencies

  # Output only ready-to-run grouped install commands:
  auditor-dependencies --commands

  # Inspect a remote host repository:
  auditor-dependencies --project="../my-app"

  # Include undeclared governed libraries:
  auditor-dependencies --all

  # Output structured JSON for automation:
  auditor-dependencies --json
  ```

- **Conditional enforcement**: if the host declares a listed library in `dependencies`, `devDependencies` or `optionalDependencies`, then (a) the floor of its declared range (`dependency-below-minimum-range`) and (b) its version in `package-lock.json` (`dependency-below-minimum-installed`) MUST be >= the auditor floor. Libraries not declared by the host are ignored; non-registry specs (`github:`, `file:`, `workspace:`) are not comparable and skipped.
- **Remediation & Lockfile Auto-Sync (`dependency-lockfile-out-of-sync`)**: the finding message carries the exact command (e.g. `npm install -D vite-plus@<floor>`). `validate_dependency_minimums` (`phase: 'setup'`) also verifies `package.json` ↔ `package-lock.json` parity (`dependency-lockfile-out-of-sync`) via root section comparison and `npm ci --dry-run --ignore-scripts`. In `auditor fix` mode (`fix: 'priority'`), it repairs outdated ranges in `package.json` and automatically runs `npm install --no-audit --no-fund` whenever `package.json` changed, `package-lock.json` is out of sync, or installed lockfile versions violate minimums/maximums.
- **User `package.json#overrides` Sovereignty & Conflict Detection (`dependency-conflicting-override`)**: `syncPackageJsonForVitePlus` NEVER injects, alters, or deletes `package.json#overrides` in consumer projects. Instead, `validate_dependency_minimums` (`phase: 'setup'`, `fix: 'none'`) inspects `package.json#overrides` via `evaluateConflictingOverrides` against `getAuditorManagedDependencyFloors()` (`dependencies` + `peerDependencies` of `@francogp/auditor/package.json`) and installed `node_modules` `peerDependencies`, emitting a blocking error if any override forces an incompatible version (e.g. `stylelint-config-recommended@^18.0.0` against `stylelint@^18.0.0`) so the developer can remove or update it manually.
- **Prohibition on Ad-Hoc Discovery**: Writing ad-hoc `node -e` scripts or running manual `npm view` queries on arbitrary host dependencies is STRICTLY PROHIBITED. Always use `auditor-dependencies`.
- **Raising a floor**: edit the auditor `peerDependencies`, run the build, and publish a new `vX.Y.Z` tag so hosts pick it up through `npm update`.
- **Range parsing**: uses the `semver` package (`minVersion`, `validRange`, `lt`), never homemade regexes.

---

## 13. Mass Migration Recipes for Host Upgrades

### 1. Massive `scss-strict-values` & Design Token Waves

When upgrading an older host project that triggers hundreds or thousands of `scss-strict-values` / `missing-theme-token-usage` findings:

1. **Synchronize Canonical Stylelint Config via `npm run auditor:fix`**:
   Never edit `.stylelintrc.json` manually; run `npm run auditor:fix` so the auditor generates the canonical `.stylelintrc.json` derived from `.auditor/audit.config.ts`. This immediately resolves false-positive `selector-class-pattern` warnings on third-party icon classes (e.g. `.svg-inline--fa`) and prevents SVG keyword case collisions.
2. **Calibrate Layout Nesting (with Human Approval)**:
   Canonical defaults are `maxNestingDepth: 3` and `scopedMaxNestingDepth: 4` under `scssArchitecture` in `.auditor/audit.config.ts` (never alter `.auditor/audit.config.ts` without prior human programmer authorization).
3. **Execute via Official `auditor:magic` Engine & Worktree Sandbox**:
   - Run `npm run auditor:magic discover` to cluster repeated visual literals and hex colors via Super-Dirac micro-context instead of writing ad-hoc PostCSS scripts.
   - Formulate an approved token plan and apply safely inside a worktree via `npm run auditor:magic apply <plan.json> worktree`.

### 2. Projections for `no-select-star-in-queries` (`validate_oxlint`)

The rule `@francogp/domain-type/no-select-star-in-queries` (inside `validate_oxlint`) targets Supabase and ORM queries across frontend code in `src/` (not database migration scripts).

- ❌ **Prohibited**: `.select('*')` or omitting columns.
- ✅ **Canonical**: Explicit column projection `.select('id, name, created_at, ...')` to avoid overfetching, breaking schema contracts, and runtime payload bloat.

---

## 14. Native Vite+/Oxlint Linter Plugins & Architecture Health Governance

### 1. Native Linter Plugins Catalog (`vitePlusConfig.lint.plugins`)

Vite+ is powered by Oxlint's high-performance native engine. Beyond the default core suites (`typescript`, `unicorn`, and `oxc`), Vite+ supports dedicated native plugins that can be declaratively governed from `.auditor/audit.config.ts`:

| Plugin       | Scope & Rules Enforced                                                                                                        | Ecosystem Recommendation                              |
| :----------- | :---------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------- |
| `vitest`     | Unit testing hygiene (`no-identical-title`, `no-focused-tests`, `no-disabled-tests`, `valid-title`, `prefer-to-have-length`). | **Active by default** in all Node 26+ / Vitest repos. |
| `node`       | Modern Node.js 26+ runtime standards (`no-exports-assign`, `no-new-require`, `no-path-concat`).                               | **Active by default** in all Node 26+ projects.       |
| `promise`    | Strict async hygiene (`no-new-statics`, `valid-params`, `no-return-in-finally`).                                              | **Active by default** in all Node 26+ projects.       |
| `unicorn`    | Codebase modernization and node protocol standards (`prefer-node-protocol`).                                                  | **Active by default** in all Node 26+ projects.       |
| `typescript` | TypeScript strict type checking and import rules.                                                                             | **Active by default** in all Node 26+ projects.       |
| `vue`        | Vue 3 SFC & Composition API hygiene (`no-async-in-computed`, `next-tick-style`, `define-props-declaration`).                  | **Active by default** in all Node 26+ projects.       |
| `import`     | Import hygiene (`no-duplicates`, `no-self-import`, `no-mutable-exports`, `no-amd`).                                           | **Active by default** in all Node 26+ projects.       |
| `jsx-a11y`   | Web accessibility checks for JSX/TSX components and templates.                                                                | **Active by default** in all Node 26+ projects.       |
| `react`      | React JSX, hook rules, and rendering lifecycle.                                                                               | Elective for React/Next.js projects.                  |
| `react-perf` | Prevents performance anti-patterns in React components.                                                                       | Elective for React frontend apps.                     |
| `jsdoc`      | Strict JSDoc documentation formatting.                                                                                        | Elective for public library APIs.                     |
| `jest`       | Compatibility rules for legacy Jest suites.                                                                                   | Elective during Vitest migrations.                    |
| `nextjs`     | Specific next-gen SSR/SSG patterns for Next.js.                                                                               | Elective for Next.js applications.                    |

### 2. Canonical 8-Plugin Standard (`vitePlusConfig.lint.plugins`)

1. **Universal Canonical Suite**:
   - In all repositories under `@francogp/auditor`, `plugins: ['vitest', 'node', 'promise', 'unicorn', 'typescript', 'vue', 'import', 'jsx-a11y']` is configured by default in `DEFAULT_AUDIT_CONFIG.vitePlusConfig.lint`.
   - The AST synchronizer (`src/core/viteConfigAst.ts`) automatically populates these 8 plugins into the `lint` block of `vite.config.ts`.
   - Tested empirically across thousands of source files with 0 false positives.

2. **Promise Linter Plugin Remediation Notes (`promise`)**:
   - Active by default in `DEFAULT_AUDIT_CONFIG.vitePlusConfig.lint.plugins`; detects concurrency flaws such as calling `Promise.then()` without handlers (`await this.then()` -> `await this`) or uncaught `.then()` chains.

3. **Vue Linter Plugin Remediation Notes (`vue`)**:
   - Active by default in `DEFAULT_AUDIT_CONFIG.vitePlusConfig.lint.plugins`; enforces Vue 3 Composition API idioms (`defineProps<{ ... }>()`, `await nextTick()`, and `onMounted(async () => { await nextTick(); restoreScroll(); })` to satisfy both `vue(next-tick-style)` and `promise(catch-or-return)`).

### 3. Architectural Health & Complexity Governance (`fallow.health`)

The `fallow.health` subsystem monitors cognitive complexity, cyclomatic complexity, and maintainability index across all TypeScript sources:

- **Canonical SSoT Configuration**:

  ```ts
  // .auditor/audit.config.ts
  fallow: {
    enabled: true,
    health: {
      maxCognitive: 20,
      maxCyclomatic: 25,
      cyclomaticPolicy: 'standard',
      exemptPaths: ['test_aventura/**', 'benchmarks/**']
    }
  }
  ```

- **Exempting Procedural & Mathematical Generators**:
  Complex procedural generation algorithms (e.g., procedural maze generation, binary space partitioning, complex math tables) legitimately accumulate high cyclomatic complexity. Use `exemptPaths` to decouple these modules from the core production domain boundaries without degrading project-wide thresholds.
