# Hygiene Refactoring Guide (`auditor:hygiene`)

> [!IMPORTANT]
> **CI Quality Gate (`validate_oxlint`) vs. Interactive Refactor Engine (`auditor:hygiene`)**:
>
> - **`validate_oxlint`**: Blocking CI static analysis suite. Executes in milliseconds, flags strict syntax hygiene violations across TypeScript and Vue files, and fails the build on unhandled errors.
> - **`auditor:hygiene` (`auditor-hygiene`)**: Standalone interactive refactoring engine inheriting from `BaseRefactorEngine`. Discovers candidates, generates Dirac micro-contexts, crafts declarative JSON refactor plans, and safely mutates code in isolated worktree sandboxes (`--worktree`).

---

## 1. Dual Reaction Protocol

When interacting with hygiene rules, AI agents and developers must strictly distinguish between **CI failures** and **elective refactoring**:

### Scenario A: CI Failure (`npm run auditor` / `auditor:findings`)

1. **Diagnosis**: If `validate_oxlint` fails due to `explicit-member-accessibility`, `prefer-global-this`, or `no-void`:
2. **Auto-Fix First**: Execute `npm run auditor:fix` to resolve standard fixable linter violations.
3. **Targeted Hygiene Plan**: For structural class or scope changes, generate a plan with `auditor:hygiene` and apply it to satisfy the blocking gate.

### Scenario B: Elective Code Modernization

1. **Verify Clean Baseline**: Confirm `npm run auditor` passes (0 errors, 0 warnings).
2. **Global Discovery**: Run `npm run auditor:hygiene discover` to list files with hygiene debt.
3. **Dirac Inspection**: Run `npm run auditor:hygiene inspect <filePath>` to inspect the compact Dirac micro-context without loading entire files into LLM context.
4. **Formulate Improvement Plan**: Propose changes and save the plan to `scratch/hygiene_plan.json`.
5. **Worktree Sandbox Execution**: Apply via `npm run auditor:hygiene apply scratch/hygiene_plan.json --worktree`.

---

## 2. Supported Hygiene Rules & AST Transformations

### A. Explicit Member Accessibility (`explicit-member-accessibility`)

- **Linter Rule**: `@typescript-eslint/explicit-member-accessibility`
- **Root Cause**: Class properties, methods, getters, setters, or constructors declared without an explicit accessibility modifier (`public`, `protected`, `private`).
- **Diagnosis**: Missing visibility keywords make API surface boundaries ambiguous and permit accidental external access.
- **Canonical AST Solution**:
  - Automatically injects `public` before the member name.
  - Automatically respects leading decorators (e.g. `@observable public count = 0;`).
  - Automatically skips ECMAScript private fields (`#privateField`).
  - Preserves existing `static`, `readonly`, `async`, `get`, `set` keywords.

#### Before vs. After Example

```ts
// ❌ Before (Linter violation: explicit-member-accessibility)
export class SessionManager {
  token: string = '';
  static instance: SessionManager;

  connect(): void {
    this.token = 'active';
  }

  async refresh(): Promise<boolean> {
    return true;
  }
}

// ✅ After (Clean AST refactor)
export class SessionManager {
  public token: string = '';
  public static instance: SessionManager;

  public connect(): void {
    this.token = 'active';
  }

  public async refresh(): Promise<boolean> {
    return true;
  }
}
```

---

### B. Prefer `globalThis` (`prefer-global-this`)

- **Linter Rule**: `unicorn/prefer-global-this`
- **Root Cause**: Direct references to environment-specific global objects (`window`, `self`, `global`) instead of the standardized universal `globalThis`.
- **Diagnosis**: Direct `window` or `global` references break universal execution across Node.js 26+, web workers, and SSR environments.
- **Canonical AST Solution**:
  - Safely converts `window`, `self`, and `global` identifiers to `globalThis`.
  - Replaces `typeof window !== 'undefined'` with `typeof globalThis.window !== 'undefined'`.
  - Intelligently skips property accessors (`obj.window`), function parameter names (`(window: string) => window`), and local variable declarations that shadow the global name.

#### Before vs. After Example

```ts
// ❌ Before (Linter violation: unicorn/prefer-global-this)
if (typeof window !== 'undefined') {
  const width = window.innerWidth;
  window.setTimeout(() => {}, 100);
}

// ✅ After (Clean AST refactor)
if (typeof globalThis.window !== 'undefined') {
  const width = globalThis.innerWidth;
  globalThis.setTimeout(() => {}, 100);
}
```

---

### C. No `void` Expressions (`no-void`)

- **Linter Rule**: `eslint/no-void`
- **Root Cause**: Use of the `void` operator as an expression, especially in arrow functions returning void calls (e.g. `() => void doWork()`).
- **Diagnosis**: The `void` keyword discards return values obfuscating call sites and violating clean functional style.
- **Canonical AST Solution**:
  - Replaces concise arrow functions returning `void <expr>` with standard block bodies: `() => {\n  doWork();\n}`.
  - Strips leading `void` keyword from standalone expression statements: `void doWork();` -> `doWork();`.

#### Before vs. After Example

```ts
// ❌ Before (Linter violation: eslint/no-void)
const handler = () => void dispatchAction();
void executeBackgroundTask();

// ✅ After (Clean AST refactor)
const handler = () => {
  dispatchAction();
};
executeBackgroundTask();
```

---

## 3. CLI Subcommands & Interactive Tutorial

### Global Discovery

Scan the codebase for all hygiene opportunities without modifying disk:

```bash
npm run auditor:hygiene discover
```

*Console Output*:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ HYGIENE REFACTORING CANDIDATES (auditor:hygiene)                           │
├─────────────────────────────────────────────────┬───────┬───────┬───────────┤
│ File                                            │ Memb. │ Glob. │ No Void   │
├─────────────────────────────────────────────────┼───────┼───────┼───────────┤
│ src/network/socketClient.ts                     │ 4     │ 2     │ 1         │
│ src/ui/components/WodModal.vue                  │ 0     │ 3     │ 2         │
├─────────────────────────────────────────────────┼───────┼───────┼───────────┤
│ TOTAL CANDIDATES                                │ 4     │ 5     │ 3         │
└─────────────────────────────────────────────────┴───────┴───────┴───────────┘
```

### Dirac Micro-Context Inspection

Inspect a specific file and emit a compact Dirac packet:

```bash
npm run auditor:hygiene inspect src/network/socketClient.ts
```

*Output (`scratch/hygiene_plan.json`)*:

```json
{
  "version": 1,
  "planId": "hygiene-plan-1740000000000",
  "targetFiles": ["src/network/socketClient.ts"],
  "memberReplacements": [
    {
      "file": "src/network/socketClient.ts",
      "line": 15,
      "originalSnippet": "connect(): void",
      "replacementSnippet": "public connect(): void"
    }
  ],
  "globalThisReplacements": [
    {
      "file": "src/network/socketClient.ts",
      "line": 42,
      "originalSnippet": "window.addEventListener",
      "replacementSnippet": "globalThis.addEventListener"
    }
  ],
  "noVoidReplacements": []
}
```

### Safe Application in Worktree Sandbox

Apply the generated declarative plan safely inside an isolated worktree branch:

```bash
npm run auditor:hygiene apply scratch/hygiene_plan.json --worktree
```

The engine automatically:

1. Branches an isolated Git worktree (`git worktree add`).
2. Mutates code via TypeScript AST replacements.
3. Runs regression tests (`vp test`).
4. Verifies the audit gate (`vp check`).
5. Merges cleanly to the working branch and cleans up the worktree.
