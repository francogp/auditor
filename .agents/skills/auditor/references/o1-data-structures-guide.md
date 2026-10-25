# O(1) Data Structures & Linear Search Refactoring Guide (`auditor-o1`)

> [!IMPORTANT]
> **Distinction Between CI Quality Gate & Interactive Refactor Tool**:
>
> - **`validate_o1_structures` (`npm run auditor`)**: CI static verification suite. Audits forbidden linear search anti-patterns in hot execution loops and legacy JSON clone hacks (`JSON.parse(JSON.stringify())`). If CI passes with 0 errors, there are no blocking performance regressions in CI.
> - **`auditor-o1` (`npm run auditor:o1`)**: Interactive refactoring engine (`BaseRefactorEngine`). Systematically discovers opportunities across the entire repository to hoist array `.includes()` lookups to module-level `ReadonlySet` constants, eliminate redundant array spread returns, and modernize deep cloning to `structuredClone()`.
> - `npm run auditor` **NEVER** runs `auditor:o1`. Candidates reported by `auditor:o1 discover` are elective architectural improvements, not CI failures. See [quality-gates-vs-refactor-engines.md](./quality-gates-vs-refactor-engines.md).

The `auditor-o1` CLI and `O1RefactorEngine` provide automated detection and deterministic remediation for $O(N)$ linear search anti-patterns governed by `validate_o1_data_structures`.

---

## 🎯 Architecture & Guiding Principles

1. **O(1) Set Membership Over O(N) Array Scanning**:
   Calling `.includes()` or `.indexOf()` on constant arrays in frequent execution paths (getters, loops, validations) produces unnecessary linear overhead:

   ```ts
   // Anti-pattern: O(N)
   export const ALLOWED_ROLES = ['admin', 'editor', 'viewer'] as const;
   if (ALLOWED_ROLES.includes(role)) { ... }

   // Canonical O(1)
   export const ALLOWED_ROLES = ['admin', 'editor', 'viewer'] as const;
   export const ALLOWED_ROLES_SET: ReadonlySet<Role> = new Set(ALLOWED_ROLES);
   if (ALLOWED_ROLES_SET.has(role)) { ... }
   ```

2. **Modern `structuredClone()` Over `JSON.parse(JSON.stringify())`**:
   `JSON.parse(JSON.stringify(x))` is an outdated deep cloning idiom that is slow, drops `Date`, `RegExp`, `Set`, `Map`, `BigInt`, and loses type accuracy. Node.js 26+ natively supports `structuredClone(x)`.
3. **Elimination of Redundant Spread Returns**:
   `return [...arr];` inside functions that do not mutate arrays introduces redundant heap allocations. The return signature should be typed as `readonly T[]` and return the array directly (`return arr;`).

---

## 🛠️ CLI Tool Usage (`auditor-o1`)

```bash
# Direct CLI invocation (bin in node_modules/.bin)
auditor-o1 <command> [options]

# Via package script
npm run auditor:o1 <command>
npm run auditor:o1 -- <command> [options]
```

### 1. `discover`: Scan Project for O(N) Anti-Patterns

```bash
npm run auditor:o1 discover
npm run auditor:o1 discover -- --project ../pokeborrador
```

Renders a Box-Drawing table with counts for `Set.has`, `Clone`, and `Spread`.

### 2. `inspect`: Generate Dirac Micro-Context

```bash
npm run auditor:o1 inspect -- --file src/services/auth.ts
```

### 3. `apply`: Deterministic Plan Execution

```bash
# Dry-run / Direct apply
npm run auditor:o1 apply -- --plan scratch/o1-plan.json

# Safe execution inside an isolated Git Worktree
npm run auditor:o1 apply -- --plan scratch/o1-plan.json --worktree
```

---

## 📋 Declarative Plan Format (`O1RefactorPlan`)

```json
{
  "version": 1,
  "planId": "o1-plan-1792352000",
  "targetFiles": ["src/services/auth.ts"],
  "membershipHoists": [
    {
      "file": "src/services/auth.ts",
      "arrayIdentifier": "ALLOWED_ROLES",
      "setIdentifier": "ALLOWED_ROLES_SET",
      "callLines": [45, 88]
    }
  ],
  "jsonCloneReplacements": [
    {
      "file": "src/services/auth.ts",
      "line": 112,
      "originalExpression": "JSON.parse(JSON.stringify(payload))",
      "replacementExpression": "structuredClone(payload)"
    }
  ],
  "spreadReplacements": [
    {
      "file": "src/services/auth.ts",
      "line": 150,
      "originalReturn": "return [...this.items];",
      "replacementReturn": "return this.items;"
    }
  ]
}
```

---

## 🛡️ Zero Escape Hatches & Architectural Alternatives

Comment escape hatches (`// o1-ok:`, `// linear-search-ok:`) are permanently eradicated. Instead, use canonical data structures and configuration:

1. **Small Fixed Sets**: For small static arrays (e.g. `<= 4` elements), use `as const` tuple arrays or explicit Set lookups (`new Set([...])`).
2. **Deep Cloning**: For structured deep cloning, use native `structuredClone(obj)` instead of `JSON.parse(JSON.stringify(obj))`.
3. **Exemptions**: If a specific utility requires exemption, configure file or path exemptions in `.auditor/audit.config.ts` (`paths.exemptPaths` or tool-specific config) rather than embedding inline comment escape hatches.

---

## 5. Reaction Protocol: CI Error vs. Elective Optimization

### Scenario A: CI Quality Gate Error (`validate_o1_structures`)

- **Trigger**: `npm run auditor` reports `o1-forbidden-json-clone` or `o1-linear-search-in-loop`.
- **Strategic Phase**: Phase 5 (`behavior`).
- **Action**: Formulate a **Correction Plan**. Replace `JSON.parse(JSON.stringify(x))` with native `structuredClone(x)` or hoist array lookup outside the loop to a Set.
- **Verification**: `npm run auditor -- suite=validate_o1_structures` -> Green.

### Scenario B: Elective Performance Optimization (`auditor:o1`)

- **Trigger**: User requests *"optimize O(1) structures"*, *"speed up membership lookups"*, or *"remove redundant spreads"*.
- **Pre-flight Invariant**: Verify `npm run auditor` is 100% green before proceeding.
- **Action**: Formulate an **Improvement Plan**. Run `auditor:o1 discover`, inspect candidates via `auditor:o1 inspect --file <target>`, generate `scratch/o1_plan.json`, and apply with `--worktree`.

---

## 6. Concrete Plan Blueprints

### Correction Plan (CI Error: `o1-forbidden-json-clone`)

````markdown
# Correction Plan: o1-forbidden-json-clone in stateManager.ts

## 1. Diagnosis & Strategic Phase
- **Active Phase (`auditor:next`)**: `behavior` (Phase 5)
- **Suite**: `validate_o1_structures`
- **Location**: `src/state/stateManager.ts:L92`
- **Violation**: Use of `JSON.parse(JSON.stringify(state))` to clone application state.

## 2. Canonical Solution
Replace with the Node.js 26+ native standard function:

```ts
const clonedState = structuredClone(state);
```

## 3. Verification

`npm run auditor -- suite=validate_o1_structures`
````

### Improvement Plan (Elective: `auditor:o1`)

````markdown
# Improvement Plan: Hoisting to ReadonlySet in permissions.ts

## 1. Scope & Motivation
- **Tool**: `auditor-o1`
- **Objective**: Convert linear search O(N) `VALID_PERMISSIONS.includes(p)` into O(1) `VALID_PERMISSIONS_SET.has(p)` inside the route guard.
- **Pre-flight CI Baseline**: 100% Green (0 errors, 0 warnings).

## 2. Candidate Catalog (Dirac Micro-Context)
| File | Array Identifier | New Set Identifier | Invocation Lines |
| :--- | :--- | :--- | :--- |
| `src/auth/permissions.ts` | `VALID_PERMISSIONS` | `VALID_PERMISSIONS_SET` | L34, L87, L112 |

## 3. Declarative Plan (`scratch/o1_plan.json`)

```json
{
  "version": 1,
  "planId": "o1-plan-permissions-set",
  "targetFiles": ["src/auth/permissions.ts"],
  "membershipHoists": [
    {
      "file": "src/auth/permissions.ts",
      "arrayIdentifier": "VALID_PERMISSIONS",
      "setIdentifier": "VALID_PERMISSIONS_SET",
      "callLines": [34, 87, 112]
    }
  ]
}
```

## 4. Sandbox Execution

`npm run auditor:o1 apply --plan scratch/o1_plan.json --worktree`
````

---

## 7. Step-by-Step Tutorial & CLI Walkthrough

### Step 1: Discover O(N) Anti-Patterns

```bash
npm run auditor:o1 discover
```

Output displays:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                    auditor-o1: Linear Search Discovery Table                 │
├──────────────────────────────┬───────────┬─────────────┬─────────────────────┤
│ File                         │ Set.has   │ Clone       │ Spread Return       │
├──────────────────────────────┼───────────┼─────────────┼─────────────────────┤
│ src/auth/permissions.ts      │ 3 calls   │ 0 calls     │ 1 return            │
│ src/models/inventory.ts      │ 2 calls   │ 1 call      │ 0 returns           │
└──────────────────────────────┴───────────┴─────────────┴─────────────────────┘
```

### Step 2: Inspect Specific Target File

```bash
npm run auditor:o1 inspect -- --file src/auth/permissions.ts
```

Emits line-anchored code snippets and recommended Set hoist declarations.

### Step 3: Apply Declarative Plan via Worktree

```bash
npm run auditor:o1 apply -- --plan scratch/o1_plan.json --worktree
```

The engine builds the code, verifies types, runs unit tests in the worktree sandbox, and safely integrates the changes.
