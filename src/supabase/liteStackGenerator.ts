/**
 * src/supabase/liteStackGenerator.ts
 *
 * Deterministic 3-container (`db` + `rest` + `gateway`) stack generator for `lite` profiles.
 */

import fs from 'node:fs';
import path from 'node:path';

import { stringify } from 'yaml';

import { safeReadFile, safeResolve, safeWriteFile } from '../core/safePath.ts';
import { tryOrNull } from '../core/safeUtils.ts';
import { isInsecurePlaceholder, parseEnvContent, signSupabaseJwtPair } from './envOrchestrator.ts';
import type {
  SupabaseDockerConfig,
  SupabaseLiteComposeTarget,
  SupabaseLiteCredentials,
  SupabaseLiteNginxConfig,
  SupabaseLiteRuntimeEnv
} from './supabaseConfigTypes.ts';
import { randomAlphanumeric, SCHEMA_MIGRATIONS_BOOTSTRAP_SQL } from './supabaseCryptoUtils.ts';

const LITE_POSTGRES_PASSWORD_LENGTH = 32 as const;
const LITE_JWT_SECRET_LENGTH = 48 as const;

/**
 * Resolves `POSTGRES_PASSWORD` and `JWT_SECRET` for a `lite` profile:
 * 1. Master `.env` (`LITE_<PROFILE>_*` -> `POSTGRES_PASSWORD`/`JWT_SECRET`) if non-placeholder.
 * 2. Profile-local `.env` inside `<supabaseDir>/generated/lite/<profile>/.env` (created if missing).
 */
export async function resolveLiteCredentials(
  projectRoot: string,
  config: SupabaseDockerConfig,
  profileName: string
): Promise<{
  readonly postgresPassword: string;
  readonly jwtSecret: string;
  readonly envFilePath: string;
}> {
  const outDir = safeResolve(projectRoot, config.supabaseDir, 'generated', 'lite', profileName);
  const localEnvPath = path.join(outDir, '.env');
  const prefix = `LITE_${profileName.toUpperCase().replaceAll(/[^A-Z0-9]/gu, '_')}_`;

  const masterPath = safeResolve(projectRoot, config.masterEnvFile);
  const masterContent = fs.existsSync(masterPath) ? await safeReadFile(masterPath) : '';
  const masterVars = parseEnvContent(masterContent);

  const masterPg =
    masterVars.get(`${prefix}POSTGRES_PASSWORD`) ?? masterVars.get('POSTGRES_PASSWORD');
  const masterJwt = masterVars.get(`${prefix}JWT_SECRET`) ?? masterVars.get('JWT_SECRET');
  if (
    masterPg &&
    masterJwt &&
    !isInsecurePlaceholder(masterPg) &&
    !isInsecurePlaceholder(masterJwt)
  ) {
    return { postgresPassword: masterPg, jwtSecret: masterJwt, envFilePath: masterPath };
  }

  const existingLocal = tryOrNull(() => fs.readFileSync(localEnvPath, 'utf8'));
  if (existingLocal) {
    const parsed = parseEnvContent(existingLocal);
    const localPg = parsed.get('POSTGRES_PASSWORD');
    const localJwt = parsed.get('JWT_SECRET');
    if (localPg && localJwt) {
      return {
        postgresPassword: localPg,
        jwtSecret: localJwt,
        envFilePath: localEnvPath
      };
    }
  }

  const postgresPassword = randomAlphanumeric(LITE_POSTGRES_PASSWORD_LENGTH);
  const jwtSecret = randomAlphanumeric(LITE_JWT_SECRET_LENGTH);
  await safeWriteFile(
    localEnvPath,
    `# Auto-generated local credentials for lite profile '${profileName}'\nPOSTGRES_PASSWORD=${postgresPassword}\nJWT_SECRET=${jwtSecret}\n`
  );

  return { postgresPassword, jwtSecret, envFilePath: localEnvPath };
}

/**
 * Resolves `POSTGRES_PASSWORD`, `JWT_SECRET`, and signed `ANON_KEY` / `SERVICE_ROLE_KEY`
 * for a `lite` profile so integration tests and local apps can connect immediately.
 */
export async function resolveLiteRuntimeEnv(
  projectRoot: string,
  config: SupabaseDockerConfig,
  profileName: string
): Promise<SupabaseLiteRuntimeEnv> {
  const profile = config.profiles.lite?.get(profileName);
  if (!profile?.enabled) {
    throw new Error(
      `Lite profile '${profileName}' is missing or disabled in supabaseDocker config.`
    );
  }
  const creds = await resolveLiteCredentials(projectRoot, config, profileName);
  const { anonKey, serviceRoleKey } = signSupabaseJwtPair(creds.jwtSecret);
  return {
    url: `http://127.0.0.1:${profile.ports.gateway}`,
    anonKey,
    serviceRoleKey,
    postgresUrl: `postgresql://postgres:${creds.postgresPassword}@127.0.0.1:${profile.ports.postgres}/postgres`,
    postgresPassword: creds.postgresPassword,
    jwtSecret: creds.jwtSecret,
    envFilePath: creds.envFilePath
  };
}

/**
 * Generates Nginx reverse proxy config forwarding `/rest/v1/` (and optionally `/`) to PostgREST.
 */
export function generateLiteNginxConf(
  restServiceName: string,
  nginxOpts?: SupabaseLiteNginxConfig
): string {
  const maxBodySize = nginxOpts?.clientMaxBodySize?.trim() || '100m';
  const proxyRoot = nginxOpts?.proxyRoot ?? true;
  const proxyBlock = [
    `        proxy_pass http://${restServiceName}:3000/;`,
    '        proxy_set_header Host $host;',
    '        proxy_set_header X-Real-IP $remote_addr;',
    '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
    '        proxy_set_header X-Forwarded-Proto $scheme;'
  ];
  const lines = [
    'server {',
    '    listen 80;',
    '    server_name localhost;',
    `    client_max_body_size ${maxBodySize};`,
    ''
  ];
  if (nginxOpts?.extraDirectives?.trim()) {
    lines.push(`    ${nginxOpts.extraDirectives.trim()}`, '');
  }
  lines.push('    location /rest/v1/ {', ...proxyBlock, '    }');
  if (proxyRoot) {
    lines.push('', '    location / {', ...proxyBlock, '    }');
  }
  lines.push('}', '');
  return lines.join('\n');
}

/**
 * Generates idempotent SQL ensuring Supabase roles (`anon`, `authenticated`, `service_role`,
 * `authenticator`), JWT GUC settings, and `supabase_migrations.schema_migrations`.
 */
export function generateLiteBootstrapSql(jwtSecret: string, postgresPassword: string): string {
  const escapedSecret = jwtSecret.replaceAll("'", "''");
  const escapedPassword = postgresPassword.replaceAll("'", "''");
  return [
    'DO $$',
    'BEGIN',
    "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;",
    "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;",
    "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;",
    "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN",
    `    CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD '${escapedPassword}';`,
    '  ELSE',
    `    ALTER ROLE authenticator WITH LOGIN PASSWORD '${escapedPassword}';`,
    '  END IF;',
    '  GRANT anon TO authenticator;',
    '  GRANT authenticated TO authenticator;',
    '  GRANT service_role TO authenticator;',
    'END $$;',
    '',
    `ALTER DATABASE postgres SET "app.settings.jwt_secret" TO '${escapedSecret}';`,
    SCHEMA_MIGRATIONS_BOOTSTRAP_SQL,
    ''
  ].join('\n');
}

/**
 * Generates the 3-container `docker-compose.yml` for a `lite` profile.
 */
export function generateLiteComposeYaml(
  target: SupabaseLiteComposeTarget,
  creds: SupabaseLiteCredentials
): string {
  const { projectSlug, profileName, profile } = target;
  const stackPrefix = `${projectSlug}-${profileName}`;
  const dbName = `${stackPrefix}-db`;
  const restName = `${stackPrefix}-rest`;
  const gwName = `${stackPrefix}-gateway`;
  const volumeName = profile.volumeName?.trim() || `${stackPrefix}-pgdata`;

  const dbService: Record<string, unknown> = {
    image: profile.images.postgres,
    container_name: dbName,
    restart: profile.storage === 'tmpfs' ? 'no' : 'unless-stopped',
    ports: [`${profile.ports.postgres}:5432`],
    environment: {
      POSTGRES_HOST: '/var/run/postgresql',
      PGPORT: 5432,
      POSTGRES_PORT: 5432,
      PGPASSWORD: creds.postgresPassword,
      POSTGRES_PASSWORD: creds.postgresPassword,
      PGDATABASE: 'postgres',
      POSTGRES_DB: 'postgres',
      JWT_SECRET: creds.jwtSecret,
      JWT_EXP: 3600
    },
    command: [
      'postgres',
      '-c',
      'config_file=/etc/postgresql/postgresql.conf',
      '-c',
      'log_min_messages=fatal'
    ],
    healthcheck: {
      test: ['CMD', 'pg_isready', '-U', 'postgres', '-h', 'localhost'],
      interval: '2s',
      timeout: '5s',
      retries: 20
    }
  };

  if (profile.storage === 'tmpfs') {
    dbService.tmpfs = ['/var/lib/postgresql/data'];
  } else {
    dbService.volumes = [`${volumeName}:/var/lib/postgresql/data`];
  }

  const composeObj: Record<string, unknown> = {
    name: stackPrefix,
    services: {
      [dbName]: dbService,
      [restName]: {
        image: profile.images.postgrest,
        container_name: restName,
        restart: profile.storage === 'tmpfs' ? 'no' : 'unless-stopped',
        depends_on: { [dbName]: { condition: 'service_healthy' } },
        environment: {
          PGRST_DB_URI: `postgres://authenticator:${creds.postgresPassword}@${dbName}:5432/postgres`,
          PGRST_DB_SCHEMAS: profile.schemas.join(','),
          PGRST_DB_ANON_ROLE: 'anon',
          PGRST_JWT_SECRET: creds.jwtSecret,
          PGRST_DB_USE_LEGACY_GUCS: 'false',
          PGRST_APP_SETTINGS_JWT_SECRET: creds.jwtSecret,
          PGRST_APP_SETTINGS_JWT_EXP: 3600
        },
        healthcheck: {
          test: ['CMD', 'postgrest', '--ready'],
          interval: '5s',
          timeout: '5s',
          retries: 5
        }
      },
      [gwName]: {
        image: profile.images.nginx,
        container_name: gwName,
        restart: profile.storage === 'tmpfs' ? 'no' : 'unless-stopped',
        ports: [`${profile.ports.gateway}:80`],
        volumes: ['./nginx.conf:/etc/nginx/conf.d/default.conf:ro'],
        depends_on: [restName]
      }
    }
  };

  if (profile.storage === 'volume') {
    composeObj.volumes = {
      [volumeName]: profile.externalVolume ? { external: true } : {}
    };
  }

  return stringify(composeObj);
}

/**
 * Materializes `docker-compose.yml`, `nginx.conf`, and `.env` for a `lite` profile,
 * returning `bootstrapSql` in memory for direct `docker exec psql` application.
 */
export async function writeLiteProfileArtifacts(
  projectRoot: string,
  config: SupabaseDockerConfig,
  profileName: string
): Promise<{
  readonly composePath: string;
  readonly nginxPath: string;
  readonly envFilePath: string;
  readonly bootstrapSql: string;
}> {
  const profile = config.profiles.lite?.get(profileName);
  if (!profile?.enabled) {
    throw new Error(
      `Lite profile '${profileName}' is missing or disabled in supabaseDocker config.`
    );
  }

  const outDir = safeResolve(projectRoot, config.supabaseDir, 'generated', 'lite', profileName);
  const creds = await resolveLiteCredentials(projectRoot, config, profileName);
  const restServiceName = `${config.projectSlug}-${profileName}-rest`;

  const composePath = path.join(outDir, 'docker-compose.yml');
  const nginxPath = path.join(outDir, 'nginx.conf');

  await safeWriteFile(
    composePath,
    generateLiteComposeYaml({ projectSlug: config.projectSlug, profileName, profile }, creds)
  );
  await safeWriteFile(nginxPath, generateLiteNginxConf(restServiceName, profile.nginx));

  return {
    composePath,
    nginxPath,
    envFilePath: creds.envFilePath,
    bootstrapSql: generateLiteBootstrapSql(creds.jwtSecret, creds.postgresPassword)
  };
}
