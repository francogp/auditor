# Valibot Schema Cookbook & Advanced Patterns

This reference provides production-ready recipes for recursive structures, asynchronous validations, JSON Schema exports, and domain workflows.

---

## 1. Recursive & Self-Referential Schemas

For nested trees (e.g. ASTs, file trees, navigation menus):

```typescript
import * as v from 'valibot';

export type TreeNode = {
  value: string;
  children: TreeNode[];
};

export const TreeNodeSchema: v.GenericSchema<TreeNode> = v.object({
  value: v.string(),
  children: v.lazy(() => v.array(TreeNodeSchema)),
});
```

---

## 2. Asynchronous Validation

Use async pipeline variants (`v.pipeAsync`, `v.checkAsync`, `v.parseAsync`) when performing external database checks or remote API queries:

```typescript
import * as v from 'valibot';

const checkUsernameAvailable = async (username: string): Promise<boolean> => {
  // Query database or auth service
  return true;
};

export const UsernameSchema = v.pipeAsync(
  v.string(),
  v.minLength(3),
  v.checkAsync(checkUsernameAvailable, 'Username is already taken')
);

// Execution requires parseAsync:
const username = await v.parseAsync(UsernameSchema, 'franco');
```

---

## 3. JSON Schema Conversion

Export Valibot schemas to standard JSON Schema (OpenAPI, form generators) using `@valibot/to-json-schema`:

```typescript
import * as v from 'valibot';
import { toJsonSchema } from '@valibot/to-json-schema';

const EmailSchema = v.pipe(v.string(), v.email());
const jsonSchema = toJsonSchema(EmailSchema);
// Output: { type: 'string', format: 'email' }
```

---

## 4. Production Application Recipes

### Environment Variables Schema

```typescript
import * as v from 'valibot';

export const EnvSchema = v.object({
  NODE_ENV: v.picklist(['development', 'production', 'test']),
  PORT: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)),
  DATABASE_URL: v.pipe(v.string(), v.url()),
  API_KEY: v.pipe(v.string(), v.minLength(32)),
});

export const env = v.parse(EnvSchema, process.env);
```

### Discriminated API Response

```typescript
import * as v from 'valibot';

export const ApiResponseSchema = v.variant('status', [
  v.object({
    status: v.literal('success'),
    data: v.unknown(),
  }),
  v.object({
    status: v.literal('error'),
    error: v.object({
      code: v.string(),
      message: v.string(),
    }),
  }),
]);
```

### Date Validation & Coercion

```typescript
import * as v from 'valibot';

// ISO string to Date object
export const DateFromStringSchema = v.pipe(
  v.string(),
  v.isoDate(),
  v.transform((input) => new Date(input))
);

// Date boundary check
export const FutureDateSchema = v.pipe(
  v.date(),
  v.minValue(new Date(), 'Date must be in the future')
);
```
