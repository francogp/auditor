# Type Assertion & Return Type Refactoring Guide (`auditor-types`)

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
