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
- `upstreamSync.ts`: Clean sparse clone of the official Supabase repository `docker/` at `upstreamRef` (branch, tag, or commit SHA) inside `scratch/` and dynamic `Dockerfile` generator introspecting existing `volumes/` entries.
- `composeAstEngine.ts`: YAML AST transformer (`remote` with `projectSlug`-prefixed `container_name`, `supabase-config-init`, Envoy `/etc/envoy/` copy-and-exec, `localFull` isolation, recursive `YAMLMap` overlay deep-merge) and `docker compose config -q` validator.
- `liteStackGenerator.ts`: Deterministic 3-container (`db` + `rest` + `gateway`) stack generator, configurable `nginx.conf` (`client_max_body_size 100m`, `/` + `/rest/v1/` proxy), `dbEnv`/`restEnv`/`customComposeOverlay` overrides, reusable/external volume support, `resolveLiteRuntimeEnv` JWT helper, and `supabase_migrations.schema_migrations` bootstrap SQL.
- `envOrchestrator.ts`: Master `.env` multi-server manager (`SERVER_<name>_*`), `isManagedCloudServer`, `ensureServerKeys` + `isValidHs256Jwt` auto-healing, `TENANT_ID` propagation, `local.env` alias emission, and `validateEnvSecrets`.
- `runtimeOrchestrator.ts`: Docker lifecycle (`build`, `publish`, `up` with two-stage `lite` `db` -> `bootstrapSql`/migrations -> full stack ordering, `down`, `restart`, `status` with `--env-file`) and incremental SQL migration sync (`-v ON_ERROR_STOP=1`, combined single-transaction `BEGIN...ROLLBACK` pre-flight dry-run or per-file before apply when mixed with non-transactional DDL, `supabase_admin` bootstrap with `postgres` fallback, optional `postMigrateSql`).
- `upgradePostgres.ts`: Upstream-First `upgrade-pg` wrapper over `utils/upgrade-pg*.sh` with `0700`/`0600` `scratch` manifest and `db-config` preservation.
- `index.ts`: Public `@francogp/auditor/supabase` barrel.

## Work Guidance

- Always validate generated Compose files with `docker compose config -q` before publishing or starting stacks.
- Delegate SQL schema, RLS, and PostgreSQL tuning tasks to `/supabase` and `/supabase-postgres-best-practices`.

## Verification

- `npm test`: Run unit and contract tests (`tests/supabase_*.test.ts`).
- `npm run auditor:lint`: Verify TypeScript types, Oxlint rules, and formatting.
