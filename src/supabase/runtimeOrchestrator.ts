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

export interface SupabaseMigrationFile {
  readonly version: string;
  readonly fileName: string;
  readonly filePath: string;
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

function execDockerPsql(containerName: string, sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', containerName, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A'],
    {
      input: sql,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }
  );
}

/**
 * Applies pending migrations from `migrationsDir` using `supabase_migrations.schema_migrations`
 * and reloads PostgREST schema cache.
 */
export function syncDatabaseMigrations(
  containerName: string,
  migrationsDir: string,
  bootstrapSql?: string
): SupabaseMigrationSyncResult {
  if (bootstrapSql) {
    execDockerPsql(containerName, bootstrapSql);
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
  const newlyApplied: string[] = [];
  let skipped = 0;

  for (const file of files) {
    if (appliedSet.has(file.version)) {
      skipped += 1;
      continue;
    }
    const sql = fs.readFileSync(file.filePath, 'utf8');
    execDockerPsql(containerName, sql);
    const escapedVersion = file.version.replaceAll("'", "''");
    execDockerPsql(
      containerName,
      `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${escapedVersion}') ON CONFLICT (version) DO NOTHING;`
    );
    newlyApplied.push(file.version);
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

/**
 * Starts a Compose stack (`up -d --wait`).
 */
export function composeUp(composePath: string, envFilePath?: string): void {
  const args = ['compose', '-f', composePath];
  if (envFilePath) args.push('--env-file', envFilePath);
  args.push('up', '-d', '--wait');
  execFileSync('docker', args, { cwd: path.dirname(composePath), stdio: 'inherit' });
}

/**
 * Stops a Compose stack (`down` or `down -v`).
 */
export function composeDown(composePath: string, removeVolumes = false): void {
  const args = ['compose', '-f', composePath, 'down'];
  if (removeVolumes) args.push('-v');
  execFileSync('docker', args, { cwd: path.dirname(composePath), stdio: 'inherit' });
}

/**
 * Restarts a Compose stack.
 */
export function composeRestart(composePath: string): void {
  execFileSync('docker', ['compose', '-f', composePath, 'restart'], {
    cwd: path.dirname(composePath),
    stdio: 'inherit'
  });
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
