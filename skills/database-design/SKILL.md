---
name: database-design
description: Database design principles and decision-making. Schema design, indexing strategy, SQL migrations, Supabase architecture.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Database Design

> **Learn to THINK, not copy SQL patterns.**

## 🎯 Selective Reading Rule

**Read ONLY files relevant to the request!** Check the content map, find what you need.

| File | Description | When to Read |
| :--- | :--- | :--- |
| `references/database-selection.md` | PostgreSQL vs SQLite WASM vs Supabase | Choosing database |
| `references/schema-design.md` | Normalization, PKs, relationships | Designing schema |
| `references/indexing.md` | Index types, composite indexes | Performance tuning |
| `references/optimization.md` | N+1, EXPLAIN ANALYZE | Query optimization |
| `references/migrations.md` | Safe migrations, dual-engine sync | Schema changes |

---

## ⚠️ Core Principle

- **Ask** the user for database preferences when unclear.
- **Choose** database engine based on context.
- **Avoid** defaulting to single-engine assumptions when dual persistence is required.

---

## Decision Checklist

Before designing schema:

- [ ] Asked user about database preference?
- [ ] Chosen database for THIS context?
- [ ] Considered deployment environment?
- [ ] Planned index strategy?
- [ ] Defined relationship types?
- [ ] Verified local vs online schema parity?

---

## Supabase Schema & Migration Governance

When modifying schemas or persistence in Supabase:

- **Absolute Immutability of Historical Migrations**: Migration files in `supabase/migrations/` already committed and pushed to `main` (or run in production) are **STRICTLY IMMUTABLE**. Never modify past migrations. Any schema modification, fix, or column addition MUST ALWAYS be a NEW forward-only timestamped migration file.
- **Pure Supabase & Zero Runtime Fallbacks**: All schema updates and structural evolutions in Supabase MUST be executed strictly and exclusively via static SQL migrations. Runtime data patching, dynamic property synthesis, or schema fallbacks in application code are strictly forbidden.
- **Multi-Host Compatibility**: Ensure SQL migrations run cleanly on local Docker Supabase, LAN installations, and Supabase Cloud without environment-specific hardcoded schemas.

---

## Anti-Patterns

- **NEVER modify historical/pushed migrations** (they will never re-run on existing databases; always create a new forward-only migration).
- **Reject skipping** indexing on foreign keys and billing period queries.
- **Avoid using** `SELECT *` in production hot paths.
- **Reject storing JSON** when relational/structured data is better suited for financial audits.
- **Identify and fix** N+1 queries.
