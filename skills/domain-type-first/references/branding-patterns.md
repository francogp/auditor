# Domain-Type-First: Branding & Boundary Patterns Guide

This reference provides canonical patterns for defining compile-time nominal types, runtime boundary validators, and boundary DTOs without casting shortcuts.

---

## 1. Nominal Branded Types (`Brand<T, B>`)

TypeScript utilizes structural typing by default. Two distinct domain identifiers (e.g. `UserId` and `OrderId`) declared as `type UserId = string` are interchangeable, leading to silent domain bugs.

Nominal branding enforces strict type safety by attaching a phantom tag:

```typescript
declare const __brand: unique symbol;

export type Brand<T, B extends string> = T & {
  readonly [__brand]: B;
};

export function toBrand<T, B extends string>(value: T): Brand<T, B> {
  return value as Brand<T, B>;
}
```

### Canonical Domain Definition

```typescript
export type EntityId = Brand<string, 'EntityId'>;
export type ItemId = Brand<string, 'ItemId'>;

export function makeEntityId(raw: string): EntityId {
  return toBrand(requireEntityId(raw));
}
```

---

## 2. Canonical Domain Patterns

### A. Tuple-Derived Finite Domain

```typescript
export const WEATHER_IDS = ['clear', 'rain', 'storm'] as const;
export type StatusId = (typeof WEATHER_IDS)[number];
```

### B. Object-Key Finite Domain

```typescript
export const ITEM_DATA = {
  potion: { price: 300 },
  superpotion: { price: 700 },
} as const;

export type ItemId = keyof typeof ITEM_DATA;
```

### C. Coverage Maps (Partial vs Full)

```typescript
// Full coverage (every domain member MUST be present)
export const TYPE_LABELS = {
  fire: 'Fuego',
  water: 'Agua',
} satisfies Record<CategoryType, string>;

// Partial coverage (intentional subset only)
export const WEATHER_BONUSES = {
  rain: 1.2,
  storm: 1.5,
} satisfies Partial<Record<StatusId, number>>;
```

---

## 3. Boundary Validation (Fail Fast & Loud)

Runtime validation is permitted exclusively at external trust boundaries (HTTP requests, database reads, file imports). It must validate into the strict domain type without fallback defaults:

```typescript
export function isStatusId(value: string): value is StatusId {
  return WEATHER_IDS.includes(value as StatusId);
}

export function requireStatusId(value: string): StatusId {
  if (isStatusId(value)) return value;
  throw new Error(`Invalid status id received at boundary: "${value}"`);
}
```

---

## 4. Strict Boundary DTOs vs Type-Casting Shortcuts

Never use double-casting (`as unknown as DomainId`) to force unvalidated objects into domain types:

```typescript
// ❌ FORBIDDEN: Blind casting erases runtime guarantees
const user = rawData as unknown as User;

// ✅ CORRECT: Parse and construct canonical DTO at boundary
export function parseUserDto(raw: unknown): User {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid user payload');
  const record = raw as Record<string, unknown>;
  return {
    id: makeUserId(String(record.id)),
    email: requireValidEmail(String(record.email)),
  };
}
```
