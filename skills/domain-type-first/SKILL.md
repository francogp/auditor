---
name: domain-type-first
description: MANDATORY governance for defining, typing, declaring, modifying, refactoring, or reviewing ANY TypeScript data type, variable, constant, function parameter, return type, component prop, interface field, DTO, schema, store state, or finite domain. This skill MUST trigger whenever the user or task mentions defining or declaring types, variables, parameters, arguments, props, fields, constants, enums, unions, branded types, or schemas, in both Spanish and English (e.g., "tipo de dato", "tipar", "variable", "variables", "parametro", "parámetros", "prop", "props", "campo", "campos", "firma", "constante", "declarar", "data type", "type", "variable", "parameter", "parameters", "args", "return type", "interface", "schema", "state", "ids", "status", "category", "mode", "kind", "Record", "Set", "Map", "array of strings", generated JSON/TS databases). Enforces strict compile-time TypeScript unions derived from canonical data, eliminating naked strings, ad-hoc literal unions, loose any/unknown casts, and runtime fallbacks.
---

# Domain Type First

Use this skill before writing or editing any code that introduces, changes, or consumes a finite data domain, declares variables/parameters, or adds TypeScript types.

The goal is simple: invalid domain values should fail at compile time. If TypeScript accepts an invalid value, the domain was designed incorrectly.

## Modular Reference Guides

- [Branding & Boundary Patterns Guide](./references/branding-patterns.md): Canonical recipes for Nominal Branded Types (`Brand<T, B>`), runtime boundary validation guards, DTOs, and tuple/record templates.

## Trigger Checklist

Apply this workflow whenever the task involves any of the following:

- **Variables & Constants**: Declaring, typing, or modifying any variable (`const`, `let`, `ref()`, `reactive()`) holding domain values, statuses, identifiers, or configurations.
- **Function & Method Parameters**: Typing arguments, parameters, callbacks, composables inputs, handler signatures, or return types across `src/` and `scripts/`.
- **Component Props & State**: Declaring Vue component props, emits, Pinia store state fields, getters, or action payloads.
- **Types, Interfaces & Schemas**: Creating or updating any `type`, `interface`, DTO, Valibot schema, database model, generated wrapper, or data contract.
- **Finite Domain IDs & Values**: Finite identifiers such as entity species, moves, abilities, items, maps, trainers, factions, statuses, weather, ranks, categories, modes, slots, phases, classes, tables, or routes across `src/` and `scripts/`.
- **Collections & Dictionaries**: Constants declared as arrays, sets, maps, records, or object dictionaries in `src/` and `scripts/`.
- **Generated Data & Boundary Validation**: Generated data under `src/data/**`, generated wrappers from JSON, npm scripts under `scripts/**`, or runtime boundary validators (`isDomainId`, `requireDomainId`).
- **Audit Findings**: Review/audit findings from `npx auditor task=validate_domain_types` or `npm run audit`.

If it represents a finite domain, design and use the domain type first.

## Pre-Flight Mental Protocol (First-Time-Right Coding)

Before writing or modifying ANY TypeScript code in `src/` or `scripts/`, mentally run through the **5 Binary Decision Gates**:

| Gate | Question | Required Canonical Action |
| :--- | :--- | :--- |
| **1. Entity vs Instance** | Is this a finite catalog entity (`*Id`) or a live instance identifier (`*Uid`)? | **Catalog**: Use strict domain union (`EntityId`, `ItemId`). NEVER open `string`.<br>**Live Instance**: Use `string` (`crypto.randomUUID()`). Matches `GENUINE_UID_PATTERN`. |
| **2. Library Domain Reuse** | Does `@types/node`, `@francogp/auditor`, or `src/types/` already define this? | Import canonical contract directly (`GenderName`, `SideID`, `StatusName`). NEVER redeclare `'M' \| 'F' \| 'N'` or inline property unions. |
| **3. Boundary vs Core** | Is data entering from external I/O (API/JSON/Storage) or inside business logic? | **Boundary**: Parse with `requireDomainId(raw)` or guard with `isDomainId(raw)`. Throw loudly on invalid data.<br>**Core**: Demand pure `DomainId` parameter with call-site guarding. NEVER `DomainId \| string` or `DomainId \| undefined`. |
| **4. O(1) Access & Memory** | Am I searching, storing, or returning a collection in an execution path? | **Search**: Pre-index in $O(1)$ (`Record<DomainId, T>`, `ReadonlySet<T>`, `Map`). NEVER `.find()`, `.filter()`, `.includes()` on arrays in hot paths.<br>**Return**: Return collection directly as `readonly T[]`. NEVER `return [...arr]`. |
| **5. Object Duplication** | Do I need to duplicate an entity or state tree? | **Vue / Pinia Reactive**: Use `cloneReactive(obj)` from `@/logic/utils/cloneUtils`.<br>**Plain Object**: Use `structuredClone(obj)`.<br>NEVER `JSON.parse(JSON.stringify(obj))`. |
| **6. Entity Persistence** | Am I serializing, snapshotting, or persisting a core entity (`entity`, `entityEgg`) to DB/storage? | **Canonical Persistence**: Reuse `serializeentityTeam` / `deserializeentityTeam` from `saveSerializer.ts`. NEVER invent ad-hoc subset types (`*SnapshotEntry`, `*PartialData`) or strip properties. |

### Mental Anchors: The 10 Fatal Anti-Patterns vs Canonical Patterns

```typescript
// 1. Function parameters: Wildcards and fallbacks
❌ function useItem(id: ItemId | string, count = 1) { const target = id || 'potion'; }
✅ function useItem(id: ItemId, count = 1) { /* Pure domain contract; validated at call-site */ }

// 2. Collection getters: Heap churn via spread
❌ getParty(): entity[] { return [...this.party]; }
✅ getParty(): readonly entity[] { return this.party; }

// 3. Reinventing library types in interfaces & properties
❌ interface entityData { gender?: 'M' | 'F' | 'N' | number; }
✅ import type { GenderName } from '@types/node';
   interface entityData { gender?: GenderName | number; }

// 4. Linear search in static collections vs O(1)
❌ const move = MOVES_LIST.find(m => m.id === actionId);
✅ const move = MOVES_DATABASE[actionId];

// 5. Deep cloning reactive stores / entities
❌ const copy = JSON.parse(JSON.stringify(entity));
✅ const copy = cloneReactive(entity); // Or structuredClone(plainObj) for non-reactive

// 6. Double-casting in business logic
❌ const species = raw as unknown as EntityId;
✅ const species = requireEntityId(raw); // Loud failure at trust boundary

// 7. Secondary property / display name fallbacks
❌ const id = poke.id || poke.name || '';
✅ const id = poke.id; // Pure canonical ID; display name is resolved via helper

// 8. Dummy initializations in domain branching
❌ let winnerSide = '' as SideID;
✅ let winnerSide: SideID; // TS Definite Assignment Analysis (TS2454) ensures all branches assign it

// 9. Error causality truncation across boundaries
❌ catch (err) { throw new Error('Parse error: ' + String(err)); }
✅ catch (err) { throw new Error('Parse error', { cause: err }); }

// 10. Ad-hoc partial entity schemas / serialization
❌ interface PassiveTeamSnapshotEntry { id: string; name: string; moves: { name: string; pp: number }[]; }
✅ import { serializeentityTeam, deserializeentityTeam } from '@/logic/auth/saveSerializer';
   const snapshot = JSON.stringify(serializeentityTeam(team)); // 1:1 roundtrip fidelity
```

### Pre-Commit Mental Self-Audit (Run Before Finishing)

Before declaring any coding task complete, mentally scan your diff for these 8 flags:
1. Did I introduce any `[...spread]` return statements in getters or services?
2. Did I use `.find()`, `.filter()`, or `.includes()` on an array inside a loop, calculation, or tick?
3. Did I write `|| ''`, `?? ''`, or fallback to `.name` on any entity ID?
4. Did I type any property as an inline literal union (e.g. `'a' | 'b'`) instead of importing the domain type?
5. Did I write `as unknown as` anywhere in `src/`?
6. Did I initialize a domain variable with a dummy empty string or cast (`'' as ...`) before branching?
7. Did I throw a new error in a catch block without passing `{ cause: err }`?
8. Did I create an ad-hoc subset interface (`*SnapshotEntry`, `*PartialData`) or custom partial serializer instead of reusing canonical 1:1 entity serialization from `saveSerializer.ts`?

## Absolute Priority on O(1) Data Structures & Lookup Performance (`preferO1DataStructures`)

- **Efficiency & Lookup Speed is Priority #1**: When designing, typing, or consuming finite domain collections, constant-time $O(1)$ access structures (`Record<DomainId, T>`, `ReadonlySet<DomainId>`, `Map<DomainId, T>`) MUST ALWAYS be preferred over linear search arrays (`T[]`).
- **Prohibition on Linear Searches in Hot Paths**: It is STRICTLY FORBIDDEN to perform unindexed linear scans (`.find()`, `.filter()`, `.some()`, `.includes()`) over static entity catalogs or large collections during combat ticks, AI heuristic evaluation, map spawn rendering, or inventory item checks.
- **Typed O(1) Dictionaries**:
  - Static catalogs (items, maps, gyms, moves) MUST be pre-indexed at module load time as frozen records: `export const ITEMS_BY_ID: Record<ItemId, Item> = Object.freeze(...)`.
  - Finite identifier membership sets MUST use typed sets with `// runtime-set`: `export const SETUP_MOVES: ReadonlySet<string> = new Set<string>(SETUP_MOVES_LIST); // runtime-set`.
- **Zero-Allocation Boundary Lookups**:
  - Getters MUST accept `id: string`, validate via boundary guards (`requireItemId(id)`), and retrieve in $O(1)$ without requiring caller-side type assertions (`as unknown as`).
  - Simulation checks and item usability predicates MUST avoid deep serialization cloning (`JSON.parse(JSON.stringify(...))`), utilizing shallow structured cloning (`cloneentityForSimulation`) to eliminate Garbage Collection lag.
- **Zero-Allocation Array Return & Readonly Reference Mandate (`noRedundantSpreadReturn` / `o1-redundant-spread-return`)**:
  - Functions, getters, and domain accessors MUST return collections directly (typed as `readonly T[]`, `Readonly<Record<...>>`, or `ReadonlySet<T>`) instead of allocating redundant shallow clones via spread syntax (`return [...data];`, `() => [...data]`).
  - Spreading arrays on every return introduces needless heap memory allocation, high GC churn, and micro-stutter in battle ticks and breeding calculation hot paths.
  - If callers require an isolated mutable copy, the caller can explicitly clone via `cloneReactive()` or `structuredClone()`, but domain getters must never penalize 100% of read-only consumers with heap allocations.
  - Automatically audited with 0 errors by `validate_o1_data_structures.ts` (`o1-redundant-spread-return`).

## Absolute Prohibition on Silent Domain ID & Name Fallbacks (`noDomainIdFallbacks` / `noDomainNameFallbacks`)

- **Domain-Type-First Principle**: Identifiers for domain entities (`ItemId`, `EntityId`, `AbilityId`, `ActionId`, `TrainerClassId`, etc.) MUST NEVER have silent runtime fallback defaults (e.g. `item = rawItem || ''`, `species = poke.species ?? ''`, `id: raw.id || raw.name`, `toID(x || y)`).
- **Fail Loud & Fast Mandate**: If an ID is missing, malformed, or does not exist in the domain set, the system MUST throw an explicit, descriptive error immediately (e.g. via `requireItemId(x)`, `requireEntityId(x)`).
- **Canonical ID Mandate**: Every domain entity MUST be resolved, validated, and evaluated STRICTLY via its canonical `id`. It is forbidden to fall back to secondary fields or names (`toID(m.id || m.name)`, `p.species || p.name`, `p.id || p.name`, `move.id || move.name`).
- **UI Localization Boundary**: For presentation in UI labels/buttons, Spanish translations must be resolved via standard domain mapping helpers (e.g. `getItemName(id)`, `getAbilityName(id)`). The underlying data structures, payloads, and state properties must remain strictly typed domain IDs.
- **Audit Rules Enforcement**: Enforced automatically by `noDomainIdFallbacks` and `noDomainNameFallbacks` in `src/suites/architecture/audit_rules.ts`.

## Absolute Prohibition on Value-Hardcoding in Constant Names (`badConstantNames`)

- **Semantic Naming Mandate**: Constant names MUST describe their domain purpose or semantic role, NEVER hardcode their current numeric or string value into the identifier.
- **Forbidden Pattern**: `const ARCHAEOLOGY_CAVE_BASE_WEIGHT_10 = 10;`, `const DEFAULT_DEBUG_FRIENDSHIP_70 = 70;` (WRONG — hardcodes value in variable name).
- **Canonical Pattern**: `const ARCHAEOLOGY_CAVE_BASE_WEIGHT = 10;`, `const DEFAULT_DEBUG_FRIENDSHIP = 70;` (CORRECT — semantic & generic).
- **Audit Rule**: The rule `badConstantNames` automatically flags any `const CONST_NAME_123` containing numeric value suffixes in `src/` and `scripts/`.

## Absolute Prohibition on Literal Boolean Type Annotations (`noLiteralBooleanType`)

- **Canonical Boolean Mandate**: It is STRICTLY FORBIDDEN to use boolean literals (`true`, `false`) as type annotations when declaring variables, interface/type fields, type aliases, or function parameters (e.g. `var hola: true`, `let flag: false`, `field: true;`).
- **Forbidden Pattern**: `var hola: true`, `type Flag = false;`, `interface Event { ready: true; }` (WRONG — types as literal boolean instead of boolean type).
- **Canonical Pattern**: `var hola: boolean`, `type Flag = boolean;`, `interface Event { ready: boolean; }` (CORRECT — canonical boolean contract).

## Absolute Prohibition on Local Reinvention of Library Domain Types (`noLibraryDomainDuplicates` / `noRedundantLibraryDomainTypes`)

- **Direct Dependency Consumption**: It is STRICTLY FORBIDDEN to redeclare or invent local domain types, string literal arrays, or inline property union types (`['p1', 'p2', 'p3', 'p4']`, `'M' | 'F' | 'N'`, `'brn' | 'par' | ...`) when an identical domain type is already exported by an installed library (`SideID`, `GenderName` from `@types/node` / `@pkmn/sim`, `StatusName` from `@francogp/auditor`, etc.).
- **Comprehensive Interface & Property Scanning (`P_PROP_UNION_DECL`)**: This mandate applies universally to:
  1. Top-level type aliases: `type Foo = 'M' | 'F' | 'N';` (FORBIDDEN — use `GenderName`).
  2. Literal constant arrays: `const GENDERS = ['M', 'F', 'N'] as const;` (FORBIDDEN — use `GenderName`).
  3. Interface and object properties, including mixed primitive unions: `interface Bar { gender?: 'N' | 'M' | 'F' | number; }` (FORBIDDEN — use `gender?: GenderName | number;`).
- **Dynamic Auditor Indexing**: The domain auditor `validate_domain_types` (from `@francogp/auditor`) dynamically indexes all exported union types from `node_modules/` `.d.ts` files at runtime and enforces zero duplicate definitions across top-level types, constants, and interface properties.

## Absolute Prohibition on Redundant 1:1 Type & Value Aliases (`noRedundantAliases`)

- **Zero-Passthrough Mandate**: It is STRICTLY FORBIDDEN to create 1-to-1 type aliases (`export type Foo = Bar;`) or value aliases (`export const FOO = BAR;`) that merely rename an existing type or collection without adding structural or domain value.
- **Permanent Eradication of `// alias-ok`**: The bypass directive `// alias-ok` has been permanently deleted and eradicated from the project. There are NO exceptions or escape hatches for passthrough aliases.
- **Forbidden Pattern**: `export type ActiveentityStatus = StatusName;`, `export const GYM_DIFFICULTY_IDS = SYSTEM_DIFFICULTIES;`, `export const STAT_IDS = SYSTEM_METRIC_KEYS;` (WRONG — unnecessary indirection).
- **Canonical Pattern**: Import and consume canonical contracts (`StatusName`, `SYSTEM_DIFFICULTIES`, `SYSTEM_METRIC_KEYS`) directly at all usage sites across the repository.

## Dynamic AST Domain Collection Auditing & Zero Hardcoding (`noRedundantDomainCollections`)

- **Dynamic Harvesting**: The domain auditor `validate_domain_types` (from `@francogp/auditor`) dynamically extracts canonical exported domain collections (`as const` arrays) from `src/types/` and `src/data/` at audit time using TypeScript AST traversal.
- **Zero-Hardcoding Mandate**: Auditors must never hardcode domain names or literals (e.g. `'hp'`, `'atk'`) to detect duplication. All comparisons are performed dynamically against harvested domain sets.
- **Exact Duplicates & Redundant Subsets**: The auditor scans all array literals in `src/` and `scripts/` and reports blocking errors for:
  1. Exact duplicate collections ($A = D$) where an array literal reproduces an existing canonical domain array.
  2. Redundant subcollections ($A \subset D$ with length $\ge 3$) where an array literal defines a subset of a canonical domain instead of deriving it dynamically via `.filter()`.
- **Canonical Derivation**: Subsets of canonical domains MUST be derived dynamically from the SSoT array:
  ```ts
  // ❌ FORBIDDEN: Redundant literal subcollection
  const COMBAT_STATS = ['atk', 'def', 'spa', 'spd', 'spe'];

  // ✅ CANONICAL: Derived dynamically from SSoT
  export const COMBAT_STAT_IDS = SYSTEM_METRIC_KEYS.filter((s): s is StatIDExceptHP => s !== 'hp');
  ```


## Absolute Prohibition on Translated String Unions & Display Names in Contracts (`noTranslatedStringUnions`)

- **Canonical ID Mandate**: It is STRICTLY FORBIDDEN to create ad-hoc string literal unions or types holding translated/localized display names (e.g. `type GymReward = 'PlatinumAdmin' | ...;`, `type BallName = 'GoldMember' | ...;`).
- **Domain IDs Only**: All domain contracts, functions, parameters, store states, Valibot schemas, calculations, and persistence layers MUST strictly consume and produce canonical domain IDs (`ItemId`, `MoveId`, `EntityId`, `RouteId`). Localized texts belong exclusively in UI display helpers (`getItemById(id).name`).
- **Forbidden Pattern**: `rewardTM: 'PlatinumAdmin' | 'MT03 Pulso Agua'`, `function useItem(itemName: string)`
- **Canonical Pattern**: `rewardTM: ItemId`, `function useItem(itemId: ItemId)`

## Mandatory Technical Justification on 100% of Escape Hatches

- **Zero Naked Ignores Policy**: It is STRICTLY FORBIDDEN to use naked, generic, or unexplained escape hatch comments (e.g. `// domain-ok`, `// string-ok`, `// open-record`, `// any-ok`, `// uuid-ok`, `// infra-id-ok`).
- **Mandatory Rationale Format**: Every suppression directive across the entire codebase MUST include a colon followed by a detailed, explicit technical justification:
  - `// domain-ok: UI Spanish text localization label`
  - `// uuid-ok: Database user UUID winner identifier`
  - `// open-record: Generic key-value data dictionary container`
- **Auditor Enforcement**: The rule `unjustified-escape-hatch` in `validate_audit_headers.ts` checks 100% of files and fails if any comment omits the technical explanation.
- **Prose-Only Mandate**: The `// domain-ok: <reason>` directive is STRICTLY RESERVED for purely narrative prose (e.g. NPC dialogue lines, lore quotes, battle victory speech strings). It is STRICTLY FORBIDDEN to use it to silence type mismatches on entities, foreign keys, items, moves, or stats.

## Pure Canonical Domain Types & Absolute Ban on `DomainId | string` Wildcards

- **Zero-Wildcard Mandate**: Domain function parameters, method arguments, and interface properties representing finite domain entities MUST consume pure canonical domain types (`EntityId`, `ActionId`, `ItemId`, `AbilityId`, `RoleId`, `RouteId`, `FactionId`, `ItemCategory`, `AccountTierId`, `TagId`, etc.).
- **Un-ignorable Wildcard Prohibition**: It is STRICTLY FORBIDDEN to type domain parameters as `DomainId | string` or use wildcard unions combining finite types with `string`. The audit rules `strictDomainParamTypes` and `P_PARAM_WILDCARD_STRING_UNION` enforce this with `overrideEscapeHatch: true` — no escape hatch can bypass a wildcard union.

## Root Contract First Mandate & Prohibition on Defensive Downstream Type Interrogation

- **Root Contract First**: When domain logic needs to consume an entity from an interface (e.g., `entity.id`, `entity.ability`, `move.id`), agents **MUST NEVER** add defensive runtime interrogations (`typeof entity.id === 'string' && isEntityId(entity.id)`) inside internal business logic or calculation helpers.
- **Fix the Interface Definition at the Source**: If an interface or DTO (like `PureEntity`, `PureAction`, `PureSystemState`) contains loose primitives (`id?: string`, `ability?: string | null`, `type: string`), agents **MUST IMMEDIATELY REFACOR THE ROOT INTERFACE** to use canonical domain types (`id?: EntityId`, `ability?: AbilityId | null`, `type: StatusId | 'clear' | 'none'`).
- **Zero Defensive Clutter in Internal Logic**: With strongly-typed root contracts, internal calculation logic consumes typed properties directly. Runtime type guards (`isDomainId(raw)`) and parsing assertions (`requireDomainId(raw)`) belong **exclusively at external I/O boundaries** (user inputs, network events, local storage, DB router), NEVER in internal domain calculations.

## Absolute Prohibition on Mixed Domain Literal Unions (`noMixedDomainLiteralUnions`)

- **Zero Mixed Literal Unions**: It is STRICTLY FORBIDDEN to mix a named canonical domain type with raw string literals (e.g., `StatusId | 'clear' | 'none'`, `ItemId | 'custom_item'`, or `CategoryType | 'shadow'`).
- **Single Source of Truth**:
  1. If a literal belongs to the domain (e.g. `'clear'`, `'none'`), it **MUST BE INCLUDED** in the canonical array (`WEATHER_IDS = [...] as const`) and derived automatically.
  2. If a literal is external to the domain, it must be encapsulated into a separate named union or converted into a strongly typed sum type.

## Pure Domain Type Definitions (Zero `null` / `undefined` in Domain Unions)

- **Pure Entity Mandate**: A domain type (`AbilityId`, `ItemId`, `EntityId`, `RouteId`) represents a real, finite entity in the game catalog. It is STRICTLY FORBIDDEN to include `null` or `undefined` within a domain type union definition (e.g. `type AbilityId = ... | null;` is FORBIDDEN).
- **Location of Nullability**: `null` and `undefined` represent the *absence of a value* and belong strictly to the **state container, interface field, or property** holding the entity (e.g. `heldItem: ItemId | null`, `activeMove?: ActionId`), NEVER to the domain type itself.

## Domain Function Precondition & Call-Site Guarding Mandate

- **Strict Preconditions on Domain Logic**: Functions that execute domain calculations, battle mechanics, or entity handlers (e.g. `resolveAbilityModifier`, `resolveItemModifier`, `calculateMovePower`) MUST demand pure `DomainId` parameters. It is STRICTLY FORBIDDEN to accept `DomainId | null` or `DomainId | undefined` in domain calculation handlers.
- **Call-Site Guarding**: The caller is responsible for validating preconditions before calling domain logic:
  ```ts
  // ❌ FORBIDDEN: Domain function polluted with nullable parameter
  function resolveAbilityModifier(statKey: StatIDExceptHP, abId: AbilityId | undefined, ...): number;

  // ❌ FORBIDDEN: Defensive runtime checks on strongly-typed entities
  const abId = typeof entity.ability === 'string' && isAbilityId(entity.ability) ? entity.ability : undefined;

  // ✅ CANONICAL: Strongly-typed root interface + Pure domain parameter with call-site guarding
  function resolveAbilityModifier(statKey: StatIDExceptHP, abId: AbilityId, ...): number;

  // At call site (clean, direct precondition check):
  const abilityMult = entity.ability ? resolveAbilityModifier(statKey, entity.ability, entity, ...) : 1.0;
  ```

## Absolute Prohibition on `unknown` and `any` in Business Logic Signatures

- **No Type Erasure in Business Logic**: It is STRICTLY FORBIDDEN to type function parameters, return types, or variables as `unknown` or `any` in gameplay, calculation, battle, store, or composable code (e.g. `handleAction(difficulty: unknown = 'easy')` is FORBIDDEN).
- **Input-Only Boundary Scope for `unknown`**: The type `unknown` is strictly reserved for dedicated **boundary deserializers, type-guards, and input parsers** (e.g. `isDomainId(raw: unknown): raw is DomainId`, `parseSaveData(json: unknown)`). Business logic receiving data past the boundary MUST ALWAYS be strongly typed with domain models or DTOs.
- **Prohibition on Fake DTO Shortcuts**: It is STRICTLY FORBIDDEN to bypass boundary parsing by casting raw data to `Record<string, unknown>` or double-casting (`raw as unknown as ValidatedDTO`) to pretend data was validated. The boundary parser must validate every field and return a strict domain DTO.

## Strict Boundary DTOs vs Type-Casting Shortcuts

Business logic functions must never accept `unknown` or rely on `payload as Record<string, unknown>`. Validate raw inputs at boundaries into strict domain DTOs. See [Branding & Boundary Patterns Guide](./references/branding-patterns.md#4-strict-boundary-dtos-vs-type-casting-shortcuts) for complete DTO patterns.

## Absolute Prohibition on Double-Casting (`as unknown as DomainId`) in Production Code

- **Zero Escape Hatches on Domain Boundary**: It is STRICTLY FORBIDDEN to force dynamic strings into domain types using double-casting (`x as unknown as DomainId` or `x as any as DomainId`) inside `src/`. All data entering from dynamic sources MUST pass through canonical type guards (`isDomainId(x)`) or throwing assertion helpers (`requireDomainId(x)`). Double-casting is strictly reserved for controlled error-simulation unit tests in `tests/`.

## TypeScript Definite Assignment Analysis in Domain Branching (`no-useless-assignment`)

- **Zero Dummy Literal Initializations**: When declaring local domain variables whose values are determined across branching paths (`if/else`, `switch`), agents **MUST NEVER** initialize them with dummy empty strings, fallback literals, or type casts (e.g. `let winnerSide = '' as SideID;`, `let species: EntityId = null as any;`).
- **Compiler-Enforced Exhaustiveness (TS2454)**: Declaring `let targetId: DomainId;` without an initial dummy value leverages TypeScript's native **Definite Assignment Analysis**. If any code branch or switch statement fails to assign the variable before it is consumed, TypeScript immediately rejects the code at compile time (`TS2454: Variable is used before being assigned`).
- **ESLint v10 Alignment**: Dummy initializations trigger ESLint v10's `no-useless-assignment` because the initial value is immediately overwritten without ever being read. Uninitialized domain declarations satisfy both ESLint and TypeScript with zero runtime overhead and 100% compile-time exhaustiveness.
- **Example**:
  ```typescript
  // ❌ ANTI-PATTERN: Dummy initial value hides unhandled branches & triggers ESLint 10
  let winnerSide = '' as SideID;
  if (playerFainted) {
    winnerSide = 'p2';
  }
  // If playerFainted is false, winnerSide silently remains '' (invalid SideID)!

  // ✅ CANONICAL: Uninitialized declaration enforces exhaustive assignment at compile time
  let winnerSide: SideID;
  if (playerFainted) {
    winnerSide = 'p2';
  } else {
    winnerSide = 'p1';
  }
  // Guaranteed by TS2454 to be assigned a valid SideID in 100% of execution paths
  ```

## Canonical Error Cause Preservation (`{ cause: error }`) at Domain Boundaries

- **Preserve Error Causality Chains**: When catching exceptions across domain, network, worker, or persistence boundaries and translating them into typed domain errors (e.g. `DomainParseError`, `SerializationError`, `PersistenceError`), agents **MUST ALWAYS** pass the original caught error into the native `{ cause: error }` option of the `Error` constructor (ES2022+ / ES2025 native in Node.js >=26).
- **Absolute Prohibition on Error Truncation**: Never swallow, stringify, or discard the original error object (e.g. `catch (err) { throw new Error('Failed: ' + String(err)); }` or `catch { throw new Error('Failed'); }`). Preserving `{ cause: error }` ensures V8 and modern debugging tools retain the full original stack trace, HTTP status codes, and inner exception metadata.
- **Example**:
  ```typescript
  // ❌ ANTI-PATTERN: Stringifying or swallowing the cause breaks debugging & V8 stack traces
  try {
    return parseDomainPayload(raw);
  } catch (err) {
    throw new Error(`Domain parsing failed for payload: ${String(err)}`);
  }

  // ✅ CANONICAL: Native { cause: err } preserves complete causality and error context
  try {
    return parseDomainPayload(raw);
  } catch (err) {
    throw new Error('Domain parsing failed for payload', { cause: err });
  }
  ```

## Architectural Distinction: Catalog Domain IDs (`*Id`) vs Dynamic Instance UIDs (`*Uid`)

- **Catalog Domain IDs (`*Id`)**: Represent finite, pre-indexed entities defined in static game catalogs and canonical databases (`entityId: EntityId`, `actionId: ActionId`, `itemId: ItemId`, `routeId: RouteId`, `gymId: RoleId`). They MUST be strictly typed with their finite domain union.
- **Dynamic Instance UIDs (`*Uid` / `*UID` / `*uid`)**: Represent dynamic runtime unique identifiers or UUIDs generated via `crypto.randomUUID()` to track individual live instances (e.g. `entityUid`, `targetUid`, `eggUid`, `partyUid`, `uid`, `entity_uid`). By definition, instance UIDs are dynamic `string` values, NOT finite catalog unions.
- **Auditor Pattern (`GENUINE_UID_PATTERN`)**: The auditor automatically recognizes genuine instance UIDs matching `/^(?:uid|UID|[a-zA-Z0-9]+(?:Uid|UID|_uid|_UID)|[a-zA-Z0-9]+[uU]idOr[a-zA-Z0-9]+|[a-zA-Z0-9]+OrUid)$/` while strictly enforcing domain types on catalog IDs (preventing false positives on nouns like `australopithecuId`).

## Absolute Prohibition on Inline Type Imports in Function Parameters and Properties (`noInlineTypeImports`)

- **Clean Signature Mandate**: It is STRICTLY FORBIDDEN to use inline `import('...').Type` inside function parameter types, return types, variable types, or interface properties in `.ts` and `.vue` source files.
- **Top-Level `import type` SSoT**: All types MUST be imported explicitly in the file header using `import type { ... } from '...'` to preserve module dependency visibility and maintain clean, readable function signatures.
- **Exception**: Ambient declaration files (`.d.ts`) such as `env.d.ts` are exempt to preserve global scope declarations without creating module scope collisions.

## Absolute Prohibition on ES Module Exports inside Vue `<script setup>` (`noScriptSetupExports`)

- **Vue SFC Compiler Standard**: `<script setup>` is strictly scoped to the component template/runtime and CANNOT contain ES module exports (`export const`, `export type`, `export interface`, `export function`, `export default`).
- **Shared Contracts Extraction**: If any type, interface, or constant needs to be shared across multiple components or tests, it MUST be extracted to a companion `.ts` module (e.g. `src/components/.../*Types.ts` or `src/types/...`).
- **Local Types Unexported**: Types, interfaces, and filter tuples that are only used within that specific SFC must remain unexported (without the `export` keyword) and use the `_` prefix for local filter arrays (`const _FILTER_MODES = ['all', ...DOMAINS] as const;`).
- **Auditor Enforcement**: The auditor `validate_domain_types` (from `@francogp/auditor`) scans all `.vue` files and immediately flags any `export` inside `<script setup>` as a blocking `ERROR`.
## Nominal Branded Types for Domain IDs (`Brand<T, B>`)

- **Nominal Safety Mandate**: Finite domain identifiers (`EntityId`, `ItemId`, `ActionId`) SHOULD be defined as Nominal Branded Types using `Brand<T, B>` from `@/types/system/branding` to prevent accidental assignability across distinct domains.
- **Example**:
  ```ts
  import { type Brand, toBrand } from '@/types/system/branding';
  export type EntityId = Brand<string, 'EntityId'>;
  export const makeEntityId = (raw: string): EntityId => toBrand(requireEntityId(raw));
  ```


## Floating Promise & Architecture Rules (`noFloatingPromises`, `noLeakedGlobalState`, `noDynamicImportInHotPath`)

- **Floating Promise Guard (`noFloatingPromises`)**: Async calls MUST be handled explicitly with `await`, `void`, or `.catch()` (e.g. `void saveStateAsync();`).
- **Module Global State Guard (`noLeakedGlobalState`)**: Mutable `let`/`var` variables at top-level module scope are prohibited unless encapsulated in Pinia stores, classes, or marked `// singleton-ok`.
- **Hot-Path Import Guard (`noDynamicImportInHotPath`)**: Dynamic `import()` inside loops, Vue computed properties, or GSAP timelines is prohibited to avoid combat animation stutter.
- **Auto-Fixer Command**: Mechanical rules can be auto-repaired across the codebase by running:
  ```bash
  npm run lint:fix
  ```

## Canonical Patterns & Boundary Validation

Always use canonical domain definitions (Tuple Domain, Object-Key Domain, Generated JSON) and validate exclusively at external trust boundaries without fallback defaults.

For complete implementation blueprints, see [Branding & Boundary Patterns Guide](./references/branding-patterns.md).

## Modular Top-Level Constants vs Inline Declarations

When declaring or validating literal domain arrays, **ALWAYS** prioritize declaring top-level module constants over cluttering functions with inline `([... ] as const satisfies readonly DomainType[]).includes(...)`.

### Recommended Pattern (Clean Top-Level Constant)

```ts
// Declare at module level
const RAINY_WEATHERS: readonly StatusId[] = ['rain', 'heavy_rain', 'storm', 'thunderstorm'];

export function isRainy(weather: StatusId): boolean {
  return RAINY_WEATHERS.includes(weather);
}
```

### Forbidden Cluttered Pattern (DO NOT USE)

```ts
// Anti-pattern: Inline tuple assertion cluttering code logic
export function isRainy(weather: StatusId): boolean {
  return (['rain', 'heavy_rain', 'storm', 'thunderstorm'] as const satisfies readonly StatusId[]).includes(weather);
}
```

*Exception*: Inline `[... ] as const` is only acceptable if it is a 1-2 element tiny inline check or in isolated throwaway test files where module-level hoisting provides no readability benefit.

## Forbidden Domain Patterns

Do not use these for finite domains:

- `type X = string`
- `type X = KnownValue | string` (STRICTLY FORBIDDEN: NEVER combine a finite domain type with `| string`. Either a field belongs to a strict finite domain type, or it is truly open dynamic text. Unions like `ActionId | string` or `RoleId | string` are severe anti-patterns that erase compile-time type safety).
- `type X = KnownValue | (string & {})`
- Misusing `// domain-ok` escape hatches on lines containing wildcard uniones (e.g. `field?: DomainType | string; // domain-ok`). The `// domain-ok` annotation is ONLY permitted on fields that represent genuinely open, dynamic human or external text (such as usernames, messages, URLs, descriptions, or raw timestamps).
- `string[]`, `Array<string>`, or `ReadonlyArray<string>` for finite constants.
- `Record<string, T>` for known domain keys.
- `Record<PropertyKey, T>` for known domain keys.
- Open index signatures such as `[key: string]: T`.
- `new Set<string>(...)` to represent or validate a domain.
- `new Map<string, ...>(...)` to represent a domain map.
- Type assertions such as `as DomainId`, `as unknown as Record<...>`, `(OBJ as Record<string, T>)[key]`, `(ARRAY as readonly string[]).includes(...)`, or `as any` to force values into domain contracts or bypass index/inclusion checks during lookup.
- **Tuple Inclusion Cast Prohibition**: Casting tuple constants (e.g. `(REPLAY_SEATS as readonly string[]).includes(val)`) in business logic to bypass TypeScript's tuple inclusion check is STRICTLY FORBIDDEN. Annotate parameters with the domain union type directly (e.g. `val: ReplaySeat`) or encapsulate the check inside a dedicated `isDomainId` type guard.
- **Ad-Hoc String Literal Union Prohibition**: Defining or casting string literal unions inline (e.g. `as 'p1' | 'p2'`, `: 'p1' | 'p2'`, `as 'player' | 'enemy'`) instead of consuming canonical domain types (e.g. `SideID`) is STRICTLY FORBIDDEN. The `validate_domain_types` auditor flags all such occurrences as ERRORs. Whenever a finite domain union is needed, consume or define a named canonical domain type alias exported from `@pkmn/sim` or domain contracts.
- **Helper Cast Wrappers / Anti-Cheat Prohibition**: Creating helper functions, arrow getters, or composables (e.g. `const toEntity = (d: unknown) => d as unknown as entity // domain-ok`) solely to wrap and conceal double type assertions is STRICTLY FORBIDDEN. Refactor the underlying types using Discriminated Unions (e.g. `type Listing = { type: 'entity'; data: entity } | { type: 'item'; data: Item }`) so TypeScript infers types naturally without any casts.
- **Multi-Domain Dispatcher Cast Prohibition**: Creating centralized asset, data, or view resolvers that accept open `(category, id: string | number)` shapes without strict function overloads mapped to their domain unions (`ItemId`, `EntityId`, `RouteId`, `RoleId`).

If code seems to need an inline cast (e.g., `(DATABASE as Record<string, T>)[key]`), it means the data boundary lacks a typed accessor helper or boundary guard. Instead of casting inline:

1. Create or export a typed boundary helper/accessor (e.g., `getEntityAssetPath(entityId: string): string`).
2. Implement the index check safely inside the data module (using `in`, `isDomainId()`, or `requireDomainId()`).
3. Call the clean helper from business logic without any inline `as` type assertions.


## AST Audit Rules & Anti-Patterns Reference

### A. Prohibited Inline Literal Unions (`noInlineLiteralUnions`)
- ❌ **Anti-pattern**: `mode?: 'entity' | 'item' | 'fishing' | 'npc'` or `theme?: 'default' | 'error' | 'warning'`
- ✅ **Canonical**: Centralize in `src/types/` as an `as const` array and derive the union:
  ```typescript
  export const ROUTE_SPAWN_TABS = ['entity', 'item', 'fishing', 'npc'] as const;
  export type RouteSpawnTab = (typeof ROUTE_SPAWN_TABS)[number];
  ```

### B. Prohibited Inline Type Imports (`noInlineTypeImports`)
- ❌ **Anti-pattern**: `function format(date: import('temporal-polyfill').Temporal.ZonedDateTime)`
- ✅ **Canonical**: Explicitly import in the file header:
  ```typescript
  import type { Temporal } from 'temporal-polyfill';
  ```

### C. Prohibited Anonymous Object Types in Parameters (`noInlineAnonymousObjectType`)
- ❌ **Anti-pattern**: `send: (payload: { type: ChannelType, event: string, payload: unknown }) => void`
- ✅ **Canonical**: Declare a named interface:
  ```typescript
  export interface ChannelPayload {
    type: ChannelType;
    event: string;
    payload: unknown;
  }
  export interface Channel {
    send: (payload: ChannelPayload) => void;
  }
  ```

### D. Shared Minigame Difficulties
- All minigame systems (Pesca, Minería / Arqueología, etc.) must consume the shared `MinigameDifficulty` / `MINIGAME_DIFFICULTIES` from `@/types/battle/battle` (`'easy' | 'medium' | 'hard' | 'expert'`).

## Generated Data Workflow

When touching generated files or generated domain wrappers:

1. Find the npm script or source script that regenerates the file.
2. Patch the generator template first.
3. Patch the generated output only when needed to keep the working tree consistent.
4. Make generated outputs derive types from their generated JSON/object keys.
5. Avoid making generated wrappers open just because the raw JSON is large.

Examples:

- Asset-generated sprite databases should export template-literal path types or `keyof typeof RAW`.
- Item, move, ability, species, weather, and map databases should derive `ItemId`, `MoveId`, `AbilityId`, `EntityId`, `StatusId`, or `MapId` from canonical data.
- Validation scripts may use runtime collections internally, but generated source contracts must remain type-first.

## Audit Workflow & Command Reference

The canonical domain type auditor is `validate_domain_types` from `@francogp/auditor` (`src/suites/domain_data/validate_domain_types.ts`). It scans both `src/` and `scripts/` directories automatically.

### Running the Domain Type Auditor

```bash
# Standard in-depth audit across src/ and scripts/
npx auditor task=validate_domain_types

# Full domain data suite audit
npx auditor family=domain_data

# Inspect domain findings in Box-Drawing tables
npm run audit:findings category=validate_domain_types
```

### Full Verification Pipeline

Always verify domain types as part of the fast verification flow:

```bash
npm run lint
```

1. If generator scripts were touched or generated data was involved, inspect the relevant npm commands in `package.json` and verify the generator template emits strict types.
2. If TypeScript reports call sites passing raw strings, fix the call sites by using the domain type or an explicit boundary guard. Do not relax the domain to make the compiler quiet.

## Review Heuristics

Ask these before accepting a domain design:

- Where is the single source of truth?
- Can TypeScript reject a typo at the call site?
- Will regenerated data preserve this strict type?
- Is this truly open text, or a finite ID pretending to be text?
- Does the type allow missing/default state in exactly one canonical way?
- Is `Partial<Record<...>>` used only because coverage is intentionally partial?
- Are runtime validators failing loudly instead of normalizing or falling back?

## Output Expectations

When reporting work to the user:

- Name the canonical domain types introduced or reused.
- Mention any generator templates audited or changed.
- Report `validate_domain_types` audit results.
- If strict typing exposes `vue-tsc`/lint errors, describe them as real migration work rather than weakening the domain.
