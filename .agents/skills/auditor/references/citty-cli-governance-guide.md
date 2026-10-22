# Declarative CLI Contracts & Citty Implementation Guide

This guide establishes the canonical architectural standard for authoring, migrating, and maintaining command-line interface (CLI) scripts, maintenance tools, refactoring engines, and sub-auditors using **`citty` (`citty@^0.2.2`)** and the **`isMainModule` Universal CLI Entrypoint Guard**.

---

## 1. Governance & Core Mandate (`validate_cli_contracts`)

All CLI scripts across `@francogp/auditor` and consumer host projects are strictly governed by **`validate_cli_contracts`** (`phase: 'setup'`, `critical: true`). Homebrew command-line argument parsing and unauthorized parser libraries are strictly prohibited.

### The 7 Canonical CLI Rules

| Rule ID | Severity | Description |
|:---|:---:|:---|
| `cli-contracts-direct-argv-access` | Error | Prohibits accessing `process.argv`, `process['argv']`, `Deno.args`, or `Bun.argv` outside canonical harness utilities. |
| `cli-contracts-banned-parser-library` | Error | Prohibits unauthorized CLI parsers (`minimist`, `yargs`, `commander`, `cac`, `arg`, `mri`, `node:util.parseArgs`). Standardizes on `citty@^0.2.2`. |
| `cli-contracts-homebrew-flag-parsing` | Error | Prohibits manual string inspection (`arg.startsWith('--')`, `args.includes('--clean')`, `arg.split('=')`, `args[0]`). |
| `cli-contracts-dynamic-eval-bypass` | Error | Prohibits dynamic evaluation or synchronous stdin bypasses (`eval()`, `new Function()`, `fs.readFileSync(0)`). |
| `cli-contracts-missing-citty-contract` | Error | Enforces that CLI entrypoints declare contracts using `defineCommand`, `createRefactorCli`, `createAuditorCli`, or `parseCittyArgs`. |
| `cli-contracts-missing-citty-dependency` | Error | Enforces `"citty": "^0.2.2"` in `peerDependencies` of `@francogp/auditor` and `devDependencies` of host projects. |
| `cli-contracts-unregistered-script` | Error | Enforces registration of mandatory `:human` scripts in `packageScriptRegistry.ts`. |

---

## 2. The Critical Entrypoint Guard: `isMainModule(import.meta.url)`

### ⚠️ Post-Mortem Case Study: The Unconditional `runMain` Disaster

In a real-world refactoring session (Conversation `Actualizacion auditor 9`), an AI agent migrated several maintenance and test scripts (`run_breeding_fuzzer.ts`, `run_sequential_simulations.ts`, `repair_account_legality.ts`, `diagnose_account.ts`, `run_tests.ts`) to Citty by placing `runMain(command)` unconditionally at the bottom of the files:

```typescript
// ❌ CRITICAL BUG: runMain invoked unconditionally at module top-level!
export const command = defineCommand({ ... });
runMain(command);
```

#### What went wrong

1. **Immediate Execution on Import**: In Node.js ESM, all top-level statements run synchronously when a file is imported. Because `runMain` is asynchronous, calling it unconditionally causes Citty to parse `process.argv` and execute the command immediately in the background whenever the module is loaded.
2. **Cascading Background Storm**: When the auditor (`validate_script_commands`), unit tests, or other scripts imported utility functions or types from those files, **every single `runMain` fired simultaneously in the background**:
   - Multiple SQLite transactions and PostgreSQL connections opened concurrently.
   - Playwright browser instances and E2E simulation suites spawned.
   - Combinatorial breeding fuzzer matrix loops started executing.
   - Child Node.js processes multiplied exponentially.
3. **Hardware Lockup & Memory Exhaustion (OOM)**:
   - System RAM reached 100% capacity within seconds.
   - Disk I/O (HDD/SSD) pegged at 100% due to aggressive virtual memory paging.
   - The entire development machine froze, and `npm run auditor:lint` appeared to hang indefinitely.
4. **Compounding Agent Anti-Patterns**:
   - The AI blamed the auditor's worker thread pool rather than investigating its own file edits.
   - It attempted to run `npm run auditor speed=light concurrency=1`, violating framework concurrency and thread governance rules.
   - It attempted to inspect internal compiled files in `node_modules/@francogp/auditor/dist/`, violating the **Dependency Immutability Mandate**.

### The Universal Invariant

> [!IMPORTANT]
> **`runMain(command)` MUST NEVER BE CALLED AT MODULE TOP-LEVEL WITHOUT AN `isMainModule` GUARD.**
>
> If a file exports helper functions, constants, or types that might be imported elsewhere, `runMain` must execute **ONLY** when the module is the direct CLI entrypoint.

```typescript
import { isMainModule } from '@francogp/auditor'; // or './cliUtils.ts' in auditor core
import { defineCommand, runMain } from 'citty';

export const command = defineCommand({
  meta: {
    name: 'my-maintenance-tool',
    description: 'Database maintenance and repair utility'
  },
  args: { ... },
  async run({ args }) {
    await performMaintenance(args);
  }
});

// ✅ MANDATORY GUARD: Executes ONLY when run directly from terminal
if (isMainModule(import.meta.url)) {
  runMain(command);
}
```

---

## 3. Correct Implementation Examples

### Example 1: Standard Standalone Script with Typed Args

A maintenance or testing script accepting flags, options, and positional parameters:

```typescript
// scripts/maintenance/repair_account.ts
import { isMainModule } from '@francogp/auditor';
import { defineCommand, runMain } from 'citty';

export interface RepairOptions {
  readonly user?: string;
  readonly all?: boolean;
  readonly dryRun?: boolean;
  readonly targetServer?: string;
}

export async function repairAccount(options: RepairOptions): Promise<void> {
  // Reusable core logic (safe to import anywhere without side effects)
}

export const command = defineCommand({
  meta: {
    name: 'repair-account',
    description: 'Repair account legality and integrity'
  },
  args: {
    user: {
      type: 'string',
      alias: 'u',
      description: 'Account ID, username, or email to repair'
    },
    all: {
      type: 'boolean',
      alias: 'a',
      description: 'Repair all registered accounts',
      default: false
    },
    dryRun: {
      type: 'boolean',
      alias: 'd',
      description: 'Simulate changes without persisting',
      default: false
    },
    targetServer: {
      type: 'positional',
      description: 'Target server environment (local, staging, prod)',
      required: false,
      default: 'local'
    }
  },
  async run({ args }) {
    // Typed arguments consumed directly from Citty context
    await repairAccount({
      user: args.user,
      all: args.all,
      dryRun: args.dryRun,
      targetServer: args.targetServer
    });
  }
});

if (isMainModule(import.meta.url)) {
  runMain(command);
}
```

### Example 2: Multi-Action Tool with Declarative Subcommands

When a script supports multiple distinct operational modes (e.g. `list`, `table`, `run`), declare them using `subCommands`:

```typescript
// scripts/e2e/manage_simulations.ts
import { isMainModule } from '@francogp/auditor';
import { defineCommand, runMain } from 'citty';

const listCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List all discovered E2E simulation suites'
  },
  async run() {
    // List logic
  }
});

const tableCommand = defineCommand({
  meta: {
    name: 'table',
    description: 'Render progress table in Box-Drawing format'
  },
  async run() {
    // Table rendering logic
  }
});

const runCommand = defineCommand({
  meta: {
    name: 'run',
    description: 'Execute simulation suite'
  },
  args: {
    filter: {
      type: 'string',
      description: 'Filter test suites by pattern',
      alias: 'f'
    },
    clean: {
      type: 'boolean',
      description: 'Reset checkpoints prior to running',
      default: false
    }
  },
  async run({ args }) {
    // Run logic using args.filter and args.clean
  }
});

export const mainCommand = defineCommand({
  meta: {
    name: 'simulations',
    description: 'E2E Simulation Management Harness'
  },
  subCommands: {
    list: listCommand,
    table: tableCommand,
    run: runCommand
  }
});

if (isMainModule(import.meta.url)) {
  runMain(mainCommand);
}
```

### Example 3: Sub-Auditor CLI Entrypoint

Sub-auditors extending `BaseAuditor` or `FileScanAuditor` use the built-in static runner:

```typescript
// scripts/auditors/validate_custom_rules.ts
import { BaseAuditor, FileScanAuditor } from '@francogp/auditor';

export class CustomRulesAuditor extends FileScanAuditor<CustomRuleId> {
  // Sub-auditor implementation
}

// ✅ Canonical entrypoint: handles isMainModule, Citty args, --fix, and Box-Drawing
await BaseAuditor.runCliIfMain(import.meta.url, new CustomRulesAuditor());
```

### Example 4: Interactive Refactoring CLI Entrypoint

Engines extending `BaseRefactorEngine` use `createRefactorCli`:

```typescript
// src/cli/refactor_motion.ts
import { isMainModule } from './cliUtils.ts';
import { createRefactorCli } from '../core/refactor/refactorCliHarness.ts';
import { MotionRefactorEngine } from '../core/refactor/motionRefactorEngine.ts';

if (isMainModule(import.meta.url)) {
  await createRefactorCli({
    toolName: 'auditor-motion',
    bannerTitle: 'UI MOTION & GSAP REFACTOR ENGINE',
    helpText: HELP_TEXT,
    createEngine: (projectRoot) => new MotionRefactorEngine({ projectRoot }),
    renderDiscoverHuman,
    renderInspectHuman
  });
}
```

---

## 4. Anti-Patterns & How NOT to Implement

### ❌ Anti-Pattern 1: Unconditional `runMain` (Process Storm & Memory Crash)

```typescript
// ❌ TERRIBLE: Executes when imported by tests, linters, or other tools!
export const command = defineCommand({
  meta: { name: 'fuzzer' },
  async run() {
    await startHeavyFuzzingLoop();
  }
});

runMain(command); // ❌ Dispatches background worker storm on import!
export { startHeavyFuzzingLoop };
```

**Why it fails**: When another file does `import { startHeavyFuzzingLoop } from './fuzzer.ts'`, `runMain` executes immediately in the background, consuming CPU and RAM without user intention.

---

### ❌ Anti-Pattern 2: Accessing `process.argv` Inside Citty Commands

```typescript
// ❌ WRONG: Defeats Citty and triggers cli-contracts-direct-argv-access
export const command = defineCommand({
  meta: { name: 'tool' },
  run() {
    const rawArg = process.argv[2]; // ❌ VIOLATION
    if (process.argv.includes('--force')) { // ❌ VIOLATION
      // ...
    }
  }
});
```

**Canonical Solution**: Declare typed `args` in `defineCommand` and consume `{ args }` in `run`:

```typescript
// ✅ CORRECT: Declarative and fully typed
export const command = defineCommand({
  meta: { name: 'tool' },
  args: {
    target: { type: 'positional', required: true },
    force: { type: 'boolean', default: false }
  },
  run({ args }) {
    const target = args.target;
    if (args.force) {
      // ...
    }
  }
});
```

---

### ❌ Anti-Pattern 3: Homebrew Flag Parsing and String Splitting

```typescript
// ❌ WRONG: Triggers cli-contracts-homebrew-flag-parsing
function parseFlags(args: string[]) {
  const isDebug = args.some(a => a.startsWith('--debug')); // ❌ Homebrew flag
  const target = args.find(a => a.includes('='))?.split('=')[1]; // ❌ Manual split
  const command = args[0]; // ❌ Positional assumption
}
```

**Canonical Solution**: Citty automatically normalizes and parses `key=val` pairs and boolean flags. Declare `args: { debug: { type: 'boolean' }, target: { type: 'string' } }`.

---

### ❌ Anti-Pattern 4: Fragile Homebrew Entrypoint Checks

```typescript
// ❌ WRONG: Brittle path string heuristics fail across Windows/Linux and shims
if (process.argv[1]?.endsWith('script.ts')) {
  main();
}

if (import.meta.url.includes(process.argv[1])) {
  main();
}
```

**Canonical Solution**: Use `isMainModule(import.meta.url)` from `@francogp/auditor`. It resolves symlinks, Windows npm `.cmd` shims, `.ts` vs `.js` distribution binaries, and realpath normalization.

---

### ❌ Anti-Pattern 5: Banned Third-Party Parser Libraries

```typescript
// ❌ WRONG: Triggers cli-contracts-banned-parser-library
import yargs from 'yargs';
import { Command } from 'commander';
import minimist from 'minimist';
import { parseArgs } from 'node:util';
```

**Canonical Solution**: Remove third-party parser dependencies and standardize on `defineCommand` from `citty`.

---

## 5. Summary Checklist for AI Agents & Developers

Before committing any CLI script or maintenance tool, verify:

1. [ ] **`isMainModule` Guard**: Is `runMain(command)` guarded by `if (isMainModule(import.meta.url))`?
2. [ ] **Zero `process.argv` Access**: Are all flags and options accessed via `run({ args })`?
3. [ ] **Zero Homebrew Parsing**: Are there zero `.startsWith('--')`, `.includes('--')`, or `.split('=')` checks?
4. [ ] **Positional Declarations**: Are positional parameters declared as `type: 'positional'` rather than extracted from raw arrays?
5. [ ] **Subcommands Declared**: Are subcommands structured via `subCommands: { ... }` rather than manual `switch (args[0])`?
6. [ ] **Hermetic Verification**: Does `npm run auditor phase=setup` (or `task=validate_cli_contracts`) pass cleanly with 0 errors?
