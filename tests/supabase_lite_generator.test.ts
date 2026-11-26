import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vite-plus/test';

import {
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
          autoSyncMigrations: true
        }
      },
      { postgresPassword: 'pgpass123', jwtSecret: 'jwtsecret123' }
    );
    expect(compose).toContain('/var/lib/postgresql/data');
    expect(compose).toContain('5433:5432');
    expect(compose).toContain('8001:80');
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
    } finally {
      delete process.env.AUDIT_PROJECT_ROOT;
    }
  });
});
