---
name: valibot
description: Schema validation with Valibot, the modular and type-safe schema library. Use when the user needs to validate data, create schemas, parse inputs, or work with Valibot in their project. Also use when migrating from Zod to Valibot.
license: MIT
metadata:
  author: open-circle
  version: "1.0"
---

# Valibot

This skill provides essential guidelines and patterns for [Valibot](https://valibot.dev), the modular, type-safe schema library for validating structural data.

## Modular Reference Guides

- [Zod to Valibot Migration Guide](./references/zod-to-valibot.md): Full side-by-side comparison, API differences, and migration patterns.
- [Valibot Schema Cookbook](./references/schema-cookbook.md): Advanced recipes for recursive trees, async validation, JSON Schema, and environment configs.

---

## 1. Critical Distinction: Valibot vs Zod

**Valibot and Zod have different APIs. Never mix them up!**
Valibot uses functional pipelines (`v.pipe(...)`), NOT method chaining (`.min().email()`).

```typescript
// ❌ WRONG - Zod syntax does not work in Valibot!
const Schema = v.string().email().min(5);

// ✅ CORRECT - Valibot uses functions and pipelines
const Schema = v.pipe(v.string(), v.email(), v.minLength(5));
const result = v.parse(Schema, data);
```

For detailed side-by-side comparison tables and common mistakes, consult [Zod to Valibot Migration Guide](./references/zod-to-valibot.md).

---

## 2. Installation

```bash
npm install valibot
```

---

## 3. Core Mental Model

```typescript
import * as v from 'valibot';

// 1. Primitive schemas
const StringSchema = v.string();
const NumberSchema = v.number();
const BooleanSchema = v.boolean();

// 2. Wrapped schemas
const OptionalString = v.optional(v.string());
const NullableNumber = v.nullable(v.number());
const DefaultString = v.optional(v.string(), 'default_value');

// 3. Pipelines (Validations + Transformations)
const EmailSchema = v.pipe(
  v.string(),
  v.trim(),
  v.email('Invalid email address')
);
```

---

## 4. Object Schemas

```typescript
import * as v from 'valibot';

const UserSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  username: v.pipe(v.string(), v.minLength(3)),
  email: v.pipe(v.string(), v.email()),
  role: v.picklist(['admin', 'user', 'guest']),
  bio: v.optional(v.string()),
  tags: v.array(v.string()),
});

// Modifiers:
const StrictUser = v.strictObject(UserSchema.entries); // Rejects extra keys
const LooseUser = v.looseObject(UserSchema.entries);   // Keeps extra keys
```

---

## 5. Arrays, Tuples & Variants

```typescript
import * as v from 'valibot';

// Arrays
const NumberArray = v.array(v.number());
const NonEmptyTags = v.pipe(v.array(v.string()), v.nonEmpty());

// Tuples
const Coordinates = v.tuple([v.number(), v.number()]);

// Unions & Variants (Discriminated Unions)
const StatusUnion = v.union([v.literal('active'), v.literal('inactive')]);

const ActionVariant = v.variant('type', [
  v.object({ type: v.literal('insert'), payload: v.string() }),
  v.object({ type: v.literal('delete'), id: v.number() })
]);
```

---

## 6. Parsing & Error Handling

```typescript
import * as v from 'valibot';

// Synchronous parsing (throws ValibotError on failure)
try {
  const user = v.parse(UserSchema, inputData);
} catch (error) {
  if (v.isValibotError(error)) {
    console.error(v.flatten(error.issues));
  }
}

// Safe parsing (returns result object without throwing)
const result = v.safeParse(UserSchema, inputData);
if (result.success) {
  console.log(result.output);
} else {
  console.error(v.flatten(result.issues));
}
```

---

## 7. Type Inference

```typescript
import * as v from 'valibot';

const ProfileSchema = v.object({
  id: v.string(),
  age: v.pipe(v.string(), v.transform(Number)),
});

// Infer input type (before transformations: age is string)
export type ProfileInput = v.InferInput<typeof ProfileSchema>;

// Infer output type (after transformations: age is number)
export type ProfileOutput = v.InferOutput<typeof ProfileSchema>;
```

For advanced usage (recursive trees, async validation, JSON Schema exports), see [Valibot Schema Cookbook](./references/schema-cookbook.md).
