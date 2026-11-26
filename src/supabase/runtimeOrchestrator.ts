/**
 * src/supabase/runtimeOrchestrator.ts
 *
 * Docker lifecycle operations (`build`, `publish`, `up`, `down`, `restart`, `status`)
 * and idempotent SQL migration synchronization via `supabase_migrations.schema_migrations`.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { safeResolve } from '../core/safePath.ts';
import { tryCatchSync } from '../core/safeUtils.ts';
import type { SupabaseDockerConfig, SupabaseMigrationSyncResult } from './supabaseConfigTypes.ts';
import { SCHEMA_MIGRATIONS_BOOTSTRAP_SQL } from './supabaseCryptoUtils.ts';

const MIGRATION_FILE_REGEX = /^(\d{14})_.*\.sql$/u;
const NON_TRANSACTIONAL_SQL_REGEX =
  /\b(?:CREATE\s+INDEX\s+CONCURRENTLY|DROP\s+INDEX\s+CONCURRENTLY|VACUUM|CLUSTER)\b/iu;

export interface SupabaseMigrationFile {
  readonly version: string;
  readonly fileName: string;
  readonly filePath: string;
}

export interface SyncDatabaseMigrationsOptions {
  readonly bootstrapSql?: string;
  readonly preflightDryRun?: boolean;
  readonly postMigrateSql?: string;
}

export interface ComposeDownOptions {
  readonly removeVolumes?: boolean;
  readonly envFilePath?: string;
}

/**
 * Lists SQL migration files matching `^(\d{14})_.*\.sql$` in lexicographical order.
 */
export function listOrderedMigrationFiles(migrationsDir: string): readonly SupabaseMigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }
  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  const files: SupabaseMigrationFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = MIGRATION_FILE_REGEX.exec(entry.name);
    if (!match?.[1]) continue;
    files.push({
      version: match[1],
      fileName: entry.name,
      filePath: path.join(migrationsDir, entry.name)
    });
  }
  return files.sort((a, b) => a.version.localeCompare(b.version));
}

type DockerPsqlRole = 'postgres' | 'supabase_admin';

interface PendingMigrationEntry {
  readonly file: SupabaseMigrationFile;
  readonly sql: string;
  readonly isNonTransactional: boolean;
}

function execDockerPsql(
  containerName: string,
  sql: string,
  user: DockerPsqlRole = 'postgres'
): string {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      containerName,
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      user,
      '-d',
      'postgres',
      '-t',
      '-A'
    ],
    {
      input: sql,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }
  );
}

const MISSING_SUPABASE_ADMIN_ROLE_REGEX = /role\s+"supabase_admin"\s+does\s+not\s+exist/iu;

function extractProcessErrorText(err: unknown): string {
  if (typeof err !== 'object' || err === null) return String(err);
  const parts: string[] = [];
  if ('message' in err && typeof err.message === 'string') {
    parts.push(err.message);
  }
  if ('stderr' in err) {
    const rawStderr = err.stderr;
    if (typeof rawStderr === 'string') parts.push(rawStderr);
    else if (Buffer.isBuffer(rawStderr)) parts.push(rawStderr.toString('utf8'));
  }
  return parts.join('\n');
}

/**
 * Executes bootstrap SQL (roles, `authenticator` password, JWT GUC) via `supabase_admin`
 * with automatic fallback to `postgres` when `supabase_admin` is absent.
 */
export function applyBootstrapSql(containerName: string, sql: string): void {
  try {
    execDockerPsql(containerName, sql, 'supabase_admin');
  } catch (err: unknown) {
    if (MISSING_SUPABASE_ADMIN_ROLE_REGEX.test(extractProcessErrorText(err))) {
      execDockerPsql(containerName, sql, 'postgres');
      return;
    }
    throw err;
  }
}

function preflightSingleEntry(containerName: string, entry: PendingMigrationEntry): void {
  if (entry.isNonTransactional) {
    process.stderr.write(
      `[Warning] Skipping transactional pre-flight dry-run for ${entry.file.fileName} (contains non-transactional DDL).\n`
    );
    return;
  }
  execDockerPsql(containerName, `BEGIN;\n${entry.sql}\nROLLBACK;\n`);
}

/**
 * Applies pending migrations from `migrationsDir` using `supabase_migrations.schema_migrations`
 * with `-v ON_ERROR_STOP=1`, transactional pre-flight dry-run by default, optional `postMigrateSql`,
 * and reloads PostgREST schema cache.
 */
export function syncDatabaseMigrations(
  containerName: string,
  migrationsDir: string,
  options: SyncDatabaseMigrationsOptions = {}
): SupabaseMigrationSyncResult {
  const preflightDryRun = options.preflightDryRun ?? true;

  if (options.bootstrapSql) {
    applyBootstrapSql(containerName, options.bootstrapSql);
  } else {
    execDockerPsql(containerName, SCHEMA_MIGRATIONS_BOOTSTRAP_SQL);
  }

  const appliedRaw = execDockerPsql(
    containerName,
    'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version ASC;'
  );
  const appliedSet = new Set(
    appliedRaw
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
  );

  const files = listOrderedMigrationFiles(migrationsDir);
  const pendingFiles = files.filter((file) => !appliedSet.has(file.version));
  const skipped = files.length - pendingFiles.length;
  const pendingEntries: readonly PendingMigrationEntry[] = pendingFiles.map((file) => {
    const sql = fs.readFileSync(file.filePath, 'utf8');
    return {
      file,
      sql,
      isNonTransactional: NON_TRANSACTIONAL_SQL_REGEX.test(sql)
    };
  });

  const hasNonTransactional = pendingEntries.some((entry) => entry.isNonTransactional);
  if (preflightDryRun && pendingEntries.length > 0 && !hasNonTransactional) {
    const combinedSql = pendingEntries.map((entry) => entry.sql).join('\n');
    execDockerPsql(containerName, `BEGIN;\n${combinedSql}\nROLLBACK;\n`);
  }

  const newlyApplied: string[] = [];
  for (const entry of pendingEntries) {
    if (preflightDryRun && hasNonTransactional) {
      preflightSingleEntry(containerName, entry);
    }
    execDockerPsql(containerName, entry.sql);
    const escapedVersion = entry.file.version.replaceAll("'", "''");
    execDockerPsql(
      containerName,
      `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${escapedVersion}') ON CONFLICT (version) DO NOTHING;`
    );
    newlyApplied.push(entry.file.version);
  }

  if (options.postMigrateSql?.trim() && newlyApplied.length > 0) {
    execDockerPsql(containerName, options.postMigrateSql);
  }

  execDockerPsql(containerName, "NOTIFY pgrst, 'reload schema';");
  return { applied: newlyApplied, skipped };
}

/**
 * Resolves the full Docker image tag from `profiles.remote.image`.
 */
export function resolveRemoteImageRef(config: SupabaseDockerConfig, tagOverride?: string): string {
  const image = config.profiles.remote?.image;
  if (!image) {
    throw new Error('profiles.remote.image is not configured in supabaseDocker.');
  }
  const tag = tagOverride?.trim() || image.tag;
  const prefix = image.registry ? `${image.registry}/` : '';
  return `${prefix}${image.user}/${image.repo}:${tag}`;
}

/**
 * Builds the custom PostgreSQL Docker image from `<supabaseDir>/docker`.
 */
export function buildCustomDbImage(
  projectRoot: string,
  config: SupabaseDockerConfig,
  tagOverride?: string
): string {
  const dockerDir = safeResolve(projectRoot, config.supabaseDir, 'docker');
  const imageRef = resolveRemoteImageRef(config, tagOverride);
  execFileSync('docker', ['build', '-t', imageRef, '.'], {
    cwd: dockerDir,
    stdio: 'inherit'
  });
  return imageRef;
}

/**
 * Pushes the custom PostgreSQL Docker image to the configured registry.
 * Performs `docker login --password-stdin` automatically if `DOCKER_REGISTRY_PASSWORD` or `DOCKER_PASSWORD` is set.
 */
export function publishCustomDbImage(config: SupabaseDockerConfig, tagOverride?: string): string {
  const image = config.profiles.remote?.image;
  const imageRef = resolveRemoteImageRef(config, tagOverride);
  const registryPassword = process.env.DOCKER_REGISTRY_PASSWORD ?? process.env.DOCKER_PASSWORD;
  if (image && registryPassword) {
    const loginArgs = ['login'];
    if (image.registry) loginArgs.push(image.registry);
    loginArgs.push('-u', image.user, '--password-stdin');
    execFileSync('docker', loginArgs, {
      input: `${registryPassword}\n`,
      stdio: ['pipe', 'inherit', 'inherit']
    });
  }
  execFileSync('docker', ['push', imageRef], { stdio: 'inherit' });
  return imageRef;
}

const PG_MIN_SERVER_VERSION_NUM = 100000 as const;
const PG_MAJOR_VERSION_DIVISOR = 10000 as const;

/**
 * Detects the running PostgreSQL major version inside a container (`null` if stopped/unavailable).
 */
export function detectContainerPostgresMajor(containerName: string): number | null {
  const res = tryCatchSync(() => execDockerPsql(containerName, 'SHOW server_version_num;'));
  if (res.status !== 'success') return null;
  const versionNum = Number.parseInt(res.value.trim(), 10);
  if (!Number.isFinite(versionNum) || versionNum < PG_MIN_SERVER_VERSION_NUM) return null;
  return Math.floor(versionNum / PG_MAJOR_VERSION_DIVISOR);
}

function execDockerCompose(
  composePath: string,
  subcommandArgs: readonly string[],
  envFilePath?: string
): void {
  const args = ['compose', '-f', composePath];
  if (envFilePath) args.push('--env-file', envFilePath);
  args.push(...subcommandArgs);
  execFileSync('docker', args, { cwd: path.dirname(composePath), stdio: 'inherit' });
}

/**
 * Starts a Compose stack (`up -d --wait [services...]`).
 */
export function composeUp(
  composePath: string,
  envFilePath?: string,
  services: readonly string[] = []
): void {
  execDockerCompose(composePath, ['up', '-d', '--wait', ...services], envFilePath);
}

/**
 * Stops a Compose stack (`down` or `down -v`).
 */
export function composeDown(composePath: string, options: ComposeDownOptions = {}): void {
  const subcommandArgs = options.removeVolumes ? ['down', '-v'] : ['down'];
  execDockerCompose(composePath, subcommandArgs, options.envFilePath);
}

/**
 * Restarts a Compose stack.
 */
export function composeRestart(composePath: string, envFilePath?: string): void {
  execDockerCompose(composePath, ['restart'], envFilePath);
}

/**
 * Returns formatted `docker ps` status filtered by `projectSlug`.
 */
export function getStackStatus(projectSlug: string): string {
  return execFileSync(
    'docker',
    [
      'ps',
      '--filter',
      `name=${projectSlug}`,
      '--format',
      'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
}

/**
 * Resolves the canonical PostgreSQL container name for a given profile (`remote`, `localFull`, or `lite` key).
 */
export function resolveProfileDbContainerName(projectSlug: string, profile: string): string {
  if (profile === 'remote' || profile === 'localFull') {
    return `${projectSlug}-supabase-db`;
  }
  return `${projectSlug}-${profile}-db`;
}

/**
 * Returns `docker ps` output plus live Postgres version and migration count for a profile or project.
 */
export function getDetailedStackStatus(config: SupabaseDockerConfig, profile?: string): string {
  const filterName =
    !profile || profile === 'remote' || profile === 'localFull'
      ? config.projectSlug
      : `${config.projectSlug}-${profile}`;
  const psOutput = getStackStatus(filterName).trimEnd();
  if (!profile) return psOutput;

  const dbContainer = resolveProfileDbContainerName(config.projectSlug, profile);
  const pgMajor = detectContainerPostgresMajor(dbContainer);
  if (pgMajor === null) {
    return `${psOutput}\nPostgres (${dbContainer}): offline`;
  }

  const migRes = tryCatchSync(() =>
    execDockerPsql(
      dbContainer,
      "SELECT COUNT(*), COALESCE(MAX(version), 'none') FROM supabase_migrations.schema_migrations;"
    )
  );
  const migSummary =
    migRes.status === 'success'
      ? migRes.value.trim().replace('|', ' applied, latest=')
      : 'uninitialized';
  return `${psOutput}\nPostgres (${dbContainer}): v${pgMajor} | Migrations: ${migSummary}`;
}
