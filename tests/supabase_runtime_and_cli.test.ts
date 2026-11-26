import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

const { execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn<(file: string, args: readonly string[], options?: unknown) => string>(
    () => ''
  )
}));

vi.mock('node:child_process', () => ({
  execFileSync: execFileSyncMock
}));

import { supabaseManageCommand } from '../src/cli/supabase_manage.ts';
import { resetAuditConfig } from '../src/core/auditConfigLoader.ts';
import {
  composeDown,
  composeRestart,
  DEFAULT_SUPABASE_DOCKER_CONFIG,
  listOrderedMigrationFiles,
  resolveProfileDbContainerName,
  resolveRemoteImageRef,
  syncDatabaseMigrations,
  type SupabaseDockerConfig
} from '../src/supabase/index.ts';

const tempDirs: string[] = [];

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  resetAuditConfig();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('runtimeOrchestrator & supabase_manage CLI', () => {
  it('lists timestamped SQL migrations in lexicographical order and ignores non-matching files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-mig-'));
    tempDirs.push(tmpDir);
    fs.writeFileSync(path.join(tmpDir, '20261102120000_second.sql'), 'SELECT 2;');
    fs.writeFileSync(path.join(tmpDir, '20261101100000_first.sql'), 'SELECT 1;');
    fs.writeFileSync(path.join(tmpDir, 'notes.md'), 'ignore');

    const ordered = listOrderedMigrationFiles(tmpDir);
    expect(ordered.map((m) => m.version)).toStrictEqual(['20261101100000', '20261102120000']);
    expect(listOrderedMigrationFiles(path.join(tmpDir, 'missing'))).toStrictEqual([]);
  });

  it('resolves remote Docker image reference with optional registry and tag override', () => {
    const cfg: SupabaseDockerConfig = {
      ...DEFAULT_SUPABASE_DOCKER_CONFIG,
      enabled: true,
      profiles: {
        remote: {
          enabled: true,
          includeLogs: false,
          image: { registry: 'ghcr.io', user: 'francogp', repo: 'demo-db', tag: 'v1' },
          volumes: { shared: 's', dbData: 'd', dbConfig: 'c', storage: 'st' },
          security: { bindLoopback: false }
        }
      }
    };
    expect(resolveRemoteImageRef(cfg)).toBe('ghcr.io/francogp/demo-db:v1');
    expect(resolveRemoteImageRef(cfg, 'v2')).toBe('ghcr.io/francogp/demo-db:v2');
    expect(resolveProfileDbContainerName('demo', 'remote')).toBe('demo-supabase-db');
    expect(resolveProfileDbContainerName('demo', 'localFull')).toBe('demo-supabase-db');
    expect(resolveProfileDbContainerName('demo', 'test')).toBe('demo-test-db');
  });

  it('registers all 14 subcommands on auditor-supabase CLI with spec-compliant args', () => {
    const subCommands = supabaseManageCommand.subCommands as Record<
      string,
      { readonly args?: Record<string, unknown> }
    >;
    expect(supabaseManageCommand.run).toBeUndefined();
    expect(Object.keys(subCommands).sort()).toStrictEqual([
      'add-server',
      'all',
      'build',
      'clone',
      'down',
      'generate',
      'list',
      'migrate',
      'publish',
      'release',
      'restart',
      'status',
      'up',
      'upgrade-pg'
    ]);
    expect(subCommands['add-server']?.args).toHaveProperty('non-interactive');
    expect(subCommands['add-server']?.args).not.toHaveProperty('url');
    expect(subCommands.status?.args).toHaveProperty('profile');
    expect(subCommands['upgrade-pg']?.args).toHaveProperty('profile');
    expect(subCommands['upgrade-pg']?.args).not.toHaveProperty('dry-run');
    expect(subCommands['upgrade-pg']?.args).not.toHaveProperty('from-major');
    expect(subCommands.generate?.args).toHaveProperty('config');
    expect(subCommands.generate?.args).toHaveProperty('strict-keys');
    expect(subCommands.migrate?.args).toHaveProperty('skip-preflight');
  });

  it('syncDatabaseMigrations enforces ON_ERROR_STOP=1, transactional pre-flight, postMigrateSql, and schema reload', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-sync-'));
    tempDirs.push(tmpDir);
    fs.writeFileSync(path.join(tmpDir, '20261101100000_init.sql'), 'CREATE TABLE items (id int);');
    fs.writeFileSync(
      path.join(tmpDir, '20261102100000_idx.sql'),
      'CREATE INDEX CONCURRENTLY idx_items ON items(id);'
    );

    const stderrChunks: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrChunks.push(String(chunk));
      return true;
    });
    execFileSyncMock.mockImplementation(() => '');

    const res = syncDatabaseMigrations('demo-db', tmpDir, {
      postMigrateSql: 'GRANT SELECT ON items TO anon;'
    });

    expect(res).toStrictEqual({
      applied: ['20261101100000', '20261102100000'],
      skipped: 0
    });
    expect(stderrChunks.join('')).toContain('20261102100000_idx.sql');

    const calls = execFileSyncMock.mock.calls;
    for (const [cmd, args] of calls) {
      expect(cmd).toBe('docker');
      expect(args).toContain('-v');
      expect(args).toContain('ON_ERROR_STOP=1');
    }

    const inputs = calls.map((c) => (c[2] as { input?: string } | undefined)?.input ?? '');
    expect(inputs.some((sql) => sql.startsWith('BEGIN;\nCREATE TABLE items'))).toBe(true);
    expect(inputs.some((sql) => sql.includes('BEGIN;\nCREATE INDEX CONCURRENTLY'))).toBe(false);
    expect(inputs.some((sql) => sql.includes('GRANT SELECT ON items TO anon;'))).toBe(true);
    expect(inputs.at(-1)).toBe("NOTIFY pgrst, 'reload schema';");
  });

  it('syncDatabaseMigrations skips transactional pre-flight when preflightDryRun is false', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-sync-nopre-'));
    tempDirs.push(tmpDir);
    fs.writeFileSync(path.join(tmpDir, '20261101100000_init.sql'), 'CREATE TABLE items (id int);');

    execFileSyncMock.mockImplementation(() => '');
    syncDatabaseMigrations('demo-db', tmpDir, { preflightDryRun: false });

    const inputs = execFileSyncMock.mock.calls.map(
      (c) => (c[2] as { input?: string } | undefined)?.input ?? ''
    );
    expect(inputs.some((sql) => sql.startsWith('BEGIN;\n'))).toBe(false);
  });

  it('composeDown and composeRestart forward --env-file and -v flags', () => {
    composeDown('/tmp/demo/docker-compose.yml', {
      removeVolumes: true,
      envFilePath: '/tmp/demo/.env'
    });
    composeRestart('/tmp/demo/docker-compose.yml', '/tmp/demo/.env');

    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      1,
      'docker',
      [
        'compose',
        '-f',
        '/tmp/demo/docker-compose.yml',
        '--env-file',
        '/tmp/demo/.env',
        'down',
        '-v'
      ],
      { cwd: '/tmp/demo', stdio: 'inherit' }
    );
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      2,
      'docker',
      ['compose', '-f', '/tmp/demo/docker-compose.yml', '--env-file', '/tmp/demo/.env', 'restart'],
      { cwd: '/tmp/demo', stdio: 'inherit' }
    );
  });

  it('add-server preserves existing keys and skips Docker secret generation for --deployMode cloud', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-add-srv-'));
    tempDirs.push(tmpRoot);
    fs.mkdirSync(path.join(tmpRoot, '.auditor'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, '.auditor', 'audit.config.ts'),
      `export default {
  supabaseDocker: {
    enabled: true,
    projectSlug: 'demo',
    upstreamRef: 'master',
    supabaseDir: 'supabase',
    masterEnvFile: '.env',
    postgres: { expectedMajor: 17 },
    profiles: {}
  }
};
`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmpRoot, '.env'),
      '# === [ SERVIDOR: prod ] ===\nSERVER_prod_CUSTOM_KEEP=keep-me\n',
      'utf8'
    );

    const subCommands = supabaseManageCommand.subCommands as Record<
      string,
      { readonly run?: (ctx: { readonly args: Record<string, unknown> }) => Promise<void> }
    >;

    process.env.AUDIT_PROJECT_ROOT = tmpRoot;
    try {
      await subCommands['add-server']?.run?.({
        args: {
          project: tmpRoot,
          name: 'prod',
          'non-interactive': true,
          deployMode: 'cloud',
          region: 'us-east-1'
        }
      });

      const envAfter = fs.readFileSync(path.join(tmpRoot, '.env'), 'utf8');
      expect(envAfter).toContain('SERVER_prod_CUSTOM_KEEP=keep-me');
      expect(envAfter).toContain('SERVER_prod_DEPLOY_MODE=cloud');
      expect(envAfter).toContain('SERVER_prod_REGION=us-east-1');
      expect(envAfter).not.toContain('SERVER_prod_POSTGRES_PASSWORD=');
      expect(envAfter).not.toContain('SERVER_prod_JWT_SECRET=');
    } finally {
      delete process.env.AUDIT_PROJECT_ROOT;
    }
  });
});
