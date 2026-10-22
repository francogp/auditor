# Zero-Ignore Type Remediation Manual

This guide is the canonical engineering handbook for resolving static analysis violations in `@francogp/auditor` without using escape hatches or ignore directives (`// domain-ok:`, `// string-ok:`, `// runtime-set:`, `// open-record:`, `// catch-ok:`).

Every AI agent and human programmer MUST consult this table whenever an audit error is reported. **DO NOT GUESS OR INVENT DIRECTIVES.** Use the designated canonical data type.

---

## 1. Static Rule to Canonical Type Mapping

| Rule ID | Reported Problem | Prohibited Action | Canonical Solution & Type to Use |
| :--- | :--- | :--- | :--- |
| **`domain-naked-string-primitive`** | Raw `string` used in type/interface contract | Adding `// domain-ok:` or `// string-ok:` | Use `DisplayText` for UI text, `LocalizedText` for translations, `HexColor` for `#hex`, `AssetUri` for paths/URLs, or `IsoDateString` for dates. |
| **`domain-no-open-string-record`** | `Record<string, T>` open key dictionary | Adding `// open-record:` | Use `Record<DomainId, T>`, `Partial<Record<BrandedId, T>>`, or `JsonObject` for external JSON. |
| **`domain-no-raw-string-id-property`** | Property `*Id` typed as raw `string` | Adding `// infra-id-ok:` or `// uuid-ok:` | Use `UserUuid` for UUIDs, `DomElementId` for DOM/locator IDs, or a custom Branded ID `type ItemId = Brand<string, 'ItemId'>`. |
| **`domain-untyped-collection`** | `new Set(['a', 'b'])` without domain generic | Adding `// runtime-set:` or `// no-domain:` | Specify the generic domain type: `new Set<DomainId>(['a', 'b'])` or `new Map<DomainId, V>()`. |
| **`domain-array-missing-as-const`** | String literal array without `as const` | Adding `// no-domain:` | Add `as const` (`['a', 'b'] as const`) or use empty array initializer `const list: DisplayText[] = []` for runtime accumulators. |
| **`no-empty-catch`** | Empty `catch {}` block | Adding `// catch-ok:` | Check existence with `fs.existsSync(path)` or `fs.rmSync(p, { force: true })`, or return `OperationResult<T>`. |
| **`audit-config-ratchet-relaxation`** | Unauthorized config relaxation | Modifying local ratchet productionRef | Confirm code `RELAX-<8hex>` in Antigravity chat or revert the relaxed configuration. |

---

## 2. Copy-Pasteable Import Block

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
  OperationResult,
  Brand
} from '@francogp/auditor';
```
