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
  This is committed once in the host repository (or generated automatically via `npx auditor-init-agent`). It allows Antigravity to dynamically discover all official skills (`.agents/skills/*`) and rules (`AGENTS.md`) directly from `node_modules/@francogp/auditor` without duplicating files in-tree or using fragile symlinks.

---

## 2. Bringing Updates from GitHub (Updating `package-lock.json`)

> 🔴 **NATIVE NPM UPDATE MANDATE (ZERO CLONING OR MAKESHIFT SCRIPTS)**:
> When a user or task requests to *"update the auditor"*, *"pull latest auditor changes"*, *"update skills"*, or sync the static analysis engine, developers and AI agents **MUST NEVER** execute `git clone`, create submodules, run ad-hoc `node -e` scripts, inspect `git log` inside `node_modules`, or copy files between repositories.
> Updates MUST be performed 100% natively through the official updater or npm.

### Canonical Update Command:
```bash
npx auditor-update
```
*(Or via host project script: `npm run auditor:update`).*

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

Host projects **MUST NOT** rewrite or duplicate the 25 generic audit scripts in their `package.json`.
`@francogp/auditor` exports native binaries to `node_modules/.bin`:
- `auditor` (master orchestrator `audit_full.ts`)
- `auditor-version` (version inspection, diff analysis, and SemVer bumping `bump_version.ts`)
- `auditor-commit` (safe-commit gatekeeper `audit_for_commit.ts`)
- `auditor-findings` / `auditor-report-findings` (interactive findings reporter `report_findings.ts`)
- `auditor-fallow` (Fallow intelligence suite `report_fallow.ts`)
- `auditor-complexity` (complexity hotspot analysis `report_complexity.ts`)
- `auditor-similar` (semantic code clone detection `report_similar_code.ts`)
- `auditor-review` (architectural review brief `report_review.ts`)
- `auditor-bundle` (chunk budget validation `audit_bundle.ts`)
- `auditor-css` (Stylelint style duplication & orphan reporter `report_css.ts`)
- `auditor-update` (package updater and skill synchronizer `update_package.ts`)
- `auditor-init-agent` (agent plugin and skills registrator `init_agent.ts`)
- `auditor-sync-env` (environment script synchronizer `sync_env_scripts.ts`)
- `auditor-setup-env` (environment setup runner `setup_env.ts`)
- `auditor-check-env` (runtime environment validator `check_environment.ts`)

### Canonical Recommended `scripts` in Host `package.json`:
For a drop-in ready JSON template, see [`recommended_package_scripts_template.json`](../assets/templates/recommended_package_scripts_template.json).

```json
{
  "scripts": {
    "// --- GLOBAL & COMMITS ---": "",
    "audit": "auditor",
    "audit:for-commit": "auditor-commit",
    "audit:changed": "auditor changed-since=main",
    "audit:fix": "auditor fix",

    "// --- FINDINGS & REPORTS ---": "",
    "audit:findings": "auditor-findings",
    "audit:errors": "auditor-findings severity=error",
    "audit:warnings": "auditor-findings severity=warning",
    "audit:summary": "auditor-findings",
    "audit:files": "auditor-findings files",

    "// --- PRESETS & LINT ---": "",
    "audit:lint": "auditor preset=lint",
    "audit:md": "auditor preset=md",
    "lint": "npm run audit:lint",
    "lint:fix": "auditor preset=lint fix",
    "lint:md": "auditor preset=md",

    "// --- SPECIALIZED ANALYZERS ---": "",
    "audit:complexity": "auditor-complexity",
    "audit:similar": "auditor-similar",
    "audit:review": "auditor-review",
    "audit:css": "auditor-css",
    "audit:bundle": "auditor-bundle",

    "// --- FALLOW INTELLIGENCE ---": "",
    "audit:fallow": "auditor-fallow category=all",
    "audit:fallow:dupes": "auditor-fallow category=dupes",
    "audit:fallow:circular": "auditor-fallow category=circular",
    "audit:fallow:exports": "auditor-fallow category=exports",
    "audit:fallow:security": "auditor-fallow category=security",
    "audit:fallow:dead-code": "auditor-fallow category=dead-code",

    "// --- SUITE FAMILIES ---": "",
    "audit:family:architecture": "auditor family=architecture",
    "audit:family:domain": "auditor family=domain_data",
    "audit:family:persistence": "auditor family=persistence",
    "audit:family:documentation": "auditor family=documentation",

    "// --- PACKAGE & ENVIRONMENT GOVERNANCE ---": "",
    "auditor:update": "auditor-update",
    "auditor:version": "auditor-version",
    "init-agent": "auditor-init-agent",
    "sync:env": "auditor-sync-env",
    "env:setup": "auditor-setup-env",
    "env:check": "auditor-check-env",

    "// --- BESPOKE EXTENSIONS (IF APPLICABLE) ---": "",
    "validate:script-hardcoding": "auditor task=validate_script_hardcoding"
  }
}
```

Host extensions declared in `audit.config.ts` are automatically discovered and executed by `npm run audit`. No manual runner registration is required.

---

## 5. Universal Standard `build` Script Contract

- **Tooling Packages (TypeScript CLI / Library Packages)**:
  Tool packages distributing CLI tools or pre-compiled distribution bundles (`dist/`) MUST strictly use the cross-platform Node.js executable script:

  ```json
  {
    "scripts": {
      "build": "npm run audit && tsc -p tsconfig.build.json && node --experimental-strip-types src/cli/make_executable.ts"
    }
  }
  ```

  Using platform-specific shell commands like `chmod` that fail on Windows is strictly forbidden; executable permissions are set via cross-platform Node.js filesystem APIs. Inventing arbitrary non-standard script names (such as `compile` or `build:dist`) is strictly forbidden across the framework.

- **Web Application Host Projects (Vite / Vue / Webpack)**:
  Host web applications compile their production assets through standard bundlers chained with the auditor:

  ```json
  {
    "scripts": {
      "build": "npm run audit && vite build"
    }
  }
  ```

---

## 6. Host Extension Governance & Zero-Tolerance Backward Compatibility

When authoring or maintaining host extensions in `scripts/auditors/`:

1. **Mandatory Thematic Emojis (`AuditorOptions.icon`)**:
   Every host extension sub-auditor extending `BaseAuditor` or `FileScanAuditor` **MUST** declare `icon: string` (e.g. `icon: '⚔️'`, `icon: '🎮'`, `icon: '🎒'`). If omitted or empty, `validateAuditorOptions` throws an explicit, loud runtime `Error`. Generic cogs (`⚙️`) are reserved exclusively for internal configuration validators.
2. **Strict Booleans in `audit.config.ts`**:
   Configurations MUST use strict compile-time booleans (`true` / `false`). Legacy string values like `'off'`, `'on'`, `'essential'` have zero backward compatibility and will fail validation immediately.
3. **Anti-Abuse in `constants.exemptGlobs`**:
   Glob patterns must target specific maintenance scripts or tabular seed data. Broad directory wildcards like `**/*` or `src/**` are rejected.

---

## 7. Specifically Defined Remote CI & GitHub Pages Deployments ONLY (Environment Variable Bypass)

In consumer host projects deploying to GitHub Pages or executing in lightweight CI environments:
- Running the full auditor executes `validate_similar_code`, which queries or downloads local Fallow vector embeddings models (`jina-embeddings-v2-base-code`).
- There is NO CLI flag to skip similar code. To cleanly omit vector embeddings analysis in headless remote containers or GitHub Actions with strict timeouts, pass the explicit environment variable `AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1`:

```yaml
# In GitHub Actions workflow step:
- name: Audit & Build
  run: npx auditor && npm run build
  env:
    AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS: 1
```

> [!CAUTION]
> **Strict Local Execution Mandate & Absolute Bypassing Prohibition in Local/Development**:
> AI agents and developers MUST NEVER set `AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1` (or `AUDIT_SKIP_SIMILAR=1`) during local development, interactive coding turns, bug triage, or local verification runs. Vector semantic duplication executes locally on Candle CPU in ~2 seconds leveraging disk cache. Bypassing vector analysis is strictly and exclusively reserved for specifically defined remote deployment environments.

---

## 7. Master Environment Setup Scripts Governance (`setup-linux.sh`, `setup-windows.ps1`)

The root environment initialization scripts `setup-linux.sh` and `setup-windows.ps1` belong canonically to `@francogp/auditor` and are distributed with the package.

> [!CAUTION]
> **Prohibition on Local Host Patches**: AI agents and developers **MUST NEVER** attempt to apply ad-hoc local patches, temporary regex replacements, or logic mutations directly inside a host project's `setup-linux.sh` or `setup-windows.ps1`.
> 
> If an issue, defect, version synchronization gap (e.g. Node vs NPM in `--declared-versions`), or platform incompatibility is discovered:
> 1. The agent **MUST PROACTIVELY NOTIFY THE USER**, clearly explaining the root cause.
> 2. The agent **MUST INSTRUCT THE USER** that the change must be requested and made upstream in the `@francogp/auditor` repository.
> 3. Once resolved and released upstream, the host project updates via `npm run auditor:update` and synchronizes the official scripts.


