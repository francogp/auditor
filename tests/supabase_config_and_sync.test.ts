import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { buildQuietNodeEnv, NODE_PERMISSION_WARNING_FLAGS } from '../src/cli/cliUtils.ts';
import { defineAuditConfig } from '../src/core/auditConfig.ts';
import {
  CORE_GITIGNORE_REQUIREMENTS,
  resolveGitIgnoreRequirement
} from '../src/core/gitIgnoreRegistry.ts';
import {
  buildUpstreamCloneGitSteps,
  DEFAULT_SUPABASE_DOCKER_CONFIG,
  generateCustomDbDockerfile,
  inspectUpstreamCompose,
  parsePostgresMajorVersion,
  parseSupabaseSchemaHeader,
  regenerateCustomDbDockerfile,
  stampSupabaseSchemaHeader,
  SUPABASE_DOCKER_SCHEMA_VERSION,
  syncUpstreamDockerTree,
  validateSupabaseDockerConfig,
  type SupabaseDockerConfig
} from '../src/supabase/index.ts';

describe('supabaseConfigTypes & upstreamSync', () => {
  it('allows disabled DEFAULT_SUPABASE_DOCKER_CONFIG with zero validation errors', () => {
    expect(validateSupabaseDockerConfig(DEFAULT_SUPABASE_DOCKER_CONFIG)).toStrictEqual([]);
  });

  it('requires all mandatory fields when supabaseDocker.enabled is true', () => {
    const incomplete: SupabaseDockerConfig = {
      ...DEFAULT_SUPABASE_DOCKER_CONFIG,
      enabled: true,
      profiles: {
        remote: {
          enabled: true,
          includeLogs: false,
          image: { user: '', repo: '', tag: '' },
          volumes: { shared: '', dbData: '', dbConfig: '', storage: '' },
          security: { bindLoopback: true }
        }
      }
    };
    const errors = validateSupabaseDockerConfig(incomplete);
    expect(errors.length).toBeGreaterThanOrEqual(10);
    expect(errors.some((e) => e.includes('upstreamRef'))).toBe(true);
    expect(errors.some((e) => e.includes('profiles.remote.image.user'))).toBe(true);
  });

  it('parses 4-segment and v-prefixed PostgreSQL image tags', () => {
    expect(parsePostgresMajorVersion('17.6.1.136')).toBe(17);
    expect(parsePostgresMajorVersion('v17.6')).toBe(17);
    expect(() => parsePostgresMajorVersion('latest')).toThrowError(/Unable to parse/);
  });

  it('inspects upstream Envoy compose and generates dynamic Dockerfile', () => {
    const sample = `
services:
  api-gw:
    image: envoyproxy/envoy:v1.39.1
  rest:
    image: postgrest/postgrest:v14.18
  db:
    image: supabase/postgres:17.6.1.136
`;
    const meta = inspectUpstreamCompose(sample);
    expect(meta.postgresMajor).toBe(17);
    expect(meta.postgresTag).toBe('17.6.1.136');
    expect(meta.gatewayService).toBe('api-gw');

    const dockerfile = generateCustomDbDockerfile(meta.postgresImage, 'demo-app');
    expect(
      dockerfile.startsWith(`# @auditor-supabase-schema: ${SUPABASE_DOCKER_SCHEMA_VERSION}\n`)
    ).toBe(true);
    expect(parseSupabaseSchemaHeader(dockerfile)).toBe(SUPABASE_DOCKER_SCHEMA_VERSION);
    expect(parseSupabaseSchemaHeader('FROM postgres:17\n')).toBeNull();
    expect(
      parseSupabaseSchemaHeader(
        stampSupabaseSchemaHeader('# @auditor-supabase-schema: 1\nFROM postgres:17\n')
      )
    ).toBe(SUPABASE_DOCKER_SCHEMA_VERSION);
    expect(dockerfile).toContain('FROM supabase/postgres:17.6.1.136');
    expect(dockerfile).toContain('COPY init/ /docker-entrypoint-initdb.d/');
    expect(dockerfile).not.toContain('COPY volumes/realtime /supabase-volumes/realtime');

    const tmpDockerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-df-'));
    try {
      fs.mkdirSync(path.join(tmpDockerDir, 'volumes', 'api'), { recursive: true });
      fs.mkdirSync(path.join(tmpDockerDir, 'volumes', 'db'), { recursive: true });
      fs.mkdirSync(path.join(tmpDockerDir, 'volumes', 'storage'), { recursive: true });
      fs.writeFileSync(path.join(tmpDockerDir, 'volumes', 'db', 'roles.sql'), '-- roles');
      const dynamicDf = generateCustomDbDockerfile(meta.postgresImage, 'demo-app', tmpDockerDir);
      expect(dynamicDf).toContain('COPY volumes/api /supabase-volumes/api');
      expect(dynamicDf).toContain(
        'COPY volumes/db/roles.sql /docker-entrypoint-initdb.d/init-scripts/99-roles.sql'
      );
      expect(dynamicDf).not.toContain('volumes/logs');
      expect(dynamicDf).not.toContain('volumes/storage');
      expect(dynamicDf).not.toContain('volumes/db/jwt.sql');
    } finally {
      fs.rmSync(tmpDockerDir, { recursive: true, force: true });
    }
  });

  it('resolves dynamic .gitignore patterns from supabaseDir and normalizes extraEnvVars', () => {
    const cfg = defineAuditConfig({
      name: 'SupaTest',
      supabaseDocker: {
        ...DEFAULT_SUPABASE_DOCKER_CONFIG,
        enabled: true,
        projectSlug: 'demo',
        upstreamRef: 'self-hosted/v0.8.5',
        supabaseDir: 'infra/supa/',
        masterEnvFile: '.env',
        postgres: { expectedMajor: 17 },
        extensions: {
          extraEnvVars: new Map([['CUSTOM_FLAG', '1']])
        },
        profiles: {}
      }
    });
    expect(cfg.supabaseDocker?.extensions?.extraEnvVars?.get('CUSTOM_FLAG')).toBe('1');

    const supaReqs = CORE_GITIGNORE_REQUIREMENTS.filter((r) => r.id.startsWith('supabase-docker-'));
    expect(supaReqs).toHaveLength(2);
    const resolved = supaReqs.map((r) => resolveGitIgnoreRequirement(r, cfg));
    expect(resolved.map((r) => r.pattern)).toStrictEqual([
      'infra/supa/docker/',
      'infra/supa/generated/'
    ]);
  });

  it('defineAuditConfig preserves all v10.15.x supabaseDocker fields across localFull, lite, and extensions', () => {
    const cfg = defineAuditConfig({
      name: 'SupaPreserve',
      supabaseDocker: {
        ...DEFAULT_SUPABASE_DOCKER_CONFIG,
        enabled: true,
        projectSlug: 'ipdiff3',
        upstreamRef: 'master',
        supabaseDir: 'supabase',
        masterEnvFile: '.env',
        postgres: { expectedMajor: 17, allowMajorUpgrade: false },
        extensions: {
          extraEnvVars: new Map([['K', 'V']]),
          customComposeOverlay: 'supabase/overlay.yml',
          postMigrateSql: 'NOTIFY pgrst;',
          initDir: 'supabase/init'
        },
        profiles: {
          localFull: {
            enabled: true,
            includeLogs: false,
            realtimeTenantName: 'local',
            ports: { api: 8000, postgres: 5432, pooler: 6543, studio: 3000 },
            autoApplyMigrations: true,
            postGenerateCommand: 'npm run servers:configure'
          },
          lite: new Map([
            [
              'dev',
              {
                enabled: true,
                storage: 'volume',
                volumeName: 'supabase_ipdiff3_pgdata',
                externalVolume: true,
                images: {
                  postgres: 'supabase/postgres:17.6.1.136',
                  postgrest: 'postgrest/postgrest:v14.18',
                  nginx: 'nginx:alpine'
                },
                ports: { postgres: 5434, gateway: 8002 },
                schemas: ['public'],
                autoSyncMigrations: true,
                nginx: {
                  clientMaxBodySize: '100m',
                  proxyRoot: false,
                  extraDirectives: 'proxy_read_timeout 60s;'
                },
                postGenerateCommand: 'npm run servers:configure',
                dbEnv: new Map([['PG_EXTRA', '1']]),
                restEnv: new Map([['PGRST_DB_MAX_ROWS', '500']]),
                customComposeOverlay: 'supabase/lite.overlay.yml'
              }
            ]
          ])
        }
      }
    });

    expect(cfg.supabaseDocker?.extensions?.postMigrateSql).toBe('NOTIFY pgrst;');
    expect(cfg.supabaseDocker?.extensions?.initDir).toBe('supabase/init');
    expect(cfg.supabaseDocker?.profiles.localFull?.postGenerateCommand).toBe(
      'npm run servers:configure'
    );
    const devLite = cfg.supabaseDocker?.profiles.lite?.get('dev');
    expect(devLite?.volumeName).toBe('supabase_ipdiff3_pgdata');
    expect(devLite?.externalVolume).toBe(true);
    expect(devLite?.nginx).toStrictEqual({
      clientMaxBodySize: '100m',
      proxyRoot: false,
      extraDirectives: 'proxy_read_timeout 60s;'
    });
    expect(devLite?.postGenerateCommand).toBe('npm run servers:configure');
    expect(devLite?.dbEnv?.get('PG_EXTRA')).toBe('1');
    expect(devLite?.restEnv?.get('PGRST_DB_MAX_ROWS')).toBe('500');
    expect(devLite?.customComposeOverlay).toBe('supabase/lite.overlay.yml');
  });

  it('syncUpstreamDockerTree preserves local runtime volumes, .env, init, and Dockerfile without EACCES', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-sync-tree-'));
    const srcDir = path.join(tmpRoot, 'upstream-docker');
    const dstDir = path.join(tmpRoot, 'project-docker');
    const lockedDataDir = path.join(dstDir, 'volumes', 'db', 'data');
    try {
      fs.mkdirSync(path.join(srcDir, 'volumes', 'api'), { recursive: true });
      fs.mkdirSync(path.join(srcDir, 'volumes', 'db'), { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, 'docker-compose.yml'),
        'services:\n  db:\n    image: supabase/postgres:17.6.1.136\n'
      );
      fs.writeFileSync(path.join(srcDir, 'volumes', 'api', 'kong.yml'), '_format_version: "2.1"\n');
      fs.writeFileSync(path.join(srcDir, 'volumes', 'db', 'roles.sql'), '-- new roles\n');
      fs.mkdirSync(path.join(srcDir, 'init'), { recursive: true });
      fs.writeFileSync(path.join(srcDir, '.env'), 'OVERWRITE=nope\n');
      fs.writeFileSync(path.join(srcDir, 'Dockerfile'), 'FROM scratch\n');
      fs.writeFileSync(path.join(srcDir, 'init', '00-custom.sql'), '-- overwrite nope\n');

      fs.mkdirSync(lockedDataDir, { recursive: true });
      fs.mkdirSync(path.join(dstDir, 'volumes', 'storage'), { recursive: true });
      fs.mkdirSync(path.join(dstDir, 'volumes', 'obsolete-dir'), { recursive: true });
      fs.mkdirSync(path.join(dstDir, 'init'), { recursive: true });
      fs.writeFileSync(path.join(dstDir, 'docker-compose.yml'), 'stale-compose');
      fs.writeFileSync(path.join(dstDir, 'obsolete-file.txt'), 'remove-me');
      fs.writeFileSync(path.join(dstDir, 'volumes', 'obsolete-dir', 'old.txt'), 'remove-me');
      fs.writeFileSync(path.join(dstDir, '.env'), 'LOCAL_SECRET=keep\n');
      fs.writeFileSync(path.join(dstDir, 'Dockerfile'), 'FROM keep-local\n');
      fs.writeFileSync(path.join(dstDir, 'init', '00-custom.sql'), '-- keep\n');
      fs.writeFileSync(path.join(lockedDataDir, 'PG_VERSION'), '17\n');
      fs.writeFileSync(path.join(dstDir, 'volumes', 'storage', 'blob.bin'), 'keep-storage');

      if (process.platform !== 'win32') {
        fs.chmodSync(lockedDataDir, 0o000);
      }

      await syncUpstreamDockerTree(srcDir, dstDir);

      if (process.platform !== 'win32') {
        fs.chmodSync(lockedDataDir, 0o755);
      }

      expect(fs.readFileSync(path.join(dstDir, 'docker-compose.yml'), 'utf8')).toContain(
        'supabase/postgres:17.6.1.136'
      );
      expect(fs.readFileSync(path.join(dstDir, 'volumes', 'db', 'roles.sql'), 'utf8')).toBe(
        '-- new roles\n'
      );
      expect(fs.existsSync(path.join(dstDir, 'obsolete-file.txt'))).toBe(false);
      expect(fs.existsSync(path.join(dstDir, 'volumes', 'obsolete-dir'))).toBe(false);
      expect(fs.readFileSync(path.join(dstDir, '.env'), 'utf8')).toBe('LOCAL_SECRET=keep\n');
      expect(fs.readFileSync(path.join(dstDir, 'Dockerfile'), 'utf8')).toBe('FROM keep-local\n');
      expect(fs.readFileSync(path.join(dstDir, 'init', '00-custom.sql'), 'utf8')).toBe('-- keep\n');
      expect(fs.readFileSync(path.join(lockedDataDir, 'PG_VERSION'), 'utf8')).toBe('17\n');
      expect(fs.readFileSync(path.join(dstDir, 'volumes', 'storage', 'blob.bin'), 'utf8')).toBe(
        'keep-storage'
      );

      const freshDst = path.join(tmpRoot, 'nested', 'fresh-docker');
      await syncUpstreamDockerTree(srcDir, freshDst);
      expect(fs.readFileSync(path.join(freshDst, 'docker-compose.yml'), 'utf8')).toContain(
        'supabase/postgres:17.6.1.136'
      );
    } finally {
      if (process.platform !== 'win32' && fs.existsSync(lockedDataDir)) {
        fs.chmodSync(lockedDataDir, 0o755);
      }
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('regenerateCustomDbDockerfile stamps schema header on existing docker/ without cloning', async () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-regen-df-'));
    const prevAuditRoot = process.env.AUDIT_PROJECT_ROOT;
    process.env.AUDIT_PROJECT_ROOT = tmpProject;
    try {
      const dockerDir = path.join(tmpProject, 'supabase', 'docker');
      fs.mkdirSync(path.join(dockerDir, 'volumes', 'api'), { recursive: true });
      fs.writeFileSync(
        path.join(dockerDir, 'docker-compose.yml'),
        'services:\n  api-gw:\n    image: envoyproxy/envoy:v1.39.1\n  db:\n    image: supabase/postgres:17.6.1.136\n'
      );
      fs.writeFileSync(path.join(dockerDir, 'Dockerfile'), 'FROM supabase/postgres:17.6.1.136\n');

      const cfg: SupabaseDockerConfig = {
        ...DEFAULT_SUPABASE_DOCKER_CONFIG,
        enabled: true,
        projectSlug: 'regen-app',
        upstreamRef: 'master',
        supabaseDir: 'supabase',
        masterEnvFile: '.env',
        postgres: { expectedMajor: 17 },
        profiles: {}
      };

      const meta = await regenerateCustomDbDockerfile(tmpProject, cfg);
      expect(meta.postgresTag).toBe('17.6.1.136');
      const updated = fs.readFileSync(path.join(dockerDir, 'Dockerfile'), 'utf8');
      expect(parseSupabaseSchemaHeader(updated)).toBe(SUPABASE_DOCKER_SCHEMA_VERSION);
      expect(updated).toContain('COPY volumes/api /supabase-volumes/api');
    } finally {
      if (prevAuditRoot === undefined) delete process.env.AUDIT_PROJECT_ROOT;
      else process.env.AUDIT_PROJECT_ROOT = prevAuditRoot;
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  it('buildUpstreamCloneGitSteps uses --filter=blob:none and quiet git flags for commit SHAs and branches', () => {
    const shaSteps = buildUpstreamCloneGitSteps(
      '832d238af3ff9750c388b1bb93a131ea4ddf5702',
      '/tmp/supa-clone'
    );
    expect(shaSteps[0]?.args).toStrictEqual(['-c', 'init.defaultBranch=main', 'init']);
    expect(shaSteps[2]?.args).toStrictEqual(['sparse-checkout', 'set', 'docker']);
    expect(shaSteps[3]?.args).toStrictEqual([
      'fetch',
      '--depth',
      '1',
      '--filter=blob:none',
      'origin',
      '832d238af3ff9750c388b1bb93a131ea4ddf5702'
    ]);
    expect(shaSteps[4]?.args).toStrictEqual([
      '-c',
      'advice.detachedHead=false',
      'checkout',
      'FETCH_HEAD'
    ]);

    const branchSteps = buildUpstreamCloneGitSteps('master', '/tmp/supa-clone');
    expect(branchSteps[0]?.cwdMode).toBe('project');
    expect(branchSteps[0]?.args).toContain('--filter=blob:none');
    expect(branchSteps[0]?.args).toContain('--sparse');
    expect(branchSteps[1]?.args).toStrictEqual(['sparse-checkout', 'set', 'docker']);
  });

  it('buildQuietNodeEnv appends missing Node permission warning flags without duplication', () => {
    const cleanEnv = buildQuietNodeEnv({ NODE_OPTIONS: '--max-old-space-size=4096' });
    for (const flag of NODE_PERMISSION_WARNING_FLAGS) {
      expect(cleanEnv.NODE_OPTIONS).toContain(flag);
    }
    expect(cleanEnv.NODE_OPTIONS).toContain('--max-old-space-size=4096');

    const alreadyQuiet = buildQuietNodeEnv({
      NODE_OPTIONS: NODE_PERMISSION_WARNING_FLAGS.join(' ')
    });
    expect(alreadyQuiet.NODE_OPTIONS).toBe(NODE_PERMISSION_WARNING_FLAGS.join(' '));
  });
});
