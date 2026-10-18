# Duplicate & Triplicate Code Refactoring Guide

## 1. Architectural Overview & Dedup Phase

In the canonical 7-Phase Strategic Remediation Order (`RemediationPhaseId`), clone deduplication belongs to **Phase 3 (`dedup`)**:

1. `setup` $\rightarrow$ 2. `prune` $\rightarrow$ **3. `dedup`** $\rightarrow$ 4. `contracts` $\rightarrow$ 5. `behavior` $\rightarrow$ 6. `hygiene` $\rightarrow$ 7. `polish`

### The Dead-Code Triage Rule (Prune before Dedup)

Before executing any refactoring, **always triage for dead code**:
Empirical analysis demonstrates that **~25% of clone groups reside in unreferenced files or unused exports**. Attempting to extract shared functions from dead files wastes engineering tokens and induces phantom dependencies.

- **Rule:** If a clone instance is flagged by `fallow-unused-files` or `fallow-unused-exports`, run `fallow fix --yes` (or delete the file) before refactoring the remaining active instances.

---

## 2. The Dirac Micro-Context Pattern

Reading entire source files into an LLM context window to refactor a 10-line clone is inefficient and error-prone (inducing hallucinated changes in unrelated lines).

The **Dirac Micro-Context Pattern** isolates only:

1. The exact clone lines with $N$ lines of surrounding context ($N \in [3, 5]$).
2. Existing local import declarations to detect specifier availability.
3. Symbol signature (parameters, return type, enclosing function name).

### Empirical Token Benchmark (Measured on real projects)

| Benchmark Case | Full Files Baseline | Dirac Micro-Context | Token Savings |
|---|---|---|---|
| **Case A** (Triplicate TS Utility) | 16,941 tokens | 506 tokens | **97.0%** |
| **Case B** (Quintuple Mixed TS + Vue) | 17,320 tokens | 151 tokens | **99.1%** |
| **Case C** (Intra-File Store Methods) | 33,838 tokens | 147 tokens | **99.5%** |
| **Case D** (Intra-Vue SFC Animation) | 7,548 tokens | 133 tokens | **98.2%** |
| **Total** | **75,647 tokens** | **937 tokens** | **98.7% Reduction** |

To extract micro-context for any clone group:

```bash
npm run auditor:dupes inspect <fingerprint>
# Or via CLI binary
auditor-dupes inspect <fingerprint>
```

---

## 3. The 3-Step Remediation Workflow

```mermaid
flowchart LR
    Step1["1. Inspect Clone<br/><code>auditor:dupes inspect &lt;id&gt;</code>"] --> Step2["2. Formulate Plan<br/><code>refactor_plan.json</code>"]
    Step2 --> Step3["3. Apply in Worktree<br/><code>auditor:dupes apply --worktree</code>"]
    Step3 --> Step4["4. Verify & Merge<br/><code>vp check && vp test</code>"]
```

### Step 1: Inspect Clone Group

Run `auditor:dupes inspect <fingerprint>` to obtain the structured JSON report containing:

- All file paths and exact line ranges.
- Surrounding code snippets with line numbers.
- File extensions (`.ts`, `.vue`, `.scss`).
- Suggested extraction target type (`pure-function`, `composable`, `scss-mixin`).

### Step 2: Formulate Refactor Plan

Create a `refactor_plan.json` conforming to `refactor_plan_blueprint.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "version": 1,
  "planId": "refactor-format-date",
  "fingerprint": "group-042",
  "action": "extract-shared-function",
  "sharedModulePath": "src/utils/dateFormatter.ts",
  "functionName": "formatIsoDate",
  "parameters": [
    { "name": "date", "type": "Date" }
  ],
  "returnType": "string",
  "sharedFunctionCode": "function formatIsoDate(date: Date): string {\n  return date.toISOString().split('T')[0];\n}",
  "targetFiles": [
    "src/components/UserProfile.vue",
    "src/services/billingService.ts"
  ],
  "astPattern": "$DATE.toISOString().split('T')[0]",
  "astRewrite": "formatIsoDate($DATE)"
}
```

### Step 3: Apply Transformation with Safe Worktree Isolation

Apply the plan using the hybrid transformation harness:

```bash
npm run auditor:dupes apply refactor_plan.json --worktree
```

The `--worktree` flag automatically:

1. Spawns an isolated git worktree in `.git-worktrees/refactor-sandbox`.
2. Creates an ephemeral junction to the root `node_modules` (0 disk cost).
3. Applies canonical extraction and surgical AST replacements across TS and Vue files.
4. Executes validation checks (`vp check` / `npm test`).
5. Upon 100% success, cleanly ports changes back to the working tree.
6. Automatically cleans up the worktree on failure, leaving the working tree untouched.

---

## 4. Hybrid Engine Architecture

Different source file extensions require specialized parsing engines:

| Engine | Target Extensions | Primary Responsibility | Performance |
|---|---|---|---|
| **`ts-morph`** | `.ts`, `.tsx` | TypeScript AST, automatic relative import resolution, symbol extraction | High semantic accuracy |
| **`magic-string` + `@vue/compiler-sfc`** | `.vue` | Surgical SFC `<script>` updates preserving `<template>` and `<style>` blocks intact | Zero layout thrashing, 16 ms |
| **`@ast-grep/napi`** | `.ts`, `.js`, `.scss` | High-speed structural pattern matching and replacement | Ultra-fast (21 ms) |
| **`HybridHarness`** | Unified Coordinator | Dispatches each occurrence to the optimal engine based on file extension | Deterministic execution |

---

## 5. Architectural Best Practices by Target Type

### A. Pure TypeScript Functions (`pure-function`)

- Extract into `src/utils/<domain>Utils.ts`.
- Ensure zero framework dependencies (`Vue`, `Pinia`, `React`).
- Must be stateless and deterministic.

### B. Vue Composables (`composable`)

- Extract into `src/composables/use<DomainFeature>.ts`.
- Accept maybe-reactive inputs (`MaybeRefOrGetter<T>`).
- Normalize reactively via `toValue()` inside effects (`watch` / `watchEffect`).

### C. SCSS Mixins / Variables (`scss-mixin`)

- Extract into shared styling tokens `src/styles/_mixins.scss`.
- Avoid hardcoded color or dimension duplicates; bind to design system CSS custom properties.

---

## 6. Advanced Refactoring Capabilities

### A. Parameter Permutation Mapping (`ParamPermutationMapper`)

Real-world semantic clones often exhibit identical logic with transposed or reordered parameters across files (e.g. `calculateStab(move, attacker)` vs `calculateStab(attacker, move)`).
The `ParamPermutationMapper` automatically maps each clone instance's parameter positions to the canonical extracted signature, generating per-callsite argument rewrites:

```ts
// Canonical extracted signature:
export function computeStabMultiplier(moveType: string, attacker: Attacker): number;

// Instance A rewrite (direct):
computeStabMultiplier(moveType, attacker)

// Instance B rewrite (permuted):
computeStabMultiplier(attackerMove, currentPokemon)
```

### B. The 100-Token Dirac Threshold (`MIN_DIRAC_TOKEN_THRESHOLD = 100`)

Empirical benchmarking across repositories revealed a critical threshold effect:

- Snippets **< 100 tokens**: The metadata envelope of Dirac micro-context (signatures, types, file paths, hashes) can exceed the token length of the snippet itself, resulting in **negative token savings** (e.g., a 76-token clone resulted in 118 tokens, or -55% savings).
- Snippets **$\ge$ 100 tokens**: Dirac micro-context yields positive token reductions from **80% to 99%**.
The engine strictly enforces `MIN_DIRAC_TOKEN_THRESHOLD = 100` (`isDiracCandidate`), ensuring micro-context extraction is exclusively applied where positive compression is guaranteed.

### C. Class Hierarchy Hoisting (`ClassHierarchyHoister`)

When duplicate methods exist across multiple sibling classes sharing a common base class, extracting a standalone external function breaks OOP encapsulation.
The `ClassHierarchyHoister` (`action: 'hoist-to-base-class'`):

1. Detects common inheritance ancestors (`class Fighter extends BaseCombatant`, `class Mage extends BaseCombatant`).
2. Hoists the shared method into `BaseCombatant`.
3. Removes redundant overrides in derived classes.
