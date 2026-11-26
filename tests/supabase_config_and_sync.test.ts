import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { defineAuditConfig } from '../src/core/auditConfig.ts';
import {
  CORE_GITIGNORE_REQUIREMENTS,
  resolveGitIgnoreRequirement
} from '../src/core/gitIgnoreRegistry.ts';
import {
  DEFAULT_SUPABASE_DOCKER_CONFIG,
  generateCustomDbDockerfile,
  inspectUpstreamCompose,
  parsePostgresMajorVersion,
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
    expect(dockerfile).toContain('FROM supabase/postgres:17.6.1.136');
    expect(dockerfile).toContain('COPY init/ /docker-entrypoint-initdb.d/');
    expect(dockerfile).not.toContain('COPY volumes/realtime /supabase-volumes/realtime');

    const tmpDockerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-df-'));
    try {
      fs.mkdirSync(path.join(tmpDockerDir, 'volumes', 'api'), { recursive: true });
      fs.mkdirSync(path.join(tmpDockerDir, 'volumes', 'db'), { recursive: true });
      fs.writeFileSync(path.join(tmpDockerDir, 'volumes', 'db', 'roles.sql'), '-- roles');
      const dynamicDf = generateCustomDbDockerfile(meta.postgresImage, 'demo-app', tmpDockerDir);
      expect(dynamicDf).toContain('COPY volumes/api /supabase-volumes/api');
      expect(dynamicDf).toContain(
        'COPY volumes/db/roles.sql /docker-entrypoint-initdb.d/init-scripts/99-roles.sql'
      );
      expect(dynamicDf).not.toContain('volumes/logs');
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
                postGenerateCommand: 'npm run servers:configure'
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
  });
});
