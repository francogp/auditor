# Host Project Migration Guide: Upgrading to @francogp/auditor v8

This guide outlines the step-by-step procedure, technical rationale, and friction points encountered when upgrading host applications (such as `PokeBorrador`) from `@francogp/auditor` v7 to v8.

---

## 🚀 1. Package Upgrade & Automated Script Synchronization

### 1.1 Upgrade Package via SSoT CLI

Never update the auditor package by manually modifying `package.json` or running ad-hoc git commands. Always use the canonical auditor updater:

```bash
npm run auditor:update
# or directly:
auditor-update
```

Verify the installed runtime version:

```bash
auditor-version -v
```

### 1.2 Automated Scripts & CI Workflow Fix (`auditor fix`)

Run the automated repair engine to inject mnemonic scripts and migrate legacy references:

```bash
npm run auditor:fix
```

This automated step:

1. Replaces legacy commands (`auditor:build`, `build:prod`, `auditor:precommit`) with the canonical v8 suite:
   - `auditor:lint`: Fast syntax/AST lint ceiling (`auditor speed=light` 🐇).
   - `auditor`: Default heavy workspace audit ceiling (`auditor speed=heavy` 🐢).
   - `auditor:full`: Exhaustive pre-release ceiling (`auditor speed=full` 🐘).
   - `auditor:post-build`: Compiled artifact verification against `dist/` (`auditor phase=post-build`).
   - `build:deploy`: Production build orchestrator with `AUDITOR_ENV=production`.
2. Automatically migrates CI workflow files (`.github/workflows/deploy.yml` or similar) from legacy `build:prod` to `npm run build:deploy`.
3. Synchronizes the master build gate in `package.json`:

   ```json
   "build": "npm run auditor:full && vite build && npm run auditor:post-build"
   ```

---

## 🏛️ 2. Modernizing Extension Rule Capabilities (`AuditorRuleCapabilities`)

In v8, `BaseAuditor` enforces the **Explicit 7-Field Orthogonal Capabilities Contract** (`AuditorRuleCapabilities`). Legacy 10-boolean declarations (`lint`, `precommit`, `requiresBuild`, `postRun`, `heavy`, `fixPriority`) fail loudly at runtime:

```text
[Auditor Contract Violation] Auditor [id] must explicitly define 'ruleCapabilities.<ruleId>.speed' as 'light' | 'heavy' | 'full'
```

### 2.1 The 7 Orthogonal Fields

```ts
export interface AuditorRuleCapabilities {
  readonly speed: 'light' | 'heavy' | 'full' | readonly ('light' | 'heavy' | 'full')[];
  readonly phase: 'normal' | 'post-run' | 'post-build';
  readonly fix: 'none' | 'normal' | 'priority';
  readonly md: boolean;
  readonly ast: boolean;
  readonly changedOnly: boolean;
  readonly critical: boolean;
}
```

### 2.2 Migration Mapping Matrix

| Legacy v7 Capability Property | v8 Orthogonal Equivalent | Notes |
|---|---|---|
| `lint: true, heavy: false` | `speed: 'light'` | Fast in-memory AST or regex checks (🐇) |
| `heavy: true` | `speed: 'heavy'` | Multi-file disk, database, or simulation checks (🐢) |
| Deep type-aware (e.g. `fallow`) | `speed: 'full'` or `['light', 'full']` | Exhaustive verification (🐘) |
| `phase: 'normal'` | `phase: 'normal'` | Standard source audit |
| `postRun: true` | `phase: 'post-run'` | Sequential execution post-audit (coverage flush) |
| `requiresBuild: true` | `phase: 'post-build'` | Executed against `dist/` via `auditor:post-build` |
| `fix: false` | `fix: 'none'` | Non-auto-fixable rule |
| `fix: true, fixPriority: false` | `fix: 'normal'` | Standard auto-fixable rule |
| `fixPriority: true` | `fix: 'priority'` | Executed first during `auditor fix` |
| `ast: boolean` | `ast: boolean` | Preheats shared TypeScript AST |
| `md: boolean` | `md: boolean` | Included in markdown-only preset |
| `changedSince: boolean` | `changedOnly: boolean` | Differential git diff scoping (`changedSince` eradicated) |
| Syntax/Type/Linter essential | `critical: true` | Bypasses speed ceiling in `auditor:lint` and `auditor:critical` |
| Standard architecture rule | `critical: false` | Standard speed ceiling governance |

### 2.3 Refactoring Blueprint for Extensions

#### Uniform Capabilities (All rules share identical capabilities)

```ts
import { BaseAuditor, createUniformRuleCapabilities } from '@francogp/auditor';

export class MyCustomAuditor extends BaseAuditor<MyRuleId> {
  constructor() {
    super({
      ruleCapabilities: createUniformRuleCapabilities(MY_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      // ... rest of AuditorOptions
    });
  }
}
```

#### Individual Rule Fixability or Overrides

```ts
import { BaseAuditor, createRuleCapabilities } from '@francogp/auditor';

export class MyCustomAuditor extends BaseAuditor<MyRuleId> {
  constructor() {
    super({
      ruleCapabilities: createRuleCapabilities(
        MY_RULES,
        {
          speed: 'light',
          phase: 'normal',
          fix: 'none',
          md: false,
          ast: true,
          changedOnly: false,
          critical: false
        },
        ['fixable-rule-1', 'fixable-rule-2'] // Automatically sets fix: 'normal' for these rules
      ),
      // ... rest of AuditorOptions
    });
  }
}
```

---

## ⚡ 3. Eradicating Homebrew Recursive Directory Walkers

A major cause of performance degradation in host repositories is homebrew directory walkers traversing the disk recursively with synchronous `statSync` and manual arrays.

The static analysis rule `auditor-inefficient-file-scan` and `auditor-homebrew-file-walker` prohibits recursive walkers.

### 3.1 Within Auditor Extensions: Single-Pass Reading (`scanFilesSinglePass`)

When multiple rules inspect the same collection of files, NEVER loop over all files once per rule. Consume `this.scanFilesSinglePass()` backed by the in-RAM `WorkspaceFileCache`:

```ts
// ❌ ANTI-PATTERN: Scanning disk N times for N rules
for (const rule of RULES) {
  this.runSubAuditorSync(rule, () => {
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8'); // Disk re-read per rule!
      // ...
    }
  });
}

// ✅ CANONICAL PATTERN: In-RAM single pass
await this.scanFilesSinglePass(files, {
  onFile: (relPath, content) => {
    this.checkSyntax(relPath, content);
    this.checkImports(relPath, content);
  }
});
```

### 3.2 Outside Auditor Extensions (Build Scripts & Maintenance Utilities): Native Node.js 26+

Host scripts (e.g. `scripts/build/*.ts`, `scripts/maintenance/*.ts`) should never write recursive directory walk functions. Use native Node.js 26+ `readdir(..., { recursive: true, withFileTypes: true })`:

```ts
// ❌ ANTI-PATTERN: Recursive homebrew walker
function walk(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) results = results.concat(walk(full));
    else results.push(full);
  });
  return results;
}

// ✅ CANONICAL PATTERN: Native Node.js 26+ recursive directory read
import fs from 'node:fs';
import path from 'node:path';

export function collectFiles(dir: string, extension: string): string[] {
  const entries = fs.readdirSync(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith(extension))
    .map(entry => path.join(entry.parentPath, entry.name));
}
```

---

## 🔍 4. Verification Workflow

After updating extensions and scripts:

1. **Verify Fast Lint Tier (Light 🐇)**:

   ```bash
   npm run auditor:lint
   ```

   Ensures all lightweight AST and syntax rules pass instantaneously.

2. **Verify Full Standard Workspace Audit (Heavy 🐢)**:

   ```bash
   npm run auditor
   ```

   Ensures all domain, persistence, assets, and architecture rules pass cleanly.

3. **Verify Master Build Pipeline**:

   ```bash
   npm run build
   ```

   Ensures `auditor:full` ➔ compile ➔ `auditor:post-build` executes smoothly end-to-end.
