# Fail-Loud Mandate & PostgreSQL Engine Guardrails

A silent database migration error is an architectural catastrophe. When a migration encounters a missing column, a permission mismatch, or invalid syntax, swallowing the error allows corrupted or half-migrated states to reach production.

This guide outlines the mandatory rules for loud, fast failures and specific PostgreSQL engine traps extracted from enterprise DOX governance (`AGENTS.md`).

---

## 1. Zero Error Suppression Mandate (Fail Loudly & Fast)

Migrations MUST NEVER swallow, catch, ignore, or silence database errors using empty exception blocks:

```sql
-- ❌ STRICTLY FORBIDDEN: Silent Error Swallowing
DO $$
BEGIN
  ALTER TABLE public.invoices ADD COLUMN category_id UUID;
EXCEPTION
  WHEN duplicate_column THEN NULL; -- Swallows error silently!
  WHEN OTHERS THEN NULL;           -- Masks fatal syntax/permission issues!
END $$;
```

```sql
-- ✅ CANONICAL: Fail Fast & Loudly
-- Use explicit declarative SQL guardrails, NOT silent exception catchers:
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS category_id UUID;
```

### Why Silent Catching is Catastrophic

1. In PostgreSQL, catching exceptions inside a PL/pgSQL block rolls back the current subtransaction savepoint internally, masking permissions errors, invalid default values, and column type conflicts.
2. The migration runner records the migration as successfully applied in `_migrations`, even though the schema mutation failed to occur. Subsequent code assuming the column exists will crash at runtime.

---

## 2. CLI Execution Mandate: `ON_ERROR_STOP=1`

By default, the `psql` command-line utility prints an error to `stderr` but **continues executing subsequent SQL commands** in the file and exits with code 0!

To prevent this dangerous behavior, all migration runners, shell scripts, and CI commands MUST pass `-v ON_ERROR_STOP=1`:

```bash
# ✅ Halts execution immediately on the first error and returns exit code 1:
psql -v ON_ERROR_STOP=1 -U postgres -d mydb -f migration.sql
```

Inside TypeScript sub-process runners:

```typescript
const args = ['exec', '-T', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'];
```

---

## 3. PostgreSQL Engine Guardrails & Syntax Traps

### 1. Function Return-Type Mutation (`cannot change return type of existing function`)

In PostgreSQL, `CREATE OR REPLACE FUNCTION` is strictly forbidden from changing the return type (`RETURNS ...`) of an existing function signature:

```text
ERROR: cannot change return type of existing function
DETAIL: Cannot change return type of existing function from integer to bigint.
```

**Mandatory Rule:**
Any migration altering the return type or column structure of a `RETURNS TABLE(...)` function MUST explicitly execute a `DROP FUNCTION IF EXISTS` with its full argument signature **before** the new `CREATE FUNCTION` statement:

```sql
-- 1. Explicit DROP first:
DROP FUNCTION IF EXISTS public.calculate_invoice_totals(UUID, NUMERIC);

-- 2. CREATE with updated return type:
CREATE FUNCTION public.calculate_invoice_totals(
  p_invoice_id UUID,
  p_tax_rate NUMERIC
) RETURNS JSONB AS $$
BEGIN
  -- implementation
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### 2. Syntax Guardrail: `REVOKE ... FROM` (Never `TO`)

In SQL, privileges are granted `TO` a role, but revoked `FROM` a role:

- ❌ `REVOKE ALL ON FUNCTION ... TO anon;` (Syntax error)
- ✅ `REVOKE ALL ON FUNCTION ... FROM anon;`

---

### 3. Parser Keyword Desugaring (`TRIM`, `NULLIF`, `COALESCE`)

In PostgreSQL, `COALESCE`, `NULLIF`, `TRIM`, `GREATEST`, and `LEAST` are core SQL grammar syntax constructs desugared at parse time (e.g., `TRIM` desugars into `btrim()`), **NOT catalog functions under `pg_catalog`**.

Even inside hermetic `SECURITY DEFINER` functions with `SET search_path = ''`:

- ❌ `SELECT pg_catalog.nullif(val, '')` -> Runtime failure: `function pg_catalog.nullif(...) does not exist`.
- ❌ `SELECT pg_catalog.trim(val)` -> Runtime failure: `function pg_catalog.trim(...) does not exist`.
- ✅ `SELECT NULLIF(val, '')`
- ✅ `SELECT TRIM(val)`

---

### 4. Hermetic Search Path on `SECURITY DEFINER`

Every `SECURITY DEFINER` function MUST declare `SET search_path = ''` (or fully-qualified schemas) to prevent search-path injection vulnerabilities:

```sql
CREATE OR REPLACE FUNCTION public.admin_purge_audit_logs()
RETURNS VOID AS $$
BEGIN
  DELETE FROM public.system_error_logs WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
```

---

### 5. RLS InitPlan Optimization (`(SELECT auth.uid())`)

When writing Row-Level Security (RLS) policies that evaluate dynamic auth functions (such as `auth.uid()` or `public.is_admin()`), PostgreSQL re-evaluates the function for every single scanned row by default, degrading performance from $O(1)$ to $O(N)$.

Wrap the function inside a scalar subquery so PostgreSQL optimizes it as an `InitPlan` executed once per query:

```sql
-- ❌ Re-evaluated per row:
CREATE POLICY "Users read own data" ON public.orders
FOR SELECT USING (user_id = auth.uid());

-- ✅ Evaluated once as InitPlan:
CREATE POLICY "Users read own data" ON public.orders
FOR SELECT USING (user_id = (SELECT auth.uid()));
```
