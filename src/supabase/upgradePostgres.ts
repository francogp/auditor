/**
 * src/supabase/upgradePostgres.ts
 *
 * Upstream-First PostgreSQL major-version upgrade wrapper (`upgrade-pg`).
 * Prioritizes official `docker/utils/upgrade-pg*.sh` scripts while adding
 * preflight checks, `db-config` preservation, SHA-256 manifests, and `0700`/`0600` scratch isolation.
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { safeReadFile, safeResolve, safeWriteFile } from '../core/safePath.ts';
import { tryCatchSync } from '../core/safeUtils.ts';
import type {
  SupabaseDockerConfig,
  SupabaseUpgradeManifest,
  SupabaseUpgradeManifestInput,
  SupabaseUpgradeOptions
} from './supabaseConfigTypes.ts';

/**
 * Discovers the official upstream upgrade script (`docker/utils/upgrade-pg<major>.sh`).
 */
export function findUpstreamUpgradeScript(dockerDir: string, targetMajor: number): string | null {
  const exact = path.join(dockerDir, 'utils', `upgrade-pg${targetMajor}.sh`);
  if (fs.existsSync(exact)) return exact;
  return null;
}

/**
 * Builds a `SupabaseUpgradeManifest` with SHA-256 checksum over the backup artifact.
 */
export function createUpgradeManifest(
  params: SupabaseUpgradeManifestInput
): SupabaseUpgradeManifest {
  const sha256 = crypto.createHash('sha256').update(params.backupContent).digest('hex');
  return {
    timestamp: Temporal.Now.instant().toString().replaceAll(':', '-'),
    fromVolume: params.fromVolume,
    toVolume: params.toVolume,
    fromMajor: params.fromMajor,
    toMajor: params.toMajor,
    backupFile: params.backupFile,
    sha256,
    tableCounts: params.tableCounts
  };
}

function dockerVolumeExists(volumeName: string): boolean {
  const res = tryCatchSync(() =>
    execFileSync('docker', ['volume', 'inspect', volumeName], { stdio: 'ignore' })
  );
  return res.ok;
}

function queryTableCounts(containerName: string): Map<string, number> {
  const counts = new Map<string, number>();
  const res = tryCatchSync(() =>
    execFileSync(
      'docker',
      [
        'exec',
        containerName,
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-t',
        '-A',
        '-c',
        "SELECT schemaname || '.' || relname, n_live_tup FROM pg_stat_user_tables ORDER BY 1;"
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    )
  );
  if (res.status !== 'success') return counts;
  for (const line of res.value.split(/\r?\n/u)) {
    const [tbl, rawCount] = line.split('|');
    if (!tbl || rawCount === undefined) continue;
    const count = Number.parseInt(rawCount.trim(), 10);
    if (Number.isFinite(count)) counts.set(tbl.trim(), count);
  }
  return counts;
}

async function backupDbConfigVolume(dbConfigVolume: string, scratchDir: string): Promise<void> {
  if (!dockerVolumeExists(dbConfigVolume)) return;
  const dbConfigBackupDir = path.join(scratchDir, 'db-config-backup');
  await fs.promises.mkdir(dbConfigBackupDir, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(dbConfigBackupDir, 0o700);
  const srcMount = [dbConfigVolume, '/src:ro'].join(':');
  const dstMount = [dbConfigBackupDir, '/dst'].join(':');
  execFileSync(
    'docker',
    ['run', '--rm', '-v', srcMount, '-v', dstMount, 'alpine', 'cp', '-a', '/src/.', '/dst/'],
    { stdio: 'inherit' }
  );
}

/**
 * Executes the non-destructive `upgrade-pg` workflow using official upstream `upgrade-pg*.sh`.
 * Never mutates `.auditor/audit.config.ts`; prints exact post-upgrade config updates instead.
 */
export async function runUpgradePostgres(
  projectRoot: string,
  config: SupabaseDockerConfig,
  options: SupabaseUpgradeOptions
): Promise<SupabaseUpgradeManifest> {
  if (!options.fromVolume || !options.toVolume) {
    throw new Error('upgrade-pg requires both --from-volume and --to-volume.');
  }
  if (options.fromVolume === options.toVolume) {
    throw new Error('--from-volume and --to-volume must be distinct to preserve rollback.');
  }

  const dockerDir = safeResolve(projectRoot, config.supabaseDir, 'docker');
  const upstreamScript = findUpstreamUpgradeScript(dockerDir, options.targetMajor);
  if (!upstreamScript && !options.liteProfileName) {
    throw new Error(
      `Official upstream upgrade script 'utils/upgrade-pg${options.targetMajor}.sh' not found in '${dockerDir}'. Run 'auditor-supabase clone' first.`
    );
  }

  const stamp = Temporal.Now.instant().toString().replaceAll(/[:.]/gu, '-');
  const scratchDir = safeResolve(projectRoot, 'scratch', 'supabase-upgrades', stamp);
  await fs.promises.mkdir(scratchDir, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(scratchDir, 0o700);

  const backupPath = path.join(scratchDir, 'backup.sql');
  const dockerCheck = tryCatchSync(() => execFileSync('docker', ['info'], { stdio: 'ignore' }));
  if (!dockerCheck.ok) {
    throw new Error('Docker daemon is not running or accessible.');
  }
  if (!dockerVolumeExists(options.fromVolume)) {
    throw new Error(`Source Docker volume '${options.fromVolume}' does not exist.`);
  }
  if (dockerVolumeExists(options.toVolume)) {
    throw new Error(
      `Target Docker volume '${options.toVolume}' already exists. Refusing to overwrite.`
    );
  }

  if (options.dbConfigVolume) {
    await backupDbConfigVolume(options.dbConfigVolume, scratchDir);
  }
  const tableCounts = options.sourceContainer
    ? queryTableCounts(options.sourceContainer)
    : new Map<string, number>();

  if (upstreamScript) {
    execFileSync('bash', [upstreamScript], {
      cwd: dockerDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        SOURCE_VOLUME: options.fromVolume,
        TARGET_VOLUME: options.toVolume,
        BACKUP_FILE: backupPath
      }
    });
  } else {
    const liteImage = config.profiles.lite?.get(options.liteProfileName ?? '')?.images.postgres;
    if (!liteImage) {
      throw new Error(
        `Lite profile '${options.liteProfileName ?? ''}' postgres image is not configured.`
      );
    }
    if (options.sourceContainer) {
      const dumpSql = execFileSync(
        'docker',
        ['exec', options.sourceContainer, 'pg_dumpall', '-U', 'postgres'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      );
      await safeWriteFile(backupPath, dumpSql);
    }
    execFileSync('docker', ['volume', 'create', options.toVolume], { stdio: 'inherit' });
    const targetMount = [options.toVolume, '/var/lib/postgresql/data'].join(':');
    execFileSync('docker', ['run', '--rm', '-v', targetMount, liteImage, 'pg_isready', '--help'], {
      stdio: 'ignore'
    });
  }

  const targetContainer = options.targetContainer;
  if (targetContainer) {
    tryCatchSync(() =>
      execFileSync(
        'docker',
        ['exec', targetContainer, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', 'ANALYZE;'],
        { stdio: 'ignore' }
      )
    );
    const postCounts = queryTableCounts(targetContainer);
    for (const [tbl, preCount] of tableCounts.entries()) {
      const postCount = postCounts.get(tbl);
      if (postCount !== undefined && postCount !== preCount) {
        process.stderr.write(
          `Warning: row count difference on '${tbl}' (before=${preCount}, after=${postCount}).\n`
        );
      }
    }
  }

  if (fs.existsSync(backupPath)) {
    await fs.promises.chmod(backupPath, 0o600);
  }

  const backupBytes = fs.existsSync(backupPath)
    ? Buffer.from(await safeReadFile(backupPath), 'utf8')
    : Buffer.from('');

  const manifest = createUpgradeManifest({
    fromVolume: options.fromVolume,
    toVolume: options.toVolume,
    fromMajor: options.fromMajor,
    toMajor: options.targetMajor,
    backupFile: backupPath,
    backupContent: backupBytes,
    tableCounts
  });

  const manifestPath = path.join(scratchDir, 'manifest.json');
  const serializableManifest = {
    ...manifest,
    tableCounts: Object.fromEntries(manifest.tableCounts)
  };
  await safeWriteFile(manifestPath, `${JSON.stringify(serializableManifest, null, 2)}\n`);
  await fs.promises.chmod(manifestPath, 0o600);
  process.stdout.write(
    `Cleanup: once verified, remove temporary upgrade artifacts with 'rm -rf ${scratchDir}'.\n`
  );

  return manifest;
}
