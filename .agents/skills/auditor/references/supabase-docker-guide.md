# Unified Supabase Docker Guide (`@francogp/auditor/supabase` & `auditor-supabase`)

This guide documents the unified Supabase Docker stack generator, validator, migration runner, and PostgreSQL major-version upgrade orchestrator provided by `@francogp/auditor/supabase` and the `auditor-supabase` CLI.

---

## 1. Core Principles

- **Upstream-First Governance**: Official `github.com/supabase/supabase` `docker` templates and `utils` scripts (`docker-compose.yml`, `.env.example`, `generate-keys.sh`, `add-new-auth-keys.sh`, `upgrade-pg*.sh`) are the primary source of truth. Always prioritize official upstream scripts and adapt AST rules and consumer configs to match them.
- **Zero Hardcoded Project Values**: `@francogp/auditor/supabase` never hardcodes project ports, volume names, Docker Hub repositories, `lite` image tags, or `upstreamRef` tags. When `supabaseDocker.enabled` is `true` in `.auditor/audit.config.ts`, all active profile fields are mandatory.
- **Skill Delegation (`/supabase` & `/supabase-postgres-best-practices`)**: All SQL schema design, RLS policies, Data API exposure, and PostgreSQL query optimization tasks delegate strictly to the official `/supabase` and `/supabase-postgres-best-practices` skills. If the official `supabase` plugin is not installed in the user's environment, halt and ask the user to install it rather than improvising.

---

## 2. Configuration in `.auditor/audit.config.ts` (`supabaseDocker`)

Declare `supabaseDocker` inside `.auditor/audit.config.ts` alongside `paths.migrationsDir`:

```ts
import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'My App',
  supabaseDocker: {
    enabled: true,
    projectSlug: 'myapp',
    upstreamRef: 'self-hosted/v0.8.5',
    supabaseDir: 'supabase',
    masterEnvFile: '.env',
    postgres: {
      expectedMajor: 17,
      allowMajorUpgrade: false
    },
    extensions: {
      extraEnvVars: new Map([['CUSTOM_FLAG', '1']]),
      customComposeOverlay: 'supabase/docker-compose.override.yml'
    },
    profiles: {
      remote: {
        enabled: true,
        includeLogs: true,
        image: { user: 'myorg', repo: 'myapp-db', tag: 'latest' },
        volumes: {
          shared: 'supabase-volumes-v2',
          dbData: 'db-data-v3',
          dbConfig: 'db-config-v3',
          storage: 'storage-data'
        },
        security: { bindLoopback: true },
        postGenerateCommand: 'npm run servers:configure'
      },
      localFull: {
        enabled: true,
        includeLogs: false,
        realtimeTenantName: 'realtime-dev',
        ports: { api: 8010, postgres: 5442, pooler: 6553, studio: 3010 },
        autoApplyMigrations: true,
        postGenerateCommand: 'npm run servers:configure'
      },
      lite: new Map([
        [
          'test',
          {
            enabled: true,
            storage: 'tmpfs',
            nginx: { clientMaxBodySize: '100m', proxyRoot: true },
            images: {
              postgres: 'supabase/postgres:17.6.1.136',
              postgrest: 'postgrest/postgrest:v14.18',
              nginx: 'nginx:1.29-alpine'
            },
            ports: { postgres: 5433, gateway: 8001 },
            schemas: ['public', 'storage', 'graphql_public'],
            autoSyncMigrations: true
          }
        ]
      ])
    }
  }
});
```

### Configuration Notes & Boundaries

- **`upstreamRef` formats**: Supports branch names (`master`), official release tags, and 7–40 char commit SHAs (`clone` automatically switches to `git fetch --depth 1` + `FETCH_HEAD` for SHAs).
- **Project-specific Auth/API tuning (`extensions.extraEnvVars`)**: Pass per-project GoTrue/PostgREST tuning variables without modifying the auditor core (e.g. `new Map([['GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL', '15']])`).
- **`lite` Nginx & container overrides**: `generateLiteNginxConf` sets `client_max_body_size 100m;` and proxies both `/rest/v1/` and `/` with `Host`, `X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto` by default. Override via `nginx: { clientMaxBodySize, proxyRoot, extraDirectives }`, reuse existing volumes via `volumeName` + `externalVolume: true`, customize DB/PostgREST env via `dbEnv` / `restEnv`, and deep-merge arbitrary Compose services/keys via `customComposeOverlay`.
- **Server discovery & Cloud profiles**: `generate` discovers `# === [ SERVIDOR: <name> ] ===`, `# --- [ SERVIDOR ... ] ---`, and `SERVER_<name>_*` blocks, auto-completes missing secrets or expired JWTs (use `--strict-keys` in CI), propagates `TENANT_ID` to `POOLER_TENANT_ID`/`STORAGE_TENANT_ID`, emits `local.env` when `IS_DEFAULT=true` or `PREFER_FOR=local`, and skips Docker secret validation when `DEPLOY_MODE=cloud`.
- **`lite` runtime credentials in tests**: Call `resolveLiteRuntimeEnv(projectRoot, config, profileName)` from `@francogp/auditor/supabase` to obtain `{ url, anonKey, serviceRoleKey, postgresUrl, postgresPassword, jwtSecret, envFilePath }`.

### Responsibility Boundary: `auditor-supabase` vs. Host Project Scripts

| Concern | Owned by `@francogp/auditor/supabase` | Owned by Host Project |
| :--- | :--- | :--- |
| Upstream `docker/` clone, `Dockerfile`, Envoy/PostgREST/Postgres AST | Yes (`clone`, `generate`, `build`, `publish`) | Optional `customComposeOverlay` / `extraEnvVars` |
| Stack lifecycle (`up`, `down`, `restart`, `status`, `upgrade-pg`) | Yes | Domain wrappers (`run_dev.ts`, `deploy-*.sh`) |
| Idempotent SQL migration sync & transactional pre-flight | Yes (`migrate`, `-v ON_ERROR_STOP=1`, combined `BEGIN...ROLLBACK`, `supabase_admin` bootstrap, `postMigrateSql`) | Ephemeral schema/RLS domain tests (`test:migrations`) |
| Server `.env` inventory, key generation & `local.env` | Yes (`add-server`, `generate`) | App-specific outputs via `postGenerateCommand` (e.g. `servers:configure`) & `auth:sync` |

---

## 3. CLI Commands (`auditor-supabase` / `npm run auditor:supabase`)

| Command | Flags | Profiles | Action |
| :--- | :--- | :--- | :--- |
| `clone` | `--ref <tag>` | `remote`, `localFull` | Cleanly clones `upstreamRef` `docker` dir and generates `Dockerfile`. |
| `generate` | `--profile <name>` | All | Generates compose, nginx, and per-server `.env` files + fail-loud checks. |
| `add-server` | `--name <srv> [--non-interactive]` | `remote` | Registers/updates a server block in master `.env` using Upstream-First keys. |
| `list` | `--json` | `remote` | Lists configured servers from master `.env`. |
| `build` | `--tag <tag>` | `remote` | Builds the custom Postgres image from the cloned `docker` directory. |
| `publish` | `--tag <tag>` | `remote` | Pushes the custom Postgres image to the configured registry. |
| `release` | `--tag <tag>` | `remote` | Runs `build` followed by `publish`. |
| `all` | `--tag <tag>` | `remote` | Runs `clone`, `generate`, `build`, and `publish` in sequence. |
| `up` | `--profile <name>` | `localFull`, `lite` | Starts the stack (`lite` boots `db` -> runs `bootstrapSql` & migrations -> starts `rest`/`gateway`). |
| `down` | `--profile <name> --volumes` | `localFull`, `lite` | Stops the stack (`docker compose down`). |
| `restart` | `--profile <name>` | `localFull`, `lite` | Restarts the stack. |
| `status` | `[--profile <name>]` | All | Shows running containers, ports, Postgres version, and migration state. |
| `migrate` | `--profile <name>` | `localFull`, `lite` | Applies pending SQL migrations via `supabase_migrations.schema_migrations`. |
| `upgrade-pg` | `--from-volume <v> --to-volume <v> \| --profile <name>` | All | Orchestrates official `upgrade-pg*.sh` with `0700`/`0600` `scratch` manifest. |

---

## 4. Fail-Loud Validation & `upgrade-pg` Protocol

- **Zero Local Bind-Mounts (`remote`)**: `generate` aborts if any `services.*.volumes` entry retains a relative `./` or `../` mount source.
- **Postgres Major Guard**: Aborts if upstream `services.db.image` major version differs from `postgres.expectedMajor` (unless `allowMajorUpgrade: true`).
- **Secret & Charset Checks**: Rejects `.env.example` placeholder strings and enforces alphanumeric-only `POSTGRES_PASSWORD` and `DASHBOARD_PASSWORD`.
- **Docker Compose Verification**: Executes `docker compose -f <generated> config -q` before succeeding.
- **`tmpfs` Sizing & OOM Risk (`lite`)**: Setting `storage: 'tmpfs'` mounts `/var/lib/postgresql/data` in RAM (`no` restart policy). Keep test fixtures small and monitor container memory limits to prevent host/container OOM kills.
- **Docker Network vs. `bindLoopback` Trade-offs**: Enabling `security.bindLoopback: true` (`remote`) restricts host-exposed ports (`db`, `supavisor`, `api-gw`) to `127.0.0.1` (requiring SSH tunneling or reverse proxy), whereas `false` binds all interfaces (`0.0.0.0`) for direct remote access.
- **`upgrade-pg` Workflow**: Never overwrites `--from-volume`. Discovers and wraps official `utils/upgrade-pg<major>.sh`, preserves `db-config` (`pgsodium`), records SHA-256 checksums in `scratch`, and prints exact `.auditor/audit.config.ts` update instructions (`volumes.dbData` and `postgres.expectedMajor`) plus the post-verification `scratch` cleanup command.

---

## 5. Canonical Online Supabase Sources for Engine Updates

Whenever updating `@francogp/auditor`'s Docker + Supabase engine for new upstream releases, agents **MUST** consult the following official URLs in exact order:

1. **Changelog & Breaking Changes**: [Supabase Changelog](https://supabase.com/changelog.md) — scan `breaking-change` entries affecting self-hosting, Docker, PostgreSQL, or PostgREST.
2. **Official Docker Self-Hosting Guide**: [Self-Hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker.md) — current procedures, environment variables, and upgrade notes.
3. **Primary Docker Template Source on GitHub**:
   - [Official Docker Directory](https://github.com/supabase/supabase/tree/master/docker)
   - [Raw docker-compose.yml](https://raw.githubusercontent.com/supabase/supabase/master/docker/docker-compose.yml)
   - [Raw .env.example](https://raw.githubusercontent.com/supabase/supabase/master/docker/.env.example)
   - [Official Upgrade Utils](https://github.com/supabase/supabase/tree/master/docker/utils)
   - [Docker Commit History](https://github.com/supabase/supabase/commits/master/docker) — audit service, gateway, volume, and mount flag changes since the last sync.
4. **Critical Image Releases**:
   - [Supabase Postgres Releases](https://github.com/supabase/postgres/releases)
   - [PostgREST Releases](https://github.com/PostgREST/postgrest/releases)
5. **Architecture & Security**:
   - [Self-Hosting Discussions](https://github.com/orgs/supabase/discussions/categories/self-hosting)
   - [Supabase Product Security Index](https://supabase.com/docs/guides/security/product-security.md)

### Engine Update Protocol

1. Review `changelog.md` and recent commits in the upstream `docker` directory.
2. Diff `docker-compose.yml` and `.env.example` against `composeAstEngine.ts` and `envOrchestrator.ts`.
3. Update AST rules and offline contract test fixtures in `@francogp/auditor` if structural changes occurred.
4. Publish a new `@francogp/auditor` release and run `auditor-supabase clone` + `auditor-supabase generate` in consumer projects.
