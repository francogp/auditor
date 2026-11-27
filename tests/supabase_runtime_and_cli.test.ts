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
import { defineAuditConfig } from '../src/core/auditConfigBuilders.ts';
import { resetAuditConfig } from '../src/core/auditConfigLoader.ts';
import {
  applyBootstrapSql,
  composeDown,
  composeRestart,
  composeUp,
  DEFAULT_MIGRATION_EXCLUDE_PATTERNS,
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
  it('lists timestamped SQL migrations in lexicographical order, excluding *.sqlite.sql by default and honoring custom excludePatterns', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-mig-'));
    tempDirs.push(tmpDir);
    fs.writeFileSync(path.join(tmpDir, '20261102120000_second.sql'), 'SELECT 2;');
    fs.writeFileSync(path.join(tmpDir, '20261101100000_first.sql'), 'SELECT 1;');
    fs.writeFileSync(path.join(tmpDir, '20261101150000_local.sqlite.sql'), 'PRAGMA foreign_keys;');
    fs.writeFileSync(
      path.join(tmpDir, '20261103100000_demo.seed.sql'),
      'INSERT INTO t VALUES (1);'
    );
    fs.writeFileSync(path.join(tmpDir, 'notes.md'), 'ignore');

    expect(DEFAULT_MIGRATION_EXCLUDE_PATTERNS).toStrictEqual(['*.sqlite.sql']);
    const ordered = listOrderedMigrationFiles(tmpDir);
    expect(ordered.map((m) => m.version)).toStrictEqual([
      '20261101100000',
      '20261102120000',
      '20261103100000'
    ]);

    const customExcluded = listOrderedMigrationFiles(tmpDir, {
      excludePatterns: ['*.sqlite.sql', '*.seed.sql']
    });
    expect(customExcluded.map((m) => m.version)).toStrictEqual([
      '20261101100000',
      '20261102120000'
    ]);

    const noneExcluded = listOrderedMigrationFiles(tmpDir, { excludePatterns: [] });
    expect(noneExcluded.map((m) => m.version)).toStrictEqual([
      '20261101100000',
      '20261101150000',
      '20261102120000',
      '20261103100000'
    ]);

    expect(listOrderedMigrationFiles(path.join(tmpDir, 'missing'))).toStrictEqual([]);
  });

  it('exports applyBootstrapSql from @francogp/auditor/supabase and preserves migrationExcludePatterns in defineAuditConfig', () => {
    execFileSyncMock.mockImplementation(() => '');
    applyBootstrapSql('demo-db', 'SELECT 1;');
    expect(execFileSyncMock).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['-U', 'supabase_admin']),
      expect.objectContaining({ input: 'SELECT 1;' })
    );

    const cfg = defineAuditConfig({
      name: 'demo',
      supabaseDocker: {
        enabled: true,
        projectSlug: 'demo',
        upstreamRef: 'master',
        supabaseDir: 'supabase',
        masterEnvFile: '.env',
        postgres: { expectedMajor: 17, adminRole: 'custom_admin' },
        extensions: { migrationExcludePatterns: ['*.sqlite.sql', '*.seed.sql'] }
      }
    });
    expect(cfg.supabaseDocker?.postgres.adminRole).toBe('custom_admin');
    expect(cfg.supabaseDocker?.extensions?.migrationExcludePatterns).toStrictEqual([
      '*.sqlite.sql',
      '*.seed.sql'
    ]);
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

  it('syncDatabaseMigrations runs a single combined transactional pre-flight for sequential migrations, postMigrateSql, and schema reload', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-sync-seq-'));
    tempDirs.push(tmpDir);
    fs.writeFileSync(path.join(tmpDir, '20261101100000_init.sql'), 'CREATE TABLE items (id int);');
    fs.writeFileSync(
      path.join(tmpDir, '20261102100000_alter.sql'),
      'ALTER TABLE items ADD COLUMN name text;'
    );

    execFileSyncMock.mockImplementation(() => '');

    const res = syncDatabaseMigrations('demo-db', tmpDir, {
      postMigrateSql: 'GRANT SELECT ON items TO anon;'
    });

    expect(res).toStrictEqual({
      applied: ['20261101100000', '20261102100000'],
      skipped: 0
    });

    const calls = execFileSyncMock.mock.calls;
    for (const [cmd, args] of calls) {
      expect(cmd).toBe('docker');
      expect(args).toContain('-v');
      expect(args).toContain('ON_ERROR_STOP=1');
      expect(args).toContain('supabase_admin');
    }

    const inputs = calls.map((c) => (c[2] as { input?: string } | undefined)?.input ?? '');
    const combinedPreflightIdx = inputs.findIndex(
      (sql) =>
        sql.startsWith('BEGIN;\n') &&
        sql.includes('CREATE TABLE items (id int);') &&
        sql.includes('ALTER TABLE items ADD COLUMN name text;') &&
        sql.endsWith('\nROLLBACK;\n')
    );
    const firstApplyIdx = inputs.indexOf('CREATE TABLE items (id int);');
    expect(combinedPreflightIdx).toBeGreaterThan(-1);
    expect(combinedPreflightIdx).toBeLessThan(firstApplyIdx);
    expect(inputs.filter((sql) => sql.startsWith('BEGIN;\n'))).toHaveLength(1);
    expect(inputs.some((sql) => sql.includes('GRANT SELECT ON items TO anon;'))).toBe(true);
    expect(inputs.at(-1)).toBe("NOTIFY pgrst, 'reload schema';");
  });

  it('syncDatabaseMigrations runs per-file pre-flight before apply when mixed with non-transactional DDL', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-sync-mixed-'));
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

    const res = syncDatabaseMigrations('demo-db', tmpDir);

    expect(res).toStrictEqual({
      applied: ['20261101100000', '20261102100000'],
      skipped: 0
    });
    expect(stderrChunks.join('')).toContain('20261102100000_idx.sql');

    const inputs = execFileSyncMock.mock.calls.map(
      (c) => (c[2] as { input?: string } | undefined)?.input ?? ''
    );
    const preflightInitIdx = inputs.indexOf('BEGIN;\nCREATE TABLE items (id int);\nROLLBACK;\n');
    const applyInitIdx = inputs.indexOf('CREATE TABLE items (id int);');
    expect(preflightInitIdx).toBeGreaterThan(-1);
    expect(applyInitIdx).toBe(preflightInitIdx + 1);
    expect(inputs.some((sql) => sql.includes('BEGIN;\nCREATE INDEX CONCURRENTLY'))).toBe(false);
  });

  it('syncDatabaseMigrations executes via supabase_admin and persists postgres fallback across all queries when role is missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-sync-boot-'));
    tempDirs.push(tmpDir);
    fs.writeFileSync(path.join(tmpDir, '20261101100000_init.sql'), 'CREATE TABLE items (id int);');

    execFileSyncMock.mockImplementationOnce(() => {
      const err = new Error('psql failed') as Error & { stderr: string };
      err.stderr =
        'psql: error: connection to server on socket failed: FATAL:  role "supabase_admin" does not exist';
      throw err;
    });
    execFileSyncMock.mockImplementation(() => '');

    syncDatabaseMigrations('demo-db', tmpDir, {
      bootstrapSql: "ALTER ROLE authenticator WITH LOGIN PASSWORD 'pw';",
      postMigrateSql: 'GRANT SELECT ON items TO anon;'
    });

    expect(execFileSyncMock.mock.calls[0]?.[1]).toContain('supabase_admin');
    for (const call of execFileSyncMock.mock.calls.slice(1)) {
      expect(call[1]).toContain('postgres');
      expect(call[1]).not.toContain('supabase_admin');
    }

    vi.clearAllMocks();
    execFileSyncMock.mockImplementationOnce(() => {
      const err = new Error('syntax error at or near "BAD"') as Error & { stderr: string };
      err.stderr = 'ERROR:  syntax error at or near "BAD"';
      throw err;
    });

    expect(() => syncDatabaseMigrations('demo-db', tmpDir, { bootstrapSql: 'BAD SQL;' })).toThrow(
      'syntax error'
    );
  });

  it('syncDatabaseMigrations honors explicit adminRole for all psql invocations without falling back', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-sync-role-'));
    tempDirs.push(tmpDir);
    fs.writeFileSync(path.join(tmpDir, '20261101100000_init.sql'), 'CREATE TABLE items (id int);');

    execFileSyncMock.mockImplementation(() => '');
    syncDatabaseMigrations('demo-db', tmpDir, {
      adminRole: 'custom_superuser',
      postMigrateSql: 'GRANT SELECT ON items TO anon;'
    });

    for (const call of execFileSyncMock.mock.calls) {
      expect(call[1]).toContain('custom_superuser');
      expect(call[1]).not.toContain('supabase_admin');
    }
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

  it('composeUp supports optional service filtering and lite up boots db -> bootstrap/migrations -> full stack', async () => {
    composeUp('/tmp/demo/docker-compose.yml', '/tmp/demo/.env', ['demo-dev-db']);
    expect(execFileSyncMock).toHaveBeenCalledWith(
      'docker',
      [
        'compose',
        '-f',
        '/tmp/demo/docker-compose.yml',
        '--env-file',
        '/tmp/demo/.env',
        'up',
        '-d',
        '--wait',
        'demo-dev-db'
      ],
      { cwd: '/tmp/demo', stdio: 'inherit' }
    );

    vi.clearAllMocks();
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-lite-up-'));
    tempDirs.push(tmpRoot);
    fs.mkdirSync(path.join(tmpRoot, '.auditor'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'supabase', 'migrations'), { recursive: true });
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
    profiles: {
      lite: {
        dev: {
          enabled: true,
          storage: 'tmpfs',
          images: {
            postgres: 'supabase/postgres:17.6.1.136',
            postgrest: 'postgrest/postgrest:v14.18',
            nginx: 'nginx:alpine'
          },
          ports: { postgres: 5434, gateway: 8002 },
          schemas: ['public'],
          autoSyncMigrations: true
        }
      }
    }
  }
};
`,
      'utf8'
    );

    const subCommands = supabaseManageCommand.subCommands as Record<
      string,
      { readonly run?: (ctx: { readonly args: Record<string, unknown> }) => Promise<void> }
    >;

    process.env.AUDIT_PROJECT_ROOT = tmpRoot;
    try {
      await subCommands.up?.run?.({
        args: { project: tmpRoot, profile: 'dev' }
      });

      const calls = execFileSyncMock.mock.calls.map((c) => c[1]);
      const dbOnlyIdx = calls.findIndex(
        (args) => args.includes('compose') && args.at(-1) === 'demo-dev-db'
      );
      const bootstrapIdx = calls.findIndex(
        (args) => args.includes('psql') && args.includes('supabase_admin')
      );
      const fullStackIdx = calls.findIndex(
        (args) => args.includes('compose') && args.at(-1) === '--wait'
      );

      expect(dbOnlyIdx).toBeGreaterThan(-1);
      expect(bootstrapIdx).toBeGreaterThan(dbOnlyIdx);
      expect(fullStackIdx).toBeGreaterThan(bootstrapIdx);
    } finally {
      delete process.env.AUDIT_PROJECT_ROOT;
    }
  });
});
