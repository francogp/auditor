# Host Installation, NPM Updates & Dependency Governance (`@francogp/auditor`)

This reference details the canonical architecture and workflow for installing, updating, and consuming `@francogp/auditor` as a standard GitHub npm dependency in consumer host applications (such as standalone web apps, monorepos, and CLI tooling packages).

---

## 1. Initial Installation in Consumer Host Projects

To install `@francogp/auditor` in a host application, run standard `npm install`:

```bash
npm install github:francogp/auditor
```

- **Lockfile Registration**: `npm install` fetches the package from GitHub and records the exact commit hash and checksum in `package-lock.json`.
- **Pre-Compiled Artifacts in Git**: The `dist/` directory is pre-compiled and tracked directly in the repository with executable permissions (`100755`), ensuring immediate availability in `node_modules/.bin/` without requiring local compilation or install hooks.
- **Antigravity Skills & Plugin Registration**: Ensure `.agents/skills.json` and `.agents/plugins.json` in the host project root declare:

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

  This is committed once in the host repository (or generated automatically via `auditor-init-agent`). It allows Antigravity to dynamically discover all official skills (`.agents/skills/*`) and rules (`AGENTS.md`) directly from `node_modules/@francogp/auditor` without duplicating files in-tree or using fragile symlinks.

---

## 2. Bringing Updates from GitHub (Updating `package-lock.json`)

> 🔴 **NATIVE NPM UPDATE MANDATE (ZERO CLONING OR MAKESHIFT SCRIPTS)**:
> When a user or task requests to *"update the auditor"*, *"pull latest auditor changes"*, *"update skills"*, or sync the static analysis engine, developers and AI agents **MUST NEVER** execute `git clone`, create submodules, run ad-hoc `node -e` scripts, inspect `git log` inside `node_modules`, or copy files between repositories.
> Updates MUST be performed 100% natively through the official updater or npm.

### Canonical Update Command

```bash
npm run auditor:update
# or directly:
auditor-update
```

Under the hood, `auditor-update`:

1. Executes `npm update @francogp/auditor` to resolve the latest commit and update `package-lock.json`.
2. Inspects and prints the newly installed version with full build metadata (`auditor-version -v`).
3. Renders a Box-Drawing verification table confirming successful synchronization.
4. All bundled skills (`.agents/skills/*`) and agent rules (`AGENTS.md`) located in `node_modules/@francogp/auditor` are instantly updated on disk. Because the host's `.agents/skills.json` and `.agents/plugins.json` point to `node_modules/@francogp/auditor`, Antigravity immediately discovers the latest skills without needing manual copy operations or links.
5. Commit the updated `package-lock.json` to lock the audited version for the entire team and CI.

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
- `auditor-build` (post-build compiled artifact runner `audit_build.ts`)
- `auditor-build-prod` (production build runner setting `AUDITOR_ENV=production`, `build_prod.ts`)
- `auditor-version` (version inspection, diff analysis, and SemVer bumping `bump_version.ts`)
- `auditor-findings` / `auditor-report-findings` (interactive findings reporter `report_findings.ts`)
- `auditor-by-file` (hierarchical tree findings reporter grouped by file and line `report_findings.ts`)
- `auditor-fallow` (Fallow intelligence suite `report_fallow.ts`)
- `auditor-complexity` (complexity hotspot analysis `report_complexity.ts`)
- `auditor-similar` (semantic code clone detection `report_similar_code.ts`)
- `auditor-review` (architectural review brief `report_review.ts`)
- `auditor-bundle` (chunk budget validation `audit_bundle.ts`)
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

1. **Pre-build verification** (`npm run auditor`): enforces source code architecture, linting, and domain type constraints before compilation starts.
2. **Compilation**: runs the bundler / TypeScript compiler (`vite build`, `tsc`, etc.).
3. **Post-build verification** (`npm run auditor:build`): verifies compiled distribution artifacts in `dist/` (bundle budgets, export maps, type definitions).

- **Tooling Packages (TypeScript CLI / Library Packages)**:
  Tool packages distributing CLI tools or pre-compiled distribution bundles (`dist/`) MUST strictly use the cross-platform Node.js executable script:

  ```json
  {
    "scripts": {
      "build": "npm run auditor && tsc -p tsconfig.build.json && node --experimental-strip-types src/cli/make_executable.ts && npm run auditor:build",
      "build:prod": "auditor-build-prod"
    }
  }
  ```

  Using platform-specific shell commands like `chmod` that fail on Windows is strictly forbidden; executable permissions are set via cross-platform Node.js filesystem APIs. Inventing arbitrary non-standard script names (such as `compile` or `build:dist`) is strictly forbidden across the framework.

- **Web Application Host Projects (Vite / Vue / Webpack)**:
  Host web applications compile their production assets through standard bundlers chained with both pre-audit and post-audit:

  ```json
  {
    "scripts": {
      "build": "npm run auditor && vite build && npm run auditor:build",
      "build:prod": "auditor-build-prod"
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
3. **Anti-Abuse in `constants.exemptGlobs`**:
   Glob patterns must target specific maintenance scripts or tabular seed data. Broad directory wildcards like `**/*` or `src/**` are rejected.
4. **Declarative Configuration File Requirements (`configFiles`, `AuditorConfigFileRequirement`)**:
   Host extensions or sub-auditors requiring external configuration files declare them declaratively via `AuditorOptions.configFiles` without ad-hoc file write scripts. `verifyAndFixConfigFiles()` auto-creates canonical configurations in `--fix` mode.
5. **Primary Documentation Language Contract (`documentation.language`)**:
   The host project specifies `documentation.language: 'en' | 'es'` in `.auditor/audit.config.ts` (strictly defaulting to `'en'`).

---

## 7. Production Builds, Docker Containers & Remote Deployments (`AUDITOR_ENV=production`)

In consumer host projects deploying to production, building Docker containers, running deployment scripts (`deploy-install.sh`, `deploy-update.sh`), or deploying to GitHub Pages:

- The full auditor normally validates 100% of architectural and quality checks.
- In production environments, coverage files (`coverage/coverage-final.json`) are git-ignored and not generated during build, and computing vector embeddings via Candle CPU is undesirable.
- Setting `AUDITOR_ENV=production` (or invoking `npm run build:prod` / `auditor-build-prod`) cleanly skips `validate_similar_code` and `validate_test_coverage` with 0 violations.
- All other 48+ suites and post-build artifact verification (`auditor:build`) execute at 100% strictness.

```yaml
# In GitHub Actions workflow step (e.g. GitHub Pages deploy):
- name: Audit & Build
  run: npm run build:prod
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
> When auditing a repository or modernizing configurations, AI agents and developers are **STRICTLY AND CATEGORICALLY PROHIBITED** from suppressing, silencing, disabling, or nullifying auditor rules, stylelint rules, ESLint rules, or any static analysis checks (e.g., setting `"rule": null`, `"rule": "off"`, `"rule": 0`, creating dummy override configs that neuter checks, or passing arbitrary skip flags) to make an audit pass or hide findings.
>
> If the number of errors or warnings is massive (even hundreds or thousands of errors), **THEY ARE REAL ARCHITECTURAL, HYGIENE, OR SECURITY DEFECTS THAT MUST BE LEGITIMATELY RESOLVED IN THE SOURCE CODE OR FIXED WITH CANONICAL TOOLS (`auditor fix`)**.
>
> Modernizing host configurations means **elevating the codebase to meet strict modern standards and exposing defects that were previously hidden**, NEVER degrading, diluting, or castrating the auditor's rules to fit legacy code. Silencing rules to achieve a fake clean pass is considered a critical architectural violation and gross misconduct.

---

## 10. Prohibition on Modifying or Disabling Configurations Without Prior Programmer Consultation

> [!CAUTION]
> **Mandatory Consultation Gate**:
> Developers and AI agents are strictly prohibited from disabling, turning off, altering, or modifying auditor configurations (`.auditor/audit.config.ts`, `eslint.config.js`, `.stylelintrc.json`, `.fallowrc.json`) when encountering errors or warnings without consulting and obtaining explicit prior authorization from the human programmer.
>
> When requesting authorization, the agent must provide a comprehensive technical explanation detailing why the modification is necessary, explicitly justifying the trade-offs, pros, and cons.

---

## 11. Upstream Build Sequencing & Consumer Safety Mandate

When implementing core auditor features or script modernizations in `@francogp/auditor`:

1. **Upstream First**: Complete all code changes, unit tests (`npm test`), distribution compilation (`npm run build`), and post-build audits (`auditor:build`) exclusively inside `@francogp/auditor`.
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

- **Early Chdir**: Operates natively in the host's directory, using the host's `package.json`, `.auditor/audit.config.ts`, `eslint.config.js`, and git baseline.
- **Dynamic Extension Discovery**: Discovers both upstream suites and the host's bespoke extensions in `scripts/auditors/`.
- **Zero Pollution**: Output reports and cache are saved strictly in `host/scratch/audits/`.
- **Zero Premature Modifications**: Allows verifying that upstream changes do not introduce false positives on consumer code before releasing upstream versions.
