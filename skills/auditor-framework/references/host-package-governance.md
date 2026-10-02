# Host Installation, NPM Updates & Dependency Governance (`@francogp/auditor`)

This reference details the canonical architecture and workflow for installing, updating, and consuming `@francogp/auditor` as a standard GitHub npm dependency in consumer host applications (such as `facturacion2`, `PokeBorrador`, etc.).

---

## 1. Initial Installation in Consumer Host Projects

To install `@francogp/auditor` in a host application, run standard `npm install`:

```bash
npm install github:francogp/auditor
```

- **Lockfile Registration**: `npm install` fetches the package from GitHub and records the exact commit hash and checksum in `package-lock.json`.
- **Pre-Compiled Artifacts in Git**: The `dist/` directory is pre-compiled and tracked directly in the repository with executable permissions (`100755`), ensuring immediate availability in `node_modules/.bin/` without requiring local compilation or install hooks.
- **Antigravity Plugin Registration**: Ensure `.agents/plugins.json` in the host project root declares:
  ```json
  {
    "entries": [
      {
        "path": "node_modules/@francogp/auditor"
      }
    ]
  }
  ```
  This is committed once in the host repository. It allows Antigravity to dynamically discover all official skills (`skills/*`) and rules (`rules/AGENTS.md`) directly from `node_modules/@francogp/auditor` without duplicating files in-tree.

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
4. All bundled skills (`skills/*`) and agent rules (`rules/AGENTS.md`) located in `node_modules/@francogp/auditor` are instantly updated on disk. Because the host's `.agents/plugins.json` already points to `node_modules/@francogp/auditor`, Antigravity immediately discovers the latest skills without needing manual copy operations.
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
- `auditor-findings` (interactive findings reporter `report_findings.ts`)
- `auditor-fallow` (Fallow intelligence suite `report_fallow.ts`)
- `auditor-complexity` (complexity hotspot analysis `report_complexity.ts`)
- `auditor-similar` (semantic code clone detection `report_similar_code.ts`)
- `auditor-review` (architectural review brief `report_review.ts`)
- `auditor-bundle` (chunk budget validation `audit_bundle.ts`)
- `auditor-init-agent` (agent plugin registrator)
- `auditor-sync-env` (environment script synchronizer)

### Canonical `scripts` Configuration in Host `package.json`:
```json
{
  "scripts": {
    "audit": "auditor",
    "audit:lint": "auditor preset=lint",
    "audit:for-commit": "auditor-commit",
    "audit:findings": "auditor-findings",
    "audit:errors": "auditor-findings severity=error",
    "audit:warnings": "auditor-findings severity=warning",
    "audit:summary": "auditor-findings",
    "audit:md": "auditor preset=md",
    "audit:fallow": "auditor-fallow category=all",
    "audit:complexity": "auditor-complexity",
    "audit:similar": "auditor-similar",
    "audit:review": "auditor-review",
    "lint": "npm run audit:lint",
    "lint:fix": "auditor preset=lint fix",
    
    // ONLY define bespoke extension scripts:
    "validate:script-hardcoding": "auditor task=validate_script_hardcoding"
  }
}
```

Host extensions declared in `audit.config.ts` are automatically discovered and executed by `npm run audit`. No manual runner registration is required.

---

## 5. Universal Standard `build` Script Contract

Tool packages distributing CLI tools or pre-compiled distribution bundles (`dist/`) MUST strictly use the universal standard npm convention:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.build.json && chmod +x dist/cli/*.js"
  }
}
```

Custom non-standard script names like `compile` or `build:dist` are strictly prohibited to maintain consistency and eliminate cognitive friction across tooling. Architectural audits and quality gates remain decoupled under `npm run audit`.

---

## 6. GitHub Pages & CI Deployments (`--skip-similar`)

In consumer host projects deploying to GitHub Pages or executing in lightweight CI environments:
- Running the full auditor executes `validate_similar_code`, which queries or downloads local Fallow vector embeddings models (`jina-embeddings-v2-base-code`).
- In cloud runners or GitHub Actions with strict timeouts, restricted network access, or headless GitHub Pages builds, pass the `--skip-similar` flag (or `AUDIT_SKIP_SIMILAR=1`) to cleanly omit vector embeddings analysis while executing 100% of all other architectural, style, type, and security suites:

```bash
# In package.json or deployment command:
auditor --skip-similar

# Or in GitHub Actions workflow step:
- name: Audit & Build
  run: npx auditor --skip-similar && npm run build
  env:
    AUDIT_SKIP_SIMILAR: 1
```

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


