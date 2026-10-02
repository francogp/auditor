# Zod to Valibot Migration & Feature Parity Guide

This reference provides a side-by-side comparison between Zod and Valibot APIs, common migration pitfalls, and translation recipes.

---

## 1. Key API Differences

Valibot and Zod have fundamentally different design philosophies:
- **Zod**: Monolithic, method-chained (`schema.min().max().optional()`), larger bundle size (~14 KB min+gzip).
- **Valibot**: Modular, function-composition pipeline (`v.pipe(v.string(), v.minLength(5))`), tree-shakeable (< 1 KB per schema).

| Feature | Zod ❌ | Valibot ✅ |
|---|---|---|
| **Import** | `import { z } from 'zod'` | `import * as v from 'valibot'` |
| **Validations** | Chained methods: `.email().min(5)` | Pipeline: `v.pipe(v.string(), v.email(), v.minLength(5))` |
| **Parsing** | `schema.parse(data)` | `v.parse(schema, data)` |
| **Safe parsing** | `schema.safeParse(data)` | `v.safeParse(schema, data)` |
| **Optional** | `z.string().optional()` | `v.optional(v.string())` |
| **Nullable** | `z.string().nullable()` | `v.nullable(v.string())` |
| **Default** | `z.string().default('x')` | `v.optional(v.string(), 'x')` |
| **Transform** | `z.string().transform(fn)` | `v.pipe(v.string(), v.transform(fn))` |
| **Refine/Check** | `z.string().refine(fn)` | `v.pipe(v.string(), v.check(fn))` |
| **Enum** | `z.enum(['a', 'b'])` | `v.picklist(['a', 'b'])` |
| **Native enum** | `z.nativeEnum(MyEnum)` | `v.enum(MyEnum)` |
| **Union** | `z.union([a, b])` | `v.union([a, b])` |
| **Discriminated union** | `z.discriminatedUnion('type', [...])` | `v.variant('type', [...])` |
| **Intersection** | `z.intersection(a, b)` | `v.intersect([a, b])` |
| **Min/max length** | `.min(5).max(10)` | `v.minLength(5), v.maxLength(10)` |
| **Min/max value** | `.gte(5).lte(10)` | `v.minValue(5), v.maxValue(10)` |
| **Infer type** | `z.infer<typeof Schema>` | `v.InferOutput<typeof Schema>` |
| **Infer input** | `z.input<typeof Schema>` | `v.InferInput<typeof Schema>` |

---

## 2. Common Mistakes to Avoid

### 1. Method Chaining vs Functional Pipelines

```typescript
// ❌ WRONG - Zod syntax does not work in Valibot!
const Schema = v.string().email().min(5);
const result = Schema.parse(data);

// ✅ CORRECT - Valibot uses functions and pipelines
const Schema = v.pipe(v.string(), v.email(), v.minLength(5));
const result = v.parse(Schema, data);
```

### 2. Optional Properties

```typescript
// ❌ WRONG - Zod-style optional method
const Schema = v.object({
  name: v.string().optional(),
});

// ✅ CORRECT - Valibot wraps with optional()
const Schema = v.object({
  name: v.optional(v.string()),
});
```

### 3. Default Values

```typescript
// ❌ WRONG - Zod-style default method
const Schema = v.string().default("hello");

// ✅ CORRECT - Valibot uses second argument of optional()
const Schema = v.optional(v.string(), "hello");
```

---

## 3. Step-by-Step Migration Pattern

1. **Replace imports**:
   ```typescript
   // Before
   import { z } from 'zod';
   // After
   import * as v from 'valibot';
   ```

2. **Rewrite primitives & validations to `v.pipe`**:
   ```typescript
   // Before
   const Email = z.string().email().min(5);
   // After
   const Email = v.pipe(v.string(), v.email(), v.minLength(5));
   ```

3. **Convert parsing calls**:
   ```typescript
   // Before
   const data = schema.parse(rawInput);
   // After
   const data = v.parse(schema, rawInput);
   ```
