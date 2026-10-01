# TypeScript 6.0 Feature Patterns

Before/after code for each of the five headline features. All five are TypeScript 6.0 additions.
Three of them (Temporal, Map upsert, RegExp.escape) are *type definitions* for ES2025 runtime
APIs — they need a supporting runtime to execute (see the runtime note in SKILL.md). The other
two (subpath imports, generic inference) are compiler changes that work the moment you're on 6.0.

## Table of contents
1. `#/` subpath imports
2. Built-in Temporal types
3. `Map.getOrInsert()` / `getOrInsertComputed()`
4. `RegExp.escape()`
5. Better generic inference

---

## 1. `#/` subpath imports

Node-native internal import aliases. Always resolve from the project root, so they don't break
when a file moves and don't drown in `../../../`.

Requires `moduleResolution: "bundler"` (or `"nodenext"`) in tsconfig **and** an `"imports"` map
in package.json. See SKILL.md for the paired config.

```ts
// Before — relative path that breaks on every move
import { formatDate } from '../../../utils/dates'

// After — stable from anywhere in the project
import { formatDate } from '#utils/dates'
```

Gotcha: the `"imports"` keys must start with `#`, and the targets are real file paths (include
the extension, e.g. `./src/utils/*.ts`). The tsconfig `paths` targets omit the extension.

---

## 2. Built-in Temporal types

TypeScript 6.0 ships Temporal type definitions in the `ESNext` lib — no more installing
`@js-temporal/polyfill` just to get types. Temporal replaces the `Date` object for new code:
it's immutable, timezone-aware, and uses 1-indexed months.

```ts
// Before — Date: mutable, 0-indexed months, timezone-ambiguous
const meeting = new Date(2026, 0, 1)        // 0 = January (!)
meeting.setDate(meeting.getDate() + 7)       // mutates in place

// After — Temporal: explicit, immutable, 1-indexed
const meeting = Temporal.PlainDate.from({ year: 2026, month: 1, day: 1 })
const rescheduled = meeting.add({ weeks: 1 })  // returns a new value; meeting unchanged

// Timezone-aware — Date can't really do this
const event = Temporal.ZonedDateTime.from('2026-06-15T14:00:00[America/Los_Angeles]')
const inTokyo = event.withTimeZone('Asia/Tokyo')

// Duration between dates — no millisecond math
const days = Temporal.Now.plainDateISO().until(Temporal.PlainDate.from('2026-09-01')).days
```

Pick the right type for the job: `PlainDate` (date only), `PlainTime` (time only),
`ZonedDateTime` (date + time + zone), `Instant` (exact UTC moment). Temporal does **not** replace
`Intl` — keep using `Intl.DateTimeFormat` / `.toLocaleString()` for display; Temporal just gives
it better data.

---

## 3. `Map.getOrInsert()` / `getOrInsertComputed()`

Collapses the classic has/set/get dance into one call, with the value correctly typed (no
non-null assertion).

```ts
// Before — three steps and a non-null assertion
function getOrCreate(map: Map<string, string[]>, key: string): string[] {
  if (!map.has(key)) map.set(key, [])
  return map.get(key)!   // TS doesn't know you just set it
}

// After — one call, correct type inferred
const groups = new Map<string, string[]>()
groups.getOrInsert(key, []).push(value)
```

`getOrInsertComputed` takes a factory that only runs when the key is missing — use it when the
default is expensive to build:

```ts
const cache = new Map<string, Result>()
const result = cache.getOrInsertComputed(key, () => expensiveCompute(key))
```

`WeakMap` gets the same two methods.

---

## 4. `RegExp.escape()`

Escapes a string so it's safe to drop into a `RegExp` pattern. Replaces the copy-pasted
hand-rolled escape function everyone has in their utils folder.

```ts
// Before — DIY escape, easy to get subtly wrong
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
const re = new RegExp(escapeRegex(userInput), 'gi')

// After — built-in and correct
const re = new RegExp(RegExp.escape(userInput), 'gi')
```

Why it matters: without escaping, a user searching for `1.0.0` also matches `1X0Y0` (the dots
are wildcards), and a user typing `(` throws a `SyntaxError`. Reach for this anywhere you build
a regex from user input or other untrusted strings.

---

## 5. Better generic inference

TypeScript 6.0 infers a generic type parameter from one property of an object argument and
applies it to the others — even when the properties appear in a different order. The practical
payoff is fewer manual type annotations on generic utilities.

```ts
function createPair<T>(config: { produce: () => T; consume: (val: T) => void }) {
  return config
}

// Before 6.0 — often needed the explicit <number>
const p = createPair<number>({
  produce: () => 42,
  consume: (val) => console.log(val.toFixed(2)),
})

// 6.0 — T inferred from produce, applied to consume; order-independent
const p2 = createPair({
  produce: () => 42,
  consume: (val) => console.log(val.toFixed(2)),  // val: number
})
```

This one is free with the compiler upgrade — no config, no runtime concern. It just makes
existing generic code need fewer annotations.
