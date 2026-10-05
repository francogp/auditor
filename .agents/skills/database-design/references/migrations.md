# Migration Principles

> Safe migration strategy for zero-downtime changes.

## Safe Migration Strategy

```text
For zero-downtime changes:
│
├── Adding column
│   └── Add as nullable → backfill → add NOT NULL
│
├── Removing column
│   └── Stop using → deploy → remove column
│
├── Adding index
│   └── CREATE INDEX (standard transaction-safe syntax; avoid CONCURRENTLY in dual-engine mode)
│
└── Renaming column
    └── Add new → migrate data → deploy → drop old
```

## Migration Philosophy

- Never make breaking changes in one step
- Test migrations on data copy first
- Never make breaking changes in one step
- Test migrations on data copy first
- **100% Forward-Only Append-Only**: Historical migrations are strictly immutable. Always roll forward via a new timestamped migration (`YYYYMMDDHHmmss_description.sql`).
- Run in transactions when possible
- Maintain strict PostgreSQL schema contracts and RLS security

## Multi-Host Supabase Architecture (Enterprise Blueprint)

### Supabase / PostgreSQL

| Feature | Application |
| :--- | :--- |
| Full ACID relational DB | Entity catalogs, system metadata, audit logs, user profiles |
| Canonical SSoT | Canonical PostgreSQL migrations (`supabase/migrations/*.sql`) |
| Row-Level Security (RLS) | High-integrity multi-tenant account and audit log isolation |
| Dynamic Host Switching | Connect to Local Docker (`localhost:8000`), LAN NAS, or Supabase Cloud |
