# Domain Types & Branded ID Refactoring Guide (`auditor-domain`)

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

4. **Escape Hatch Contract**:
   When raw string interoperability is required for third-party protocols or external JSON schemas, declare a statement-level escape hatch:
   `// domain-ok: <justification>` or `// domain-ignore: <justification>`.

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
