# Zero-Ignore Type Remediation Manual

This guide is the canonical engineering handbook for resolving static analysis violations in `@francogp/auditor` without using escape hatches or ignore directives (`// domain-ok:`, `// string-ok:`, `// runtime-set:`, `// open-record:`, `// catch-ok:`).

Every AI agent and human programmer MUST consult this table whenever an audit error is reported. **DO NOT GUESS OR INVENT DIRECTIVES.** Use the designated canonical data type.

---

## 1. Static Rule to Canonical Type Mapping

| Rule ID                                                 | Reported Problem                             | Prohibited Action                           | Canonical Solution & Type to Use                                                                                                                 |
| :------------------------------------------------------ | :------------------------------------------- | :------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| **`@francogp/domain-type/no-naked-string-union`**       | Raw `string` used in domain union/contract   | Adding `// domain-ok:` or `// string-ok:`   | Use `DisplayText` for UI text, `LocalizedText` for translations, `HexColor` for `#hex`, `AssetUri` for paths/URLs, or `IsoDateString` for dates. |
| **`@francogp/domain-type/no-record-string-key`**        | `Record<string, T>` open key dictionary      | Adding `// open-record:`                    | Use `Record<DomainId, T>`, `Partial<Record<BrandedId, T>>`, or `JsonObject` for external JSON.                                                   |
| **`@francogp/domain-type/no-unbranded-id`**             | Property `*Id` typed as raw `string`         | Adding `// infra-id-ok:` or `// uuid-ok:`   | Use `UserUuid` for UUIDs, `DomElementId` for DOM/locator IDs, or a custom Branded ID `type ItemId = Brand<string, 'ItemId'>`.                    |
| **`@francogp/domain-type/no-untyped-string-set-map`**   | `new Set(['a', 'b'])` without domain generic | Adding `// runtime-set:` or `// no-domain:` | Specify the generic domain type: `new Set<DomainId>(['a', 'b'])` or `new Map<DomainId, V>()` (or `createDomainSet`).                             |
| **`@francogp/domain-type/no-broad-string-array`**       | String literal array without `as const`      | Adding `// no-domain:`                      | Add `as const` (`['a', 'b'] as const`) or use empty array initializer `const list: DisplayText[] = []` for runtime accumulators.                 |
| **`no-empty` / `@francogp/domain-type/strict-catch-narrowing`** | Empty or untyped `catch {}` block    | Adding `// catch-ok:`                       | Check existence with `fs.existsSync(path)` or `fs.rmSync(p, { force: true })`, or use `tryOrNull` / `tryCatchSync`.                              |
| **`audit-config-ratchet-relaxation`**                   | Unauthorized config relaxation               | Modifying local ratchet productionRef       | Obtain explicit human approval or revert the relaxed configuration.                                                                              |

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
