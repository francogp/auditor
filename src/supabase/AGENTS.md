# Purpose

Unified Supabase Docker stack generator, validator, migration runner, and PostgreSQL major-version upgrade orchestrator (`@francogp/auditor/supabase`).

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Upstream-First Governance**: Official `github.com/supabase/supabase` `docker/` templates and `docker/utils/` scripts (`generate-keys.sh`, `add-new-auth-keys.sh`, `upgrade-pg*.sh`) are the primary source of truth. Never re-implement official tooling when upstream scripts apply.
- **Zero Hardcoded Project Values**: No default ports, volume names, Docker Hub repositories, `lite` image tags, or `upstreamRef` values are hardcoded here. When `supabaseDocker.enabled` is `true`, all active fields in `.auditor/audit.config.ts` are mandatory.
- **Structural Schema Versioning (`SUPABASE_DOCKER_SCHEMA_VERSION`)**: Generated `docker-compose.yml` (`remote`, `localFull`, `lite`) and `Dockerfile` artifacts are stamped with `# @auditor-supabase-schema: <N>`. Whenever AST transformations, generated `Dockerfile` layouts, or `lite` schemas change structurally, bump `SUPABASE_DOCKER_SCHEMA_VERSION` in `supabaseConfigTypes.ts`; `validate_docker_config` (`phase: 'setup'`, rule `docker-supabase-schema-outdated`) blocks downstream projects holding older or unversioned artifacts on disk until regenerated via `auditor-supabase clone` / `generate`.
- **Fail-Loud Validation**: `remote` generation aborts if any local `./volumes/` bind-mount remains, if upstream Postgres major diverges from `postgres.expectedMajor`, if placeholder secrets or invalid `REALTIME_DB_ENC_KEY` byte lengths remain, or if `docker compose config -q` fails.
- **Skill Delegation**: SQL migrations, RLS policies, Data API exposure, and PostgreSQL optimization delegate to `/supabase` and `/supabase-postgres-best-practices`.

## Key Files

- `supabaseConfigTypes.ts`: Domain contracts (`SupabaseDockerConfig` incl. `postgres.adminRole` & `extensions.migrationExcludePatterns`, `SUPABASE_DOCKER_SCHEMA_VERSION`, `stampSupabaseSchemaHeader`, `parseSupabaseSchemaHeader`) and mandatory-field validator.
- `supabaseCryptoUtils.ts`: Shared `randomAlphanumeric` generator and `SCHEMA_MIGRATIONS_BOOTSTRAP_SQL` constant.
- `upstreamSync.ts`: Non-destructive sparse clone of the official Supabase repository `docker/` at `upstreamRef` inside `scratch/` via `buildUpstreamCloneGitSteps()` (using `--filter=blob:none` and quiet Git flags `-c init.defaultBranch=main` / `-c advice.detachedHead=false` for both commit SHAs and branches/tags) and `syncUpstreamDockerTree()` (preserving `volumes/db/data`, `volumes/storage`, `.env`, `init/`, and `Dockerfile` to prevent `EACCES` on `0700` container-owned volumes and local DB loss), `NON_ASSET_VOLUME_DIRS` (`db`, `storage`) exclusion, and `regenerateCustomDbDockerfile()` (invoked after clone and automatically by `auditor-supabase generate` when `docker-compose.yml` already exists) to emit `# @auditor-supabase-schema: <N>` `Dockerfile`s.
- `composeAstEngine.ts`: YAML AST transformer (`remote` with `projectSlug`-prefixed `container_name`, `supabase-config-init`, Envoy `/etc/envoy/` copy-and-exec, `localFull` isolation with relative `./...` bind-mount rebasing to `../../docker/...`, recursive `YAMLMap` overlay deep-merge, YAML AST `extractComposeEnvPlaceholders` with `requiredOnly` & `$${VAR}` literal skipping, schema header stamping) and `docker compose config -q` validator.
- `liteStackGenerator.ts`: Deterministic 3-container (`db` + `rest` + `gateway`) stack generator stamped with `# @auditor-supabase-schema: <N>`, configurable `nginx.conf` (`client_max_body_size 100m`, `/` + `/rest/v1/` proxy), `dbEnv`/`restEnv`/`customComposeOverlay` overrides, reusable/external volume support, `resolveLiteRuntimeEnv` JWT helper, and `supabase_migrations.schema_migrations` bootstrap SQL.
- `envOrchestrator.ts`: Master `.env` multi-server manager (`SERVER_<name>_*`), `isManagedCloudServer`, `ensureServerKeys` + `isValidHs256Jwt` + 16-byte `REALTIME_DB_ENC_KEY` generation/validation/auto-healing, `TENANT_ID` propagation, `local.env` alias emission, and `validateEnvSecrets`.
- `runtimeOrchestrator.ts`: Docker lifecycle (`build`, `publish`, `up` with two-stage `lite` `db` -> `bootstrapSql`/migrations -> full stack ordering, `down`, `restart`, `status` with `--env-file`) and incremental SQL migration sync (`-v ON_ERROR_STOP=1`, combined single-transaction `BEGIN...ROLLBACK` pre-flight dry-run or per-file before apply when mixed with non-transactional DDL, `supabase_admin` default with `postgres` fallback persistence or explicit `adminRole`, `DEFAULT_MIGRATION_EXCLUDE_PATTERNS = ['*.sqlite.sql']` via native `path.matchesGlob`, optional `postMigrateSql`).
- `upgradePostgres.ts`: Upstream-First `upgrade-pg` wrapper over `utils/upgrade-pg*.sh` with `0700`/`0600` `scratch` manifest and `db-config` preservation.
- `index.ts`: Public `@francogp/auditor/supabase` barrel (re-exporting `applyBootstrapSql`, schema version helpers, and runtime option types).

## Work Guidance

- Always validate generated Compose files with `docker compose config -q` before publishing or starting stacks.
- Bump `SUPABASE_DOCKER_SCHEMA_VERSION` in `supabaseConfigTypes.ts` whenever structural Compose/Dockerfile generation changes ship.
- Delegate SQL schema, RLS, and PostgreSQL tuning tasks to `/supabase` and `/supabase-postgres-best-practices`.

## Verification

- `npm test`: Run unit and contract tests (`tests/supabase_*.test.ts`).
- `npm run auditor:lint`: Verify TypeScript types, Oxlint rules, and formatting.

## Child DOX Index

- _No child subdirectories._
