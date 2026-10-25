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
