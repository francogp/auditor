---
name: typescript-6-upgrade
description: >-
  Adopt TypeScript 6.0 features in a project and wire up the project config so they actually
  work. Covers the five headline 6.0 additions — #/ subpath imports, built-in Temporal types,
  Map.getOrInsert() / getOrInsertComputed(), RegExp.escape(), and improved generic inference —
  plus the tsconfig and package.json changes that enable them. Framework-agnostic (Vite, Next,
  Node, Deno, plain tsc, etc.). Use this skill whenever the user mentions upgrading to TypeScript
  6, "TS6", "TypeScript 6.0", adopting any of these specific features, or asks to modernize date
  handling, map upsert patterns, regex-from-user-input, or relative-import cleanup in a TypeScript
  project — even if they don't name the version explicitly.
---

# TypeScript 6.0 Upgrade

TypeScript 6.0 is a bridge release toward the Go-based TypeScript 7 compiler. Most of what's
new falls into two buckets: **new type definitions** for ES2025 runtime APIs (Temporal,
`Map.getOrInsert`, `RegExp.escape`) and **compiler/resolution changes** (`#/` subpath imports,
better generic inference, modern defaults). This skill helps you adopt these in real code and
set up the project config so they compile and run.

## The one thing that trips everyone up: types vs. runtime

TypeScript only ships the **types** for the new ES2025 APIs. It does not add their runtime
implementations. That means `Temporal`, `Map.getOrInsert()`, and `RegExp.escape()` will
type-check cleanly but throw `ReferenceError` / `is not a function` at runtime unless the
**engine** supports them.

So when you add these APIs to runnable code, check the runtime:

- **Node**: native support landed in **Node 26** (Temporal, the Map upsert methods, and
  `RegExp.escape` all ship via V8 14.6). On Node 24 or earlier they don't exist.
- **Browsers**: Temporal is in Chrome 121+/Firefox 139+; `RegExp.escape` in Chrome 136+/Firefox
  134+; the Map upsert methods are newer still. A bundler (Vite, etc.) passes them through to
  the browser untouched.
- **Older runtimes**: a polyfill is needed at runtime (e.g. `@js-temporal/polyfill` for Temporal).

Mention this to the user only when it's relevant — i.e. when the code you're adding will actually
be executed in an environment that might not support it. If you're just adding types or the host
is already Node 26 / a modern browser, don't belabor it. When it does matter, the honest framing
is: "this compiles, but it needs Node 26 (or a polyfill) to run."

## Workflow

1. **Find the project's tsconfig and package.json.** Read them before changing anything — you
   want to extend the existing setup, not flatten the user's choices.
2. **Bump TypeScript** to `6.0.x` in `devDependencies` if it isn't already there.
3. **Apply only the config changes the requested feature needs** (see the table below). Don't
   rewrite a working tsconfig wholesale — make the minimal change and explain it.
4. **Write the feature code** using the patterns in `references/features.md`.
5. **Verify**: run the project's type-check (`tsc --noEmit`, `vue-tsc --noEmit`, or whatever the
   project uses). If the code is meant to run, run it on a supporting runtime and confirm output.
6. **Flag the runtime requirement** if (and only if) it applies.

## Which config change each feature needs

| Feature | Config needed |
|---|---|
| `#/` subpath imports | `moduleResolution: "bundler"` or `"nodenext"` in tsconfig, **and** an `"imports"` map in package.json |
| Built-in Temporal types | `lib` includes `"ESNext"` (or `"ESNext.Temporal"`) |
| `Map.getOrInsert` / `getOrInsertComputed` | `lib` includes `"ESNext"` |
| `RegExp.escape` | `lib` includes `"ESNext"` |
| Better generic inference | none — it's a compiler upgrade, free with 6.0 |

Note on `target` vs `lib`: `target` controls the JS syntax level emitted; `lib` controls which
type definitions are available. The new APIs live in the `ESNext` lib. Set `"target": "ESNext"`
(valid) and `"lib": ["ESNext", ...]` — do **not** use `"ES2025"` as a `target`/`lib` value, as
some 6.0.x releases reject it. `ESNext` is the safe choice and pulls in the latest definitions.

## Subpath imports need two files in sync

`#/` imports resolve via the **`"imports"` field in package.json** (the Node standard) — that's
what makes them work at runtime in Node and in bundlers like Vite, no plugin required. The
tsconfig `paths` entry is what makes the **type-checker** resolve them. Both must agree.

```jsonc
// package.json — runtime resolution
{
  "imports": {
    "#utils/*": "./src/utils/*.ts",
    "#components/*": "./src/components/*.vue"
  }
}
```
```jsonc
// tsconfig.json — type-checker resolution
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "paths": {
      "#utils/*": ["./src/utils/*"],
      "#components/*": ["./src/components/*"]
    }
  }
}
```

Why prefer `#/` over the older `@/` alias: `#` is reserved by the Node spec for internal imports,
so it can never collide with an npm package name, and it works in plain Node without a bundler
plugin. The TypeScript team also discourages using `paths` to drive external tools, so `#/` is
the more future-proof pattern. If the project already uses `@/` aliases, it's fine to leave them —
introduce `#/` for new code or migrate only if the user asks.

## Detailed feature patterns

Read `references/features.md` for the before/after code for each feature, including the exact
signatures, the gotchas, and idiomatic usage. Pull it in when you're writing the actual feature
code rather than trying to recall the API shape.

## Verifying

A clean type-check is the baseline proof the types resolved. If the feature code is meant to run:

- On Node 26+, `node file.ts` runs TypeScript directly (type stripping) — handy for a quick check.
- Otherwise use the project's normal run path (dev server, build, test).

If you can't run on a supporting runtime, say so plainly rather than claiming it works — a passing
type-check is not the same as a passing run for these APIs.
