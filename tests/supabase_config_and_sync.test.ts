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
    expect(dockerfile).toContain('COPY volumes/realtime /supabase-volumes/realtime');
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
});
