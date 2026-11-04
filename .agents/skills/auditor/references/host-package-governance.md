# Host Installation, NPM Updates & Dependency Governance (`@francogp/auditor`)

This reference details the canonical architecture and workflow for installing, updating, and consuming `@francogp/auditor` as a standard GitHub npm dependency in consumer host applications (such as standalone web apps, monorepos, and CLI tooling packages).

---

## 1. Initial Installation in Consumer Host Projects

To install `@francogp/auditor` in a host application, run standard `npm install`:

```bash
npm install -D github:francogp/auditor#v10.7.9 --allow-git=all
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

### Canonical Update Command

```bash
npm run auditor:update
# or directly:
auditor-update
```

Under the hood, `auditor-update`:

1. Queries upstream release tags via `git ls-remote --sort=-v:refname` (or accepts an explicit target tag via `npm run auditor:update -- [targetVersion]`).
2. Updates `package.json` with the exact pinned tag (`github:francogp/auditor#vX.Y.Z`) and executes `npm install -D github:francogp/auditor#<targetTag>` to update `package-lock.json` hermetically.
3. Synchronizes Antigravity agent skills in `.agents/skills/` and setup scripts (`setup-windows.ps1`, `setup-linux.sh`).
4. Executes `auditor fix` to apply any new configuration minimums or script definitions.
5. Inspects and prints the newly installed version with full build metadata (`auditor-version -v`).
6. **Mandatory Post-Update Minimum Library Check & Upgrade (`auditor-dependencies`)**: Immediately after updating the auditor, ALWAYS inspect the newly enforced minimum library requirements by running `npm run auditor:dependencies` (or `auditor-dependencies`). If any declared project libraries fall below the new minimum version floors (`dependency-below-minimum-range` or `dependency-below-minimum-installed`), retrieve the exact remediation commands via `npm run auditor:dependencies -- commands` (`auditor-dependencies --commands`) and execute them immediately to upgrade the outdated libraries before running downstream audits.
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

Host projects **MUST NOT** rewrite or duplicate the 26 generic audit scripts in their `package.json`.
`@francogp/auditor` exports native binaries to `node_modules/.bin`:

- `auditor` (master orchestrator `audit_full.ts`)
- `auditor-post-build` (post-build compiled artifact runner `audit_post_build.ts`)
- `auditor-build-deploy` (production build runner setting `AUDITOR_ENV=production`, `build_deploy.ts`)
- `auditor-version` (version inspection, diff analysis, and SemVer bumping `bump_version.ts`)
- `auditor-findings` / `auditor-report-findings` (interactive findings reporter `report_findings.ts`)
- `auditor-by-file` (hierarchical tree findings reporter grouped by file and line `report_findings.ts`)
- `auditor-fallow` (Fallow intelligence suite `report_fallow.ts`)
- `auditor-complexity` (complexity hotspot analysis `report_complexity.ts`)
- `auditor-similar` (semantic code clone detection `report_similar_code.ts`)
- `auditor-review` (architectural review brief `report_review.ts`)
- `auditor-css` (Stylelint style duplication & orphan reporter `report_css.ts`)
- `auditor-guard` (architecture boundary and dependency gating `report_guard.ts`)
- `auditor-flags` (feature flags status and dead code reporter `report_flags.ts`)
- `auditor-coverage-map` (full test coverage heatmap and uncovered file tracer `report_coverage_map.ts`)
- `auditor-coverage` / `auditor-test-coverage` (Istanbul/C8 test coverage report `report_test_coverage.ts`)
- `auditor-update` (package updater and skill synchronizer `update_package.ts`)
- `auditor-init-agent` (agent plugin and skills registrator `init_agent.ts`)
- `auditor-sync-env` (environment script synchronizer `sync_env_scripts.ts`)
- `auditor-setup-env` (environment setup runner `setup_env.ts`)
- `auditor-check-env` (runtime environment validator `check_environment.ts`)
- `auditor-dependencies` (mandatory library version floor inspector `report_dependencies.ts`)

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

The build execution is partitioned into a **2-part auditor lifecycle**:

1. **Pre-build verification** (`npm run auditor:full`): enforces source code architecture, linting, and domain type constraints before compilation starts at full ceiling (`🐘`).
2. **Compilation**: runs the bundler / TypeScript compiler (`vite build`, `tsc`, etc.).
3. **Post-build verification** (`npm run auditor:post-build`): verifies compiled distribution artifacts in `dist/` (bundle budgets, export maps, type definitions).

- **Tooling Packages (TypeScript CLI / Library Packages)**:
  Tool packages distributing CLI tools or pre-compiled distribution bundles (`dist/`) MUST strictly use the cross-platform Node.js executable script:

  ```json
  {
    "scripts": {
      "build": "npm run auditor:full && tsc -p tsconfig.build.json && node --experimental-strip-types src/cli/make_executable.ts && npm run auditor:post-build",
      "build:deploy": "auditor-build-deploy"
    }
  }
  ```

  Using platform-specific shell commands like `chmod` that fail on Windows is strictly forbidden; executable permissions are set via cross-platform Node.js filesystem APIs. Inventing arbitrary non-standard script names (such as `compile` or `build:dist`) is strictly forbidden across the framework.

- **Web Application Host Projects (Vite / Vue / Webpack)**:
  Host web applications compile their production assets through standard bundlers chained with both pre-audit and post-audit:

  ```json
  {
    "scripts": {
      "build": "npm run auditor:full && vite build && npm run auditor:post-build",
      "build:deploy": "auditor-build-deploy"
    }
  }
  ```

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
- In production environments, coverage files (`coverage/coverage-final.json`) are git-ignored and not generated during build, and computing vector embeddings via Candle CPU is undesirable.
- Setting `AUDITOR_ENV=production` (or invoking `npm run build:deploy` / `auditor-build-deploy`) cleanly skips `validate_similar_code` and `validate_test_coverage` with 0 violations.
- All other 48+ suites and post-build artifact verification (`auditor:post-build`) execute at 100% strictness.

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

The root environment initialization scripts `setup-linux.sh` and `setup-windows.ps1` belong canonically to `@francogp/auditor` and are distributed with the package.

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

1. **Upstream First**: Complete all code changes, unit tests (`npm test`), distribution compilation (`npm run build`), and post-build audits (`npm run auditor:post-build`) exclusively inside `@francogp/auditor`.
2. **Zero Premature Host Updates**: NEVER edit or run auto-fix scripts on consumer applications (`package.json`) before the upstream package is committed and ready.
3. **Consumer Upgrade via Canonical Workflow**: Once upstream is published or committed, upgrade consumer projects exclusively via `npm run auditor:update` (or `auditor-update`) followed by `auditor fix` to apply script updates cleanly.

---

## 12. Local Cross-Repository Testing via `--project` (`project=`, `-p`)

During upstream `@francogp/auditor` development, you can test new suites, refactorings, and auto-fixers against existing local consumer repositories on the same machine **without committing, publishing, or linking (`npm link`)**:

```bash
# In @francogp/auditor repository:
npm run auditor -- project="../PokeBorrador"
npm run auditor:lint -- project="../PokeBorrador"
npm run auditor:fix -- project="../PokeBorrador"
npm run auditor:findings -- project="../PokeBorrador"
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
  auditor-dependencies --project="../PokeBorrador"

  # Include undeclared governed libraries:
  auditor-dependencies --all

  # Output structured JSON for automation:
  auditor-dependencies --json
  ```

- **Conditional enforcement**: if the host declares a listed library in `dependencies`, `devDependencies` or `optionalDependencies`, then (a) the floor of its declared range (`dependency-below-minimum-range`) and (b) its version in `package-lock.json` (`dependency-below-minimum-installed`) MUST be >= the auditor floor. Libraries not declared by the host are ignored; non-registry specs (`github:`, `file:`, `workspace:`) are not comparable and skipped.
- **Remediation**: the finding message carries the exact command (e.g. `npm install -D vite-plus@^1.2.0`). The suite is lint-only and never mutates host files.
- **Prohibition on Ad-Hoc Discovery**: Writing ad-hoc `node -e` scripts or running manual `npm view` queries on arbitrary host dependencies is STRICTLY PROHIBITED. Always use `auditor-dependencies`.
- **Raising a floor**: edit the auditor `peerDependencies`, run the build, and publish a new `vX.Y.Z` tag so hosts pick it up through `npm update`.
- **Range parsing**: uses the `semver` package (`minVersion`, `validRange`, `lt`), never homemade regexes.

---

## 13. Mass Migration Recipes for Host Upgrades

### 1. Massive `scss-strict-values` & Design Token Waves

When upgrading an older host project that triggers hundreds or thousands of `scss-strict-values` / `missing-theme-token-usage` findings:

1. **Inherit Canonical Stylelint Config First**:
   Ensure `.stylelintrc.json` extends `./node_modules/@francogp/auditor/.stylelintrc.json`. This immediately resolves false-positive `selector-class-pattern` warnings on third-party icon classes (e.g. `.svg-inline--fa`) and prevents SVG keyword case collisions.
2. **Calibrate Layout Nesting**:
   If the host maintains deep component views, adjust `maxNestingDepth: 5` and `scopedMaxNestingDepth: 5` in `.auditor/audit.config.ts` under `scssArchitecture` (canonical threshold used in production apps like PokeBorrador and facturacion2).
3. **Execute via Isolated Worktree & AST Codemod**:
   - Create an isolated git worktree (`scratch/wt-migration`) so `main` remains pristine during experimentation.
   - Map unique color hexes and literal values into token custom properties (`var(--slate-500)`, etc.) defined in `:root`.
   - Run a targeted PostCSS-SCSS script to replace literals with CSS variable tokens.

### 2. Projections for `select-star-in-queries` (`validate_sql_anti_patterns`)

The rule `select-star-in-queries` targets Supabase and ORM queries across frontend code in `src/` (not database migration scripts).

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

2. **Promise Linter Plugin Adoption Guide (`promise`)**:
   - The `promise` plugin detects serious runtime concurrency flaws (such as calling `Promise.then()` without handlers).
   - Before activating `promise` in `vitePlusConfig.lint.plugins`:
     - Run `vp lint --promise-plugin` to inspect any existing violations.
     - Remediate thenable anti-patterns (e.g. replacing `const res = await this.then();` with `const res = await this;`).
     - Declare `'promise'` in `.auditor/audit.config.ts` under `vitePlusConfig.lint.plugins`.

3. **Vue Linter Plugin Adoption Guide (`vue`)**:
   - The `vue` plugin enforces strict Vue 3 Composition API idioms.
   - Key considerations before activating:
     - `vue(next-tick-style)` rejects callback syntax `nextTick(() => { ... })` and requires `await nextTick()`.
     - When `vue(next-tick-style)` auto-fixes callbacks, it generates `nextTick().then(() => { ... })`. Because `promise(catch-or-return)` strictly prohibits unreturned or uncaught Promise chains, the canonical `/clean-code` solution is declaring the lifecycle callback as `async` (`onMounted(async () => { await nextTick(); restoreScroll(); })`). This pattern is 100% compliant with `vue/no-lifecycle-after-await` because the `await` is scoped inside the lifecycle callback rather than in the top-level `<script setup>`.
     - `vue(define-props-declaration)` and `vue(define-emits-declaration)` require typed macro signatures (`defineProps<{ ... }>()`).
     - If the repository has legacy callbacks in component lifecycles, schedule an AST migration before enabling.

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
