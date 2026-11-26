import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import {
  extractComposeEnvPlaceholders,
  transformLocalFullComposeYaml,
  transformRemoteComposeYaml,
  type SupabaseDockerConfig
} from '../src/supabase/index.ts';

const ENVOY_FIXTURE = fs.readFileSync(
  path.resolve(process.cwd(), 'tests/fixtures/supabase/docker-compose.envoy.fixture.yml'),
  'utf8'
);
const LOGS_FIXTURE = fs.readFileSync(
  path.resolve(process.cwd(), 'tests/fixtures/supabase/docker-compose.logs.fixture.yml'),
  'utf8'
);

const BASE_CONFIG: SupabaseDockerConfig = {
  enabled: true,
  projectSlug: 'demo',
  upstreamRef: 'self-hosted/v0.8.5',
  supabaseDir: 'supabase',
  masterEnvFile: '.env',
  postgres: { expectedMajor: 17 },
  profiles: {
    remote: {
      enabled: true,
      includeLogs: true,
      image: { user: 'francogp', repo: 'demo-db', tag: 'latest' },
      volumes: {
        shared: 'supabase-volumes-v2',
        dbData: 'db-data-v3',
        dbConfig: 'db-config-v3',
        storage: 'storage-data'
      },
      security: { bindLoopback: true }
    },
    localFull: {
      enabled: true,
      includeLogs: false,
      realtimeTenantName: 'realtime-dev',
      ports: { api: 8010, postgres: 5442, pooler: 6553, studio: 3010 },
      autoApplyMigrations: true
    }
  }
};

describe('composeAstEngine', () => {
  it('transforms official upstream Envoy compose to bind-mount-free remote stack with 0 residual ./volumes/', () => {
    const result = transformRemoteComposeYaml(ENVOY_FIXTURE, BASE_CONFIG, {
      logsComposeYaml: LOGS_FIXTURE
    });
    expect(result.report.valid).toBe(true);
    expect(result.report.errors).toStrictEqual([]);
    expect(result.yaml).toContain('supabase-config-init');
    expect(result.yaml).toContain('cp -rf /supabase-volumes/api/envoy/* /etc/envoy/');
    expect(result.yaml).toContain('container_name: demo-supabase-db');
    expect(result.yaml).toContain('/supabase-volumes/realtime/docker-entrypoint.sh');
    expect(result.yaml).toMatch(/ENABLED_FEATURES_LOGS_ALL:\s*['"]true['"]/u);
    expect(result.yaml).toContain('deno-cache:');
    expect(result.yaml).toContain('127.0.0.1:');
    expect(result.yaml).not.toContain('./volumes/');
  });

  it('deep-merges overlay environment maps, avoids duplicate 127.0.0.1 loopback prefix, and leaves realtime untouched when upstream has no realtime volume', () => {
    const withoutRealtimeVol = ENVOY_FIXTURE.replace(
      "- '8000:8000/tcp'",
      "- '127.0.0.1:8000:8000/tcp'"
    ).replace(/\s*-\s*\.\/volumes\/realtime[^\n]*/gu, '');
    const result = transformRemoteComposeYaml(withoutRealtimeVol, BASE_CONFIG, {
      overlayYaml: `
services:
  rest:
    environment:
      GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: '15'
`
    });
    expect(result.report.valid).toBe(true);
    expect(result.yaml).toContain('GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL');
    expect(result.yaml).toContain('PGRST_DB_URI');
    expect(result.yaml).not.toContain('127.0.0.1:127.0.0.1:');
    expect(result.yaml).not.toContain('/supabase-volumes/realtime/docker-entrypoint.sh');
  });

  it('fails loud on PostgreSQL major version mismatch', () => {
    const result = transformRemoteComposeYaml(ENVOY_FIXTURE, {
      ...BASE_CONFIG,
      postgres: { expectedMajor: 15 }
    });
    expect(result.report.valid).toBe(false);
    expect(result.report.errors[0]).toContain('upgrade-pg');
  });

  it('fails loud if an unknown relative bind-mount remains in services', () => {
    const withUnknown = ENVOY_FIXTURE.replace(
      'container_name: supabase-rest',
      'container_name: supabase-rest\n    volumes:\n      - ./volumes/custom:/custom:ro'
    );
    const result = transformRemoteComposeYaml(withUnknown, BASE_CONFIG);
    expect(result.report.valid).toBe(false);
    expect(result.report.errors.some((e) => e.includes('./volumes/custom'))).toBe(true);
  });

  it('transforms localFull with prefixed container_name and realtime tenant subdomain', () => {
    const result = transformLocalFullComposeYaml(ENVOY_FIXTURE, BASE_CONFIG);
    expect(result.report.valid).toBe(true);
    expect(result.yaml).toContain('container_name: demo-supabase-db');
    expect(result.yaml).toContain('container_name: realtime-dev.demo-realtime');
    expect(result.yaml).toContain('8010:8000/tcp');
  });

  it('rejects localFull when upstream PostgreSQL major mismatches expectedMajor without allowMajorUpgrade', () => {
    const mismatchedConfig: SupabaseDockerConfig = {
      ...BASE_CONFIG,
      postgres: { expectedMajor: 18, allowMajorUpgrade: false }
    };
    const result = transformLocalFullComposeYaml(ENVOY_FIXTURE, mismatchedConfig);
    expect(result.report.valid).toBe(false);
    expect(result.report.errors[0]).toContain('expectedMajor (18)');
  });

  it('extracts compose environment placeholders', () => {
    const placeholders = extractComposeEnvPlaceholders(ENVOY_FIXTURE);
    expect(placeholders).toContain('POSTGRES_PASSWORD');
    expect(placeholders).toContain('JWT_SECRET');
  });
});
