# Rapid Type Migration Templates & Snippets

This reference provides instant, copy-pasteable replacement snippets and AST migration recipes for replacing prohibited types with canonical `@francogp/auditor` data types.

---

## 1. Quick Replacement Reference Card

| When You See... | Immediately Replace With... | Canonical Import |
| :--- | :--- | :--- |
| `title: string`, `label: string`, `message: string` | `DisplayText` | `import type { DisplayText } from '@francogp/auditor';` |
| `color: string` (e.g. `'#ff0000'`) | `HexColor` | `import type { HexColor } from '@francogp/auditor';` |
| `url: string`, `src: string`, `path: string` | `AssetUri` | `import type { AssetUri } from '@francogp/auditor';` |
| `date: string`, `createdAt: string` | `IsoDateString` | `import type { IsoDateString } from '@francogp/auditor';` |
| `class: string`, `className: string` | `CssClassName` | `import type { CssClassName } from '@francogp/auditor';` |
| `id: string` (DOM or locator) | `DomElementId` | `import type { DomElementId } from '@francogp/auditor';` |
| `userId: string`, `sessionUid: string` | `UserUuid` | `import type { UserUuid } from '@francogp/auditor';` |
| `Record<string, unknown>`, `Record<string, any>` | `JsonObject` | `import type { JsonObject } from '@francogp/auditor';` |
| `Record<string, MyEntity>` | `Record<MyEntityId, MyEntity>` | Use canonical domain ID union for the key |
| `new Set(['a', 'b'])` | `new Set<DomainId>(['a', 'b'])` | Specify `<DomainId>` on `new Set` |
| `new Map([['a', 1]])` | `new Map<DomainId, number>([['a', 1]])` | Specify `<DomainId, V>` on `new Map` |
| `param: DomainType \| string` | `param: DomainType` | Require pure domain type in core; guard with `isDomainId` at boundary |
| `catch {}` (empty or commented) | `OperationResult<T>` or `fs.existsSync` | Handle explicitly or check existence before operation |

---

## 2. Copy-Pasteable Templates

### Template 1: Component Props with Strict Semantic Types

```vue
<script setup lang="ts">
import type { DisplayText, HexColor, AssetUri } from '@francogp/auditor';

interface Props {
  readonly title: DisplayText;
  readonly description?: DisplayText;
  readonly themeColor?: HexColor;
  readonly thumbnailUri?: AssetUri;
}

const props = withDefaults(defineProps<Props>(), {
  description: undefined,
  themeColor: '#38bdf8' as HexColor,
  thumbnailUri: undefined
});
</script>
```

### Template 2: Custom Branded Identifier Factory

```typescript
import type { Brand } from '@francogp/auditor';

export type TrainerId = Brand<string, 'TrainerId'>;
export type ItemId = Brand<string, 'ItemId'>;

export function requireTrainerId(raw: string): TrainerId {
  if (!raw || raw.trim().length === 0) {
    throw new Error(`[Domain] Invalid TrainerId: '${raw}'`);
  }
  return raw as TrainerId;
}
```

### Template 3: Safe Boundary Deserialization with JsonObject & Valibot

```typescript
import * as v from 'valibot';
import type { JsonObject } from '@francogp/auditor';

export function parseJsonPayload(rawJson: string): JsonObject {
  const parsed: unknown = JSON.parse(rawJson);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('[Boundary] Expected valid JSON object');
  }
  return parsed as JsonObject;
}
```

### Template 4: Loud OperationResult Container (Replaces Empty Catch Blocks)

```typescript
import type { OperationResult } from '@francogp/auditor';

export function tryReadFile(filePath: string): OperationResult<string, 'NOT_FOUND' | 'IO_ERROR'> {
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: 'NOT_FOUND', message: `File '${filePath}' does not exist.` };
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { ok: true, value: content };
  } catch (err: unknown) {
    return {
      ok: false,
      error: 'IO_ERROR',
      message: err instanceof Error ? err.message : String(err)
    };
  }
}
```
