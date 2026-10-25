# Domain Types & Branded ID Refactoring Guide (`auditor-domain`)

> [!IMPORTANT]
> **Distinction Between CI Quality Gate & Interactive Refactor Tool**:
>
> - **`validate_domain_types` & `validate_canonical_domains` (`npm run auditor`)**: CI static verification suites. Audits mandatory domain invariants in Phase 4 (`contracts`): duplicate string unions across files, unconfigured non-catalog collections, and domain collisions. If CI passes with 0 errors, repository domain contracts are sound.
> - **`auditor-domain` (`npm run auditor:domain`)**: Interactive domain refactoring engine (`BaseRefactorEngine`). Discovers opportunities across the entire repository to freeze mutable catalog arrays with `as const`, upgrade plain string IDs to nominal `Brand<string, 'Id'>`, and replace naked string function parameters (`heroId: string`) with domain-branded types.
> - `npm run auditor` **NEVER** runs `auditor:domain`. Finding candidates in `auditor:domain discover` does not mean CI is failing. See [quality-gates-vs-refactor-engines.md](./quality-gates-vs-refactor-engines.md).

The `auditor-domain` CLI and `DomainRefactorEngine` provide automated discovery, Dirac micro-context extraction, and deterministic plan-based remediation for naked string parameters, mutable catalog arrays/objects, and unbranded entity IDs governed by `validate_domain_types` and the `/domain-type-first` architectural mandate.

---

## 🎯 Architecture & Guiding Principles

1. **Freezing Domain Catalogs with `as const`**:
   Mutable object dictionaries and string arrays default to loose `string[]` or mutable object types, preventing TypeScript from deriving closed union types:

   ```ts
   // Anti-pattern: Mutable catalog array
   export const HERO_CLASSES = ['warrior', 'mage', 'rogue'];

   // Canonical: Frozen literal tuple
   export const HERO_CLASSES = ['warrior', 'mage', 'rogue'] as const;
   export type HeroClass = (typeof HERO_CLASSES)[number];
   ```

2. **Nominal Branding on Domain Identifiers (`Brand<string, 'T'>`)**:
   Type aliases defined as plain primitives (`export type HeroId = string;`) provide zero nominal type safety. Any string (such as an itemId or arbitrary text) can be passed accidentally to functions expecting a `HeroId`:

   ```ts
   // Anti-pattern: Loose string alias
   export type HeroId = string;

   // Canonical: Nominal Branded ID
   export type HeroId = Brand<string, 'HeroId'>;
   ```

3. **Elimination of Naked String Parameters**:
   Functions receiving parameters named `*Id`, `*Type`, `*Status`, `*Category`, `*Mode`, or `*Kind` typed as open `string` invite invalid inputs at call sites:

   ```ts
   // Anti-pattern: Open primitive parameter
   export function fetchHeroDetails(heroId: string, status: string): Promise<Hero> { ... }

   // Canonical: Domain-typed parameters
   export function fetchHeroDetails(heroId: HeroId, status: HeroStatus): Promise<Hero> { ... }
   ```

4. **Zero Escape Hatches & Canonical Semantic Types**:
   Comment escape hatches (`// domain-ok:`, `// string-ok:`) are permanently eradicated. When dealing with open strings or external protocols, use canonical semantic types exported by `@francogp/auditor`:
   - `DisplayText` for UI text / messages
   - `LocalizedText` for translations / i18n
   - `AssetUri` / `UrlString` for file paths or web endpoints
   - `HexColor` for CSS hex codes
   - `IsoDateString` for ISO date/time strings
   - `DomElementId` / `UserUuid` for IDs

5. **Canonical Domain Catalog & Union Deduplication (`validate_canonical_domains`)**:
   Repeated string unions across code files (`canonical-domain-repeated-union`) and duplicate catalog arrays (`canonical-domain-collision`, `canonical-domain-subset-mismatch`) are detected via AST.
   - Refactor repeated unions into a single SSoT type alias (e.g. `export type OrderMode = 'pickup' | 'delivery';`).
   - Derive sub-collections or partial unions using TypeScript utility types (`Extract<MasterCatalog, ...>`) instead of re-declaring string literals.

6. **Dynamic SSoT Configuration (`audit.config.ts`)**:
   Host projects can configure architectural domain exemptions without code hardcoding:

   ```ts
   // .auditor/audit.config.ts
   domain: {
     enabled: true,
     // Allowed non-domain utility signatures (e.g. directional pairs, binary flags)
     exemptSignatures: ['front|back', 'f|m'],
     // Variable names of non-catalog collections (e.g. weighted lottery pools)
     exemptCollections: ['scalePool', 'lotteryWeightDistribution']
   }
   ```

---

## 🛠️ CLI Tool Usage (`auditor-domain`)

```bash
# Direct CLI invocation (bin in node_modules/.bin)
auditor-domain <command> [options]

# Via package scripts
npm run auditor:domain <command>
npm run auditor:domain -- <command> [options]
```

### 1. `discover`: Scan Project for Domain Anti-Patterns

```bash
npm run auditor:domain discover
npm run auditor:domain discover -- --project ../pokeborrador
```

Renders a dynamic 80-column Box-Drawing table with breakdown counts for `NakedStr` (naked string parameters), `Unfrozen` (catalogs lacking `as const`), and `Unbranded` (IDs lacking `Brand`).

### 2. `inspect`: Generate Dirac Micro-Context for a Specific File

```bash
npm run auditor:domain inspect src/engine/heroCreator.ts
npm run auditor:domain inspect -- --file src/engine/heroCreator.ts --project ../codex-rpg
```

Extracts only the affected lines with precise line numbers, current violation snippets, recommended replacement code, explanation, and a ready-to-use declarative refactoring plan.

### 3. `apply`: Deterministic Plan Execution

```bash
# Direct apply onto working tree
npm run auditor:domain apply scratch/domain-plan.json

# Safe execution inside an isolated Git Worktree (verifies compilation and tests before applying)
npm run auditor:domain apply scratch/domain-plan.json --worktree
```

---

## 📋 Declarative Plan Format (`DomainRefactorPlan`)

```json
{
  "version": 1,
  "planId": "auditor-domain-plan-1792371376841",
  "targetFiles": [
    "src/data/catalogs.ts",
    "src/types/identifiers.ts"
  ],
  "constAssertions": [
    {
      "file": "src/data/catalogs.ts",
      "line": 15,
      "originalDeclaration": "export const FACTIONS = ['alliance', 'horde'];",
      "replacementDeclaration": "export const FACTIONS = ['alliance', 'horde'] as const;"
    }
  ],
  "brandWrappers": [
    {
      "file": "src/types/identifiers.ts",
      "line": 8,
      "originalTypeDef": "export type FactionId = string;",
      "replacementTypeDef": "export type FactionId = Brand<string, 'FactionId'>;"
    }
  ],
  "parameterReplacements": [
    {
      "file": "src/services/factionService.ts",
      "line": 34,
      "originalParameter": "factionId: string",
      "replacementParameter": "factionId: FactionId"
    }
  ]
}
```

---

## 4. Reaction Protocol: CI Error vs. Elective Domain Modernization

### Scenario A: CI Quality Gate Error (`validate_canonical_domains` / `validate_domain_types`)

- **Trigger**: `npm run auditor` reports `canonical-domain-repeated-union` or `domain-unfrozen-catalog`.
- **Strategic Phase**: Phase 4 (`contracts`).
- **Action**: Formulate a **Correction Plan**. If an ad-hoc union is repeated across files, extract it to a single SSoT type alias in `src/types/` or freeze the catalog array with `as const`.
- **Verification**: `npm run auditor -- suite=validate_canonical_domains` -> Green.

### Scenario B: Elective Domain Modernization (`auditor:domain`)

- **Trigger**: User requests *"brand identifiers with Brand"*, *"eliminate naked strings in functions"*, or *"modernize domain model"*.
- **Pre-flight Invariant**: Verify `npm run auditor` is 100% green before proceeding.
- **Action**: Formulate an **Improvement Plan**. Run `auditor:domain discover`, inspect candidate files via `auditor:domain inspect <file>`, generate `scratch/domain-plan.json`, and apply with `--worktree`.

---

## 5. Concrete Plan Blueprints

### Correction Plan (CI Error: `canonical-domain-repeated-union`)

````markdown
# Correction Plan: Repeated String Union in player.ts and match.ts

## 1. Diagnosis & Strategic Phase
- **Active Phase (`auditor:next`)**: `contracts` (Phase 4)
- **Suite**: `validate_canonical_domains`
- **Affected Files**:
  - `src/models/player.ts:L14` (`'active' | 'suspended' | 'banned'`)
  - `src/models/match.ts:L22` (`'active' | 'suspended' | 'banned'`)
- **Violation**: Duplicate inline literal union instead of importing a single SSoT type.

## 2. Canonical Solution
1. Define canonical type in `src/types/account.ts`:

```ts
export const ACCOUNT_STATUSES = ['active', 'suspended', 'banned'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
```

2. Import `AccountStatus` in both files, replacing the duplicate inline union.

## 3. Verification

`npm run auditor -- suite=validate_canonical_domains`
````

### Improvement Plan (Elective: `auditor:domain`)

````markdown
# Improvement Plan: Branded IDs and Domain Parameters in heroService.ts

## 1. Scope & Motivation
- **Tool**: `auditor-domain`
- **Objective**: Introduce nominal type safety for `HeroId` and prevent arbitrary strings from reaching `fetchHeroDetails`.
- **Pre-flight CI Baseline**: 100% Green (0 errors, 0 warnings).

## 2. Candidate Catalog (Dirac Micro-Context)
| File | Current Parameter | Proposed Type | Rationale |
| :--- | :--- | :--- | :--- |
| `src/services/heroService.ts:L34` | `heroId: string` | `heroId: HeroId` | Naked string parameter |
| `src/types/hero.ts:L8` | `type HeroId = string` | `Brand<string, 'HeroId'>` | Nominal branded ID |

## 3. Declarative Plan (`scratch/domain-plan.json`)

```json
{
  "version": 1,
  "planId": "domain-plan-hero-branding",
  "targetFiles": [
    "src/types/hero.ts",
    "src/services/heroService.ts"
  ],
  "brandWrappers": [
    {
      "file": "src/types/hero.ts",
      "line": 8,
      "originalTypeDef": "export type HeroId = string;",
      "replacementTypeDef": "export type HeroId = Brand<string, 'HeroId'>;"
    }
  ],
  "parameterReplacements": [
    {
      "file": "src/services/heroService.ts",
      "line": 34,
      "originalParameter": "heroId: string",
      "replacementParameter": "heroId: HeroId"
    }
  ]
}
```

## 4. Sandbox Execution

`npm run auditor:domain apply scratch/domain-plan.json --worktree`
````

---

## 6. Step-by-Step Tutorial & CLI Walkthrough

### Step 1: Discover Domain Anti-Patterns

```bash
npm run auditor:domain discover
```

Output displays:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                  auditor-domain: Domain Model Discovery Table                │
├──────────────────────────────┬───────────┬─────────────┬─────────────────────┤
│ File                         │ NakedStr  │ Unfrozen    │ Unbranded IDs       │
├──────────────────────────────┼───────────┼─────────────┼─────────────────────┤
│ src/services/heroService.ts  │ 3 params  │ 0 catalogs  │ 0 IDs               │
│ src/types/hero.ts            │ 0 params  │ 1 catalog   │ 2 IDs               │
└──────────────────────────────┴───────────┴─────────────┴─────────────────────┘
```

### Step 2: Inspect Specific Target File

```bash
npm run auditor:domain inspect src/services/heroService.ts
```

Emits targeted Dirac micro-context with exact lines, proposed replacements, and plan snippet.

### Step 3: Apply Declarative Plan via Worktree Sandbox

```bash
npm run auditor:domain apply scratch/domain-plan.json --worktree
```

The engine executes in an ephemeral worktree, verifies type safety (`tsc --noEmit`), and safely merges changes upon green verification.
