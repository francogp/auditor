# Canonical Semantic Data Types Reference Manual

This manual defines the complete catalog of canonical semantic data types exported by `@francogp/auditor`.
Whenever static analysis reports an untyped string, open record, or naked primitive in TypeScript contracts, **DO NOT add `// domain-ok:` or `// string-ok:`**. Instead, import and use the canonical semantic type designed specifically for that domain intent.

```typescript
import type {
  DisplayText,
  LocalizedText,
  HexColor,
  AssetUri,
  IsoDateString,
  CssClassName,
  DomElementId,
  UserUuid,
  JsonObject,
  JsonValue,
  OperationResult,
  Brand
} from '@francogp/auditor';
```

---

## 1. Catalog of Canonical Types

| Type Name | Base Shape | Canonical Purpose & Domain Intent | Example Valid Value |
| :--- | :--- | :--- | :--- |
| **`DisplayText`** | `Brand<string, 'DisplayText'>` | Human-readable user-facing text, card titles, descriptions, narrative strings, error messages, and chat messages. | `'Pikachu salvaje ha aparecido'`, `'Ajustes de audio'` |
| **`LocalizedText`** | `Brand<string, 'LocalizedText'>` | Multi-language translation tokens, i18n keys, or dictionary strings. | `'common.save_button'`, `'battle.moves.tackle'` |
| **`HexColor`** | `Brand<string, 'HexColor'>` | Strict CSS hexadecimal color strings (3, 4, 6, or 8 hex digits). | `'#ffffff'`, `'#1e293b'`, `'#38bdf880'` |
| **`AssetUri`** | `Brand<string, 'AssetUri'>` | Relative or absolute asset paths, sprite URLs, audio URLs, or WebP endpoints. | `'/assets/sprites/pokemon/25.webp'`, `'https://example.com/icon.svg'` |
| **`IsoDateString`** | `Brand<string, 'IsoDateString'>` | ISO 8601 extended timestamp strings. | `'2026-10-21T18:30:00.000Z'` |
| **`CssClassName`** | `Brand<string, 'CssClassName'>` | CSS classes, BEM modifiers, or dynamic styling tokens passed as props. | `'btn-primary'`, `'is-active'`, `'shadow-elevation-2'` |
| **`DomElementId`** | `Brand<string, 'DomElementId'>` | HTML element IDs or testing locator IDs. | `'submit-button'`, `'modal-root'`, `'pvp-player-card'` |
| **`UserUuid`** | `Brand<string, 'UserUuid'>` | RFC 4122 UUID strings identifying user accounts or database sessions. | `'550e8400-e29b-41d4-a716-446655440000'` |
| **`JsonObject`** | `Record<string, JsonValue>` | Dynamic JSON key-value dictionary container for external API or persistence boundaries. | `{ "score": 100, "meta": { "active": true } }` |
| **`OperationResult<T, E>`** | `{ ok: true; value: T } \| { ok: false; error: E; message?: string }` | Canonical result wrapper replacing empty `catch {}` or silent fallbacks. | `{ ok: true, value: 42 }` |

---

## 2. Before vs. After Migration Recipes

### A. Component Props & Interface Labels

```typescript
// ❌ Banned Anti-Pattern (Untyped raw string or escape hatch)
interface CardProps {
  title: string; // Flagged: domain-naked-string-primitive
  badgeColor: string; // Flagged: domain-naked-string-primitive
  iconUrl: string; // Flagged: domain-naked-string-primitive
}

// ✅ Canonical Solution (Zero Ignores)
import type { DisplayText, HexColor, AssetUri } from '@francogp/auditor';

interface CardProps {
  title: DisplayText;
  badgeColor?: HexColor;
  iconUrl: AssetUri;
}
```

### B. Dynamic JSON Dictionaries & Open Records

```typescript
// ❌ Banned Anti-Pattern (Open string record)
export type RawConfig = Record<string, unknown>; // Flagged: domain-no-open-string-record

// ✅ Canonical Solution (Zero Ignores)
import type { JsonObject } from '@francogp/auditor';

export type RawConfig = JsonObject;
```

### C. Branded Identifiers & Entity Keys

```typescript
// ❌ Banned Anti-Pattern (Raw string ID)
interface BattleParticipant {
  userId: string; // Flagged: domain-no-raw-string-id-property
  buttonElementId: string; // Flagged: domain-no-raw-string-id-property
}

// ✅ Canonical Solution (Zero Ignores)
import type { UserUuid, DomElementId } from '@francogp/auditor';

interface BattleParticipant {
  userId: UserUuid;
  buttonElementId?: DomElementId;
}
```

### D. Typed Collections (`Set` & `Map`)

```typescript
// ❌ Banned Anti-Pattern (Untyped Set forcing // runtime-set:)
const ACTIVE_POKEMON = new Set(['pikachu', 'charizard']); // Flagged: domain-untyped-collection

// ✅ Canonical Solution (Explicit domain generic, zero ignores)
import type { PokemonId } from '@/types/pokemon';

const ACTIVE_POKEMON: ReadonlySet<PokemonId> = new Set<PokemonId>(['pikachu', 'charizard']);
// Passes static analysis with 0 findings and 0 comments!
```

### E. Function-Local Array Accumulators

```typescript
// ❌ Banned Anti-Pattern (Adding // no-domain: to accumulators)
const lines: string[] = []; // no-domain: Non-domain utility collection

// ✅ Canonical Solution (Zero Ignores)
// Initializing with empty array [] is recognized as a runtime accumulator
const lines: DisplayText[] = [];
```
