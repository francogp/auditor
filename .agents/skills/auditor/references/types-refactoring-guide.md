# Type Assertion & Return Type Refactoring Guide (`auditor-types`)

> [!IMPORTANT]
> **Distinction Between CI Quality Gate & Interactive Refactor Tool**:
>
> - **`validate_type_check` & `validate_type_assertion_hygiene` (`npm run auditor`)**: CI static verification suites. Audits TypeScript compilation health and flags forbidden unsafe casts (`type-assertion-as-any`) in active code. If CI passes with 0 errors, there are no blocking typecheck errors.
> - **`auditor-types` (`npm run auditor:types`)**: Interactive type refactoring engine (`BaseRefactorEngine`). Discovers opportunities across the entire repository to annotate missing explicit return types on exported functions, replace forced double assertions (`as unknown as T`) with schema validation, and safely narrow loose payload casts.
> - `npm run auditor` **NEVER** runs `auditor:types`. A project with 0 errors in CI can legitimately discover candidates in `auditor:types discover`. See [quality-gates-vs-refactor-engines.md](./quality-gates-vs-refactor-engines.md).

The `auditor-types` CLI and `TypesRefactorEngine` provide automated discovery, Dirac micro-context extraction, and deterministic plan-based remediation for loose type assertions, double casts, and omitted function return contracts governed by `validate_type_assertion_hygiene` and `validate_type_check`.

---

## 🎯 Architecture & Guiding Principles

1. **Elimination of Loose `as any` Castings**:
   Casting expressions to `any` completely disables the TypeScript compiler's type checking, allowing silent runtime breakages and invalid property accesses:

   ```ts
   // Anti-pattern: Loose any assertion
   export function parsePayload(raw: unknown): Payload {
     return raw as any;
   }

   // Canonical: Use unknown or precise narrowing
   export function parsePayload(raw: unknown): Payload {
     return raw as unknown as Payload; // or domain type guard
   }
   ```

   When migrating legacy code, `auditor-types` automatically replaces loose `as any` with `as unknown` to restore compiler safety.

2. **Double Assertion Sanitization (`as unknown as T`)**:
   Double casting (`x as unknown as Target`) bypasses TypeScript's type-narrowing hierarchy. It should be refactored to explicit type guards, schemas, or direct type assertions:

   ```ts
   // Anti-pattern: Forced double assertion
   const val = input as unknown as string;

   // Canonical: Direct narrowing or explicit domain assertion
   const val = input as string; // verify narrowing with schema or type guard
   ```

3. **Explicit Module Boundary & Function Return Contracts**:
   Exported functions lacking explicit return types cause TypeScript to infer complex internal shapes, slowing down IDE language servers and leaking implementation details across module boundaries:

   ```ts
   // Anti-pattern: Exported function without return type
   export function computeInvoiceTotal(subtotal: number, taxRate: number) {
     return subtotal * (1 + taxRate);
   }

   // Canonical: Explicit return contract
   export function computeInvoiceTotal(subtotal: number, taxRate: number): number {
     return subtotal * (1 + taxRate);
   }
   ```

4. **Zero Escape Hatches & Safe Narrowing**:
   Comment escape hatches (`// type-ok:`, `// any-ok:`, `// type-ignore:`) are permanently eradicated. Instead, use canonical safe typing:
   - Use `unknown` with runtime type guards (`isRecord`, `isString`, `instanceof`) instead of `as any`.
   - Use `Record<string, unknown>` instead of untyped objects.
   - Use Valibot schema validation (`v.parse()`, `v.safeParse()`) for external payloads.
   - Use typed generics (`<T>`) for polymorphic operations.

---

## 🛠️ CLI Tool Usage (`auditor-types`)

```bash
# Direct CLI invocation (bin in node_modules/.bin)
auditor-types <command> [options]

# Via package scripts
npm run auditor:types <command>
npm run auditor:types -- <command> [options]
```

### 1. `discover`: Scan Project for Type Assertion & Return Issues

```bash
npm run auditor:types discover
npm run auditor:types discover -- --project ../pokeborrador
```

Renders a dynamic 80-column Box-Drawing table with counts for `as any`, `Casts` (double assertions), and `Returns` (missing return annotations).

### 2. `inspect`: Generate Dirac Micro-Context for a Specific File

```bash
npm run auditor:types inspect src/services/authService.ts
npm run auditor:types inspect -- --file src/services/authService.ts --project ../codex-rpg
```

Extracts only the affected lines with precise line numbers, current violation snippets, recommended replacement code, explanation, and a ready-to-use declarative refactoring plan.

### 3. `apply`: Deterministic Plan Execution

```bash
# Direct apply onto working tree
npm run auditor:types apply scratch/types-plan.json

# Safe execution inside an isolated Git Worktree (verifies compilation and tests before applying)
npm run auditor:types apply scratch/types-plan.json --worktree
```

---

## 📋 Declarative Plan Format (`TypesRefactorPlan`)

```json
{
  "version": 1,
  "planId": "auditor-types-plan-1792371365006",
  "targetFiles": [
    "src/services/authService.ts"
  ],
  "assertionReplacements": [
    {
      "file": "src/services/authService.ts",
      "line": 42,
      "originalSnippet": "data as any",
      "replacementSnippet": "data as unknown"
    }
  ],
  "returnTypeInjections": [
    {
      "file": "src/services/authService.ts",
      "line": 85,
      "originalHeader": "export function validateSession(token: string)",
      "replacementHeader": "export function validateSession(token: string): Promise<SessionState>"
    }
  ]
}
```

---

## 4. Reaction Protocol: CI Error vs. Elective Typing Modernization

### Scenario A: CI Quality Gate Error (`validate_type_check` / `validate_type_assertion_hygiene`)

- **Trigger**: `npm run auditor` reports `type-assertion-as-any` or TypeScript compiler error.
- **Strategic Phase**: Phase 4 (`contracts`).
- **Action**: Formulate a **Correction Plan**. Replace `as any` with `as unknown` or introduce a proper type guard/schema. Never use comment escape hatches (`// type-ok:`) or cast to `as unknown as any`.
- **Verification**: `npm run auditor -- suite=validate_type_check` -> Green.

### Scenario B: Elective Type Modernization (`auditor:types`)

- **Trigger**: User requests *"add return types to functions"*, *"remove as any"*, or *"reinforce TypeScript contracts"*.
- **Pre-flight Invariant**: Verify `npm run auditor` is 100% green before proceeding.
- **Action**: Formulate an **Improvement Plan**. Run `auditor:types discover`, inspect specific candidate files via `auditor:types inspect <file>`, generate `scratch/types-plan.json`, and apply with `--worktree`.

---

## 5. Concrete Plan Blueprints

### Correction Plan (CI Error: `type-assertion-as-any`)

````markdown
# Correction Plan: type-assertion-as-any in webhookHandler.ts

## 1. Diagnosis & Strategic Phase
- **Active Phase (`auditor:next`)**: `contracts` (Phase 4)
- **Suite**: `validate_type_assertion_hygiene`
- **Location**: `src/api/webhookHandler.ts:L37`
- **Violation**: Direct casting `payload as any` to access dynamic event properties.

## 2. Canonical Solution
1. Define a discriminated union type or schema validation (`WebhookPayload`).
2. Safely cast or narrow the type using `unknown`:

```ts
const body = payload as unknown as WebhookPayload; // or domain type guard check
```

## 3. Verification

`npm run auditor -- suite=validate_type_assertion_hygiene`
````

### Improvement Plan (Elective: `auditor:types`)

````markdown
# Improvement Plan: Explicit Return Types in authService.ts

## 1. Scope & Motivation
- **Tool**: `auditor-types`
- **Objective**: Add explicit return type annotations on exported functions to accelerate compiler type-checking and secure public API contracts.
- **Pre-flight CI Baseline**: 100% Green (0 errors, 0 warnings).

## 2. Candidate Catalog (Dirac Micro-Context)
| File | Line | Current Header | Proposed Return Type |
| :--- | :--- | :--- | :--- |
| `src/services/authService.ts` | L85 | `export function validateSession(token: string)` | `Promise<SessionState>` |

## 3. Declarative Plan (`scratch/types-plan.json`)

```json
{
  "version": 1,
  "planId": "types-plan-auth-returns",
  "targetFiles": ["src/services/authService.ts"],
  "returnTypeInjections": [
    {
      "file": "src/services/authService.ts",
      "line": 85,
      "originalHeader": "export function validateSession(token: string)",
      "replacementHeader": "export function validateSession(token: string): Promise<SessionState>"
    }
  ]
}
```

## 4. Sandbox Execution

`npm run auditor:types apply scratch/types-plan.json --worktree`
````

---

## 6. Step-by-Step Tutorial & CLI Walkthrough

### Step 1: Discover Type Hygiene Candidates

```bash
npm run auditor:types discover
```

Output displays:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                  auditor-types: Type Assertion Discovery Table               │
├──────────────────────────────┬───────────┬─────────────┬─────────────────────┤
│ File                         │ as any    │ Casts       │ Returns (Missing)   │
├──────────────────────────────┼───────────┼─────────────┼─────────────────────┤
│ src/services/authService.ts  │ 1 cast    │ 0 double    │ 3 functions         │
│ src/api/userController.ts    │ 0 cast    │ 2 double    │ 1 function          │
└──────────────────────────────┴───────────┴─────────────┴─────────────────────┘
```

### Step 2: Inspect Specific Target File

```bash
npm run auditor:types inspect src/services/authService.ts
```

Outputs the exact line snippets, AST context, and ready-to-run declarative JSON plan.

### Step 3: Apply Declarative Plan via Worktree Sandbox

```bash
npm run auditor:types apply scratch/types-plan.json --worktree
```

The engine executes in an ephemeral worktree, verifies type safety (`tsc --noEmit`), and safely merges changes upon green verification.
