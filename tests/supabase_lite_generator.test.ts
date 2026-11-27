import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vite-plus/test';

import {
  SUPABASE_DOCKER_SCHEMA_VERSION,
  generateLiteBootstrapSql,
  generateLiteComposeYaml,
  generateLiteNginxConf,
  resolveLiteCredentials,
  writeLiteProfileArtifacts,
  type SupabaseDockerConfig
} from '../src/supabase/index.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('liteStackGenerator', () => {
  it('generates nginx proxy, bootstrap SQL, and tmpfs compose YAML', () => {
    const nginx = generateLiteNginxConf('demo-test-rest');
    expect(nginx).toContain('proxy_pass http://demo-test-rest:3000/;');

    const sql = generateLiteBootstrapSql('super-secret', 'pgpass123');
    expect(sql).toContain('supabase_migrations.schema_migrations');
    expect(sql).toContain('CREATE ROLE authenticator');
    expect(sql).toContain('ALTER ROLE postgres WITH LOGIN PASSWORD');

    const compose = generateLiteComposeYaml(
      {
        projectSlug: 'demo',
        profileName: 'test',
        profile: {
          enabled: true,
          storage: 'tmpfs',
          images: {
            postgres: 'supabase/postgres:17.6.1.136',
            postgrest: 'postgrest/postgrest:v14.18',
            nginx: 'nginx:1.29-alpine'
          },
          ports: { postgres: 5433, gateway: 8001 },
          schemas: ['public', 'storage'],
          autoSyncMigrations: true,
          dbEnv: new Map([['POSTGRES_INITDB_ARGS', '--encoding=UTF8']]),
          restEnv: new Map([['PGRST_DB_MAX_ROWS', '500']])
        }
      },
      { postgresPassword: 'pg@pass#123', jwtSecret: 'jwtsecret123' },
      'services:\n  demo-test-rest:\n    environment:\n      PGRST_LOG_LEVEL: info\n'
    );
    expect(
      compose.startsWith(`# @auditor-supabase-schema: ${SUPABASE_DOCKER_SCHEMA_VERSION}\n`)
    ).toBe(true);
    expect(compose).not.toContain('PGRST_DB_USE_LEGACY_GUCS');
    expect(compose).toContain('/var/lib/postgresql/data');
    expect(compose).toContain('5433:5432');
    expect(compose).toContain('8001:80');
    expect(compose).toContain('PGRST_SERVER_HOST: 0.0.0.0');
    expect(compose).toContain('PGRST_ADMIN_SERVER_PORT: 3001');
    expect(compose).toContain('POSTGRES_INITDB_ARGS: --encoding=UTF8');
    expect(compose).toContain('PGRST_DB_MAX_ROWS: "500"');
    expect(compose).toContain('PGRST_LOG_LEVEL: info');
    expect(compose).toContain(
      'postgres://authenticator:pg%40pass%23123@demo-test-db:5432/postgres'
    );
    expect(compose).toContain('condition: service_healthy');
  });

  it('resolves credentials from masterEnvFile first, then creates and reuses profile-local .env', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-lite-'));
    tempDirs.push(tmpRoot);
    process.env.AUDIT_PROJECT_ROOT = tmpRoot;
    try {
      const config: SupabaseDockerConfig = {
        enabled: true,
        projectSlug: 'demo',
        upstreamRef: 'self-hosted/v0.8.5',
        supabaseDir: 'supabase',
        masterEnvFile: '.env',
        postgres: { expectedMajor: 17 },
        profiles: {
          lite: new Map([
            [
              'test',
              {
                enabled: true,
                storage: 'tmpfs',
                images: {
                  postgres: 'supabase/postgres:17.6.1.136',
                  postgrest: 'postgrest/postgrest:v14.18',
                  nginx: 'nginx:1.29-alpine'
                },
                ports: { postgres: 5433, gateway: 8001 },
                schemas: ['public'],
                autoSyncMigrations: true
              }
            ]
          ])
        }
      };

      const generated = await writeLiteProfileArtifacts(tmpRoot, config, 'test');
      expect(fs.existsSync(generated.composePath)).toBe(true);
      expect(fs.existsSync(generated.envFilePath)).toBe(true);
      expect(fs.existsSync(path.join(path.dirname(generated.composePath), 'bootstrap.sql'))).toBe(
        false
      );
      expect(generated.bootstrapSql).toContain('supabase_migrations.schema_migrations');

      const second = await resolveLiteCredentials(tmpRoot, config, 'test');
      expect(second.envFilePath).toBe(generated.envFilePath);

      fs.writeFileSync(
        path.join(tmpRoot, '.env'),
        'LITE_TEST_POSTGRES_PASSWORD=MasterPass123\nLITE_TEST_JWT_SECRET=MasterJwtSecret12345678901234567890\n'
      );
      const fromMaster = await resolveLiteCredentials(tmpRoot, config, 'test');
      expect(fromMaster.postgresPassword).toBe('MasterPass123');

      fs.writeFileSync(
        path.join(tmpRoot, '.env'),
        'LITE_TEST_POSTGRES_PASSWORD=this_password_is_insecure_and_should_be_updated\nLITE_TEST_JWT_SECRET=valid_jwt_secret_123456789012345678901234567890\n'
      );
      const fallbackFromPlaceholder = await resolveLiteCredentials(tmpRoot, config, 'test');
      expect(fallbackFromPlaceholder.postgresPassword).not.toContain('this_password_is_insecure');

      const { resolveLiteRuntimeEnv, generateLiteComposeYaml, generateLiteNginxConf } =
        await import('../src/supabase/liteStackGenerator.ts');
      const runtimeEnv = await resolveLiteRuntimeEnv(tmpRoot, config, 'test');
      expect(runtimeEnv.url).toBe('http://127.0.0.1:8001');
      expect(runtimeEnv.anonKey.split('.')).toHaveLength(3);
      expect(runtimeEnv.serviceRoleKey.split('.')).toHaveLength(3);
      expect(runtimeEnv.postgresUrl).toContain('127.0.0.1:5433/postgres');

      const customCompose = generateLiteComposeYaml(
        {
          projectSlug: 'demo',
          profileName: 'dev',
          profile: {
            ...config.profiles.lite!.get('test')!,
            storage: 'volume',
            volumeName: 'custom_pgdata',
            externalVolume: true
          }
        },
        { postgresPassword: 'p', jwtSecret: 's' }
      );
      expect(customCompose).toContain('custom_pgdata:/var/lib/postgresql/data');
      expect(customCompose).toContain('external: true');

      const nginxConf = generateLiteNginxConf('demo-dev-rest', {
        clientMaxBodySize: '200m',
        proxyRoot: true
      });
      expect(nginxConf).toContain('client_max_body_size 200m;');
      expect(nginxConf).toContain('location / {');
    } finally {
      delete process.env.AUDIT_PROJECT_ROOT;
    }
  });
});
