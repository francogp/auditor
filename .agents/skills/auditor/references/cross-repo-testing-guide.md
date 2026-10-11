# Cross-Repository & Remote Project Execution Guide (`--project` / `-p`)

This guide specifies the architecture, CLI flags, and execution lifecycle for running `@francogp/auditor` against external consumer repositories on the same workstation without requiring intermediate commits, pushes, or package publication.

---

## 🎯 Use Cases & Objectives

During framework development, engine refactoring, or sub-auditor creation within `@francogp/auditor`, engineers and AI agents need to test suites, fixes, and new analyzers against real host applications (e.g., games, billing apps, or client workspaces) directly on the local machine:

```bash
# Full audit against a target local host repository:
npm run auditor -- project="../PokeBorrador"

# Quick lint preset against target repository:
npm run auditor:lint -- project="../PokeBorrador"

# Auto-fix mode against target repository:
npm run auditor:fix -- project="../PokeBorrador"

# Interactive findings inspection on target repository:
npm run auditor:findings -- project="../PokeBorrador"
```

---

## 🚩 Supported CLI Flag Variants

The framework resolves the target project via `bootstrapCliProject(argv)` supporting:

- `--project=<path>` or `--project <path>`
- `project=<path>`
- `-p <path>` or `-p=<path>`

---

## 🏗️ Architecture: Pre-flight Early Chdir Bootstrap

The remote execution engine operates via five hermetic phases implemented across `src/cli/cliUtils.ts`, `src/cli/auditScanner.ts`, and `src/core/auditorBase.ts`:

### 1. Bootstrap Phase (`src/cli/cliUtils.ts`)

- `bootstrapCliProject()` inspects CLI arguments before any configuration, suites, or AST caches are initialized.
- It validates that the target path exists and contains a valid `package.json` via native Node.js APIs (`node:path` and `node:fs`).
- It establishes environment variables:
  - `AUDITOR_HOME_DIR`: The auditor framework package root directory.
  - `AUDIT_PROJECT_ROOT`: The resolved absolute host project root directory.
- It switches the process working directory via `process.chdir(targetDir)`.

### 2. Native Third-Party Tool Context

- External tools (ESLint, Fallow on Candle CPU, Stylelint, HTML-Validate, Git, and Warning Ratchet) operate transparently with `process.cwd()` set to the host directory.
- They load the host's `eslint.config.js`, `.stylelintrc.json`, `tsconfig.json`, and git baseline without path translation hazards or cwd mismatches.
- If an external tool binary is missing from the host's `node_modules/.bin/`, `resolvePackageBin` seamlessly falls back to `AUDITOR_HOME_DIR/node_modules/.bin/`.

### 3. Dynamic Host Configuration & Extension Discovery

- The master orchestrator loads the host's `.auditor/audit.config.ts`, discovering all host extensions (e.g. `scripts/auditors/*.ts`) alongside the official suites from `AUDITOR_HOME_DIR/src/suites/`.
- Dynamic import cache-busting ensures fresh configuration reads without Node.js ESM caching hazards.

### 4. Hermetic Satellite Tool Compatibility

- `stripProjectCliArgs(argv)` strips the project flags before satellite CLI option parsers run, ensuring tools like `report_findings.ts`, `report_complexity.ts`, or `report_fallow.ts` process positional arguments and filters correctly.

### 5. Results & Cache Isolation

- All audit reports, structured JSON ledgers (`latest_audit.json`), and ephemeral results are written strictly to the host's `scratch/audits/` directory, preventing pollution of the auditor framework's own workspace.
