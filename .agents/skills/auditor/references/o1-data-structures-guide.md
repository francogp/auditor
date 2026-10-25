# O(1) Data Structures & Linear Search Refactoring Guide (`auditor-o1`)

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
