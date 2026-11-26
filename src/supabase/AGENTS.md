# Purpose

Unified Supabase Docker stack generator, validator, migration runner, and PostgreSQL major-version upgrade orchestrator (`@francogp/auditor/supabase`).

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Upstream-First Governance**: Official `github.com/supabase/supabase` `docker/` templates and `docker/utils/` scripts (`generate-keys.sh`, `add-new-auth-keys.sh`, `upgrade-pg*.sh`) are the primary source of truth. Never re-implement official tooling when upstream scripts apply.
- **Zero Hardcoded Project Values**: No default ports, volume names, Docker Hub repositories, `lite` image tags, or `upstreamRef` values are hardcoded here. When `supabaseDocker.enabled` is `true`, all active fields in `.auditor/audit.config.ts` are mandatory.
- **Fail-Loud Validation**: `remote` generation aborts if any local `./volumes/` bind-mount remains, if upstream Postgres major diverges from `postgres.expectedMajor`, if placeholder secrets remain, or if `docker compose config -q` fails.
- **Skill Delegation**: SQL migrations, RLS policies, Data API exposure, and PostgreSQL optimization delegate to `/supabase` and `/supabase-postgres-best-practices`.

## Key Files

- `supabaseConfigTypes.ts`: Domain contracts (`SupabaseDockerConfig`, `SupabaseValidationReport`, `SupabaseUpgradeManifest`, named option/result interfaces) and mandatory-field validator.
- `supabaseCryptoUtils.ts`: Shared `randomAlphanumeric` generator and `SCHEMA_MIGRATIONS_BOOTSTRAP_SQL` constant.
- `upstreamSync.ts`: Clean sparse clone of the official Supabase repository `docker/` at `upstreamRef` and dynamic `Dockerfile` generator.
- `composeAstEngine.ts`: YAML AST transformer (`remote` with `supabase-config-init` + Envoy + `realtime`, `localFull` isolation) and `docker compose config -q` validator.
- `liteStackGenerator.ts`: Deterministic 3-container (`db` + `rest` + `gateway`) stack generator, `nginx.conf`, credential resolver, and `supabase_migrations.schema_migrations` bootstrap SQL.
- `envOrchestrator.ts`: Master `.env` multi-server manager (`SERVER_<name>_*`), `validateEnvSecrets`, and Upstream-First key generation.
- `runtimeOrchestrator.ts`: Docker lifecycle (`build`, `publish`, `up`, `down`, `restart`, `status`) and incremental SQL migration sync via `docker exec`.
- `upgradePostgres.ts`: Upstream-First `upgrade-pg` wrapper over `utils/upgrade-pg*.sh` with `0700`/`0600` `scratch` manifest and `db-config` preservation.
- `index.ts`: Public `@francogp/auditor/supabase` barrel.

## Work Guidance

- Always validate generated Compose files with `docker compose config -q` before publishing or starting stacks.
- Delegate SQL schema, RLS, and PostgreSQL tuning tasks to `/supabase` and `/supabase-postgres-best-practices`.

## Verification

- `npm test`: Run unit and contract tests (`tests/supabase_*.test.ts`).
- `npm run auditor:lint`: Verify TypeScript types, Oxlint rules, and formatting.
