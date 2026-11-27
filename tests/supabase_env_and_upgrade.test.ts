import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vite-plus/test';

import {
  createUpgradeManifest,
  findUpstreamUpgradeScript,
  generateSupabaseKeys,
  listMasterServers,
  upsertServerBlock,
  validateEnvSecrets,
  type SupabaseDockerConfig
} from '../src/supabase/index.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('envOrchestrator & upgradePostgres', () => {
  it('manages master .env server blocks and validates secrets', () => {
    const updated = upsertServerBlock(
      '',
      'prod',
      new Map([
        ['API_EXTERNAL_URL', 'https://api.example.com'],
        ['POSTGRES_PASSWORD', 'ValidAlphaNumPassword123']
      ])
    );
    expect(listMasterServers(updated)).toStrictEqual(['prod']);

    const bad = validateEnvSecrets(
      new Map([
        ['POSTGRES_PASSWORD', 'your-super-secret-password'],
        ['JWT_SECRET', 'abc'],
        ['ANON_KEY', 'abc'],
        ['SERVICE_ROLE_KEY', 'abc'],
        ['DASHBOARD_PASSWORD', 'bad@password!']
      ])
    );
    expect(bad.some((e) => e.includes('placeholder'))).toBe(true);
    expect(bad.some((e) => e.includes('ASCII letters and digits'))).toBe(true);
  });

  it('generates valid HS256 JWT keys via fallback when upstream script is absent', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-env-'));
    tempDirs.push(tmpRoot);
    process.env.AUDIT_PROJECT_ROOT = tmpRoot;
    try {
      const cfg: SupabaseDockerConfig = {
        enabled: true,
        projectSlug: 'demo',
        upstreamRef: 'self-hosted/v0.8.5',
        supabaseDir: 'supabase',
        masterEnvFile: '.env',
        postgres: { expectedMajor: 17 },
        profiles: {}
      };
      const keys = generateSupabaseKeys(tmpRoot, cfg);
      expect(validateEnvSecrets(keys)).toStrictEqual([]);
      expect((keys.get('ANON_KEY') ?? '').split('.')).toHaveLength(3);
      expect((keys.get('ANON_KEY_ASYMMETRIC') ?? '').split('.')).toHaveLength(3);
      expect((keys.get('SERVICE_ROLE_KEY_ASYMMETRIC') ?? '').split('.')).toHaveLength(3);
      expect(JSON.parse(keys.get('JWT_JWKS') ?? '{}').keys).toHaveLength(1);
      expect(keys.get('SUPABASE_PUBLISHABLE_KEY')).toContain('sb_publishable_');
    } finally {
      delete process.env.AUDIT_PROJECT_ROOT;
    }
  });

  it('computes SHA-256 upgrade manifest and discovers upstream upgrade script', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-upg-'));
    tempDirs.push(tmpRoot);
    const utilsDir = path.join(tmpRoot, 'utils');
    fs.mkdirSync(utilsDir, { recursive: true });
    const scriptPath = path.join(utilsDir, 'upgrade-pg17.sh');
    fs.writeFileSync(scriptPath, '#!/usr/bin/env bash\n');

    expect(findUpstreamUpgradeScript(tmpRoot, 17)).toBe(scriptPath);
    expect(findUpstreamUpgradeScript(tmpRoot, 18)).toBeNull();

    const buf = Buffer.from('SELECT 1;\n');
    const expectedSha = crypto.createHash('sha256').update(buf).digest('hex');
    const manifest = createUpgradeManifest({
      fromVolume: 'db-data-v2',
      toVolume: 'db-data-v3',
      fromMajor: 15,
      toMajor: 17,
      backupFile: 'backup.sql',
      backupContent: buf,
      tableCounts: new Map([['users', 10]])
    });
    expect(manifest.sha256).toBe(expectedSha);
  });

  it('discovers flexible server headers, respects managed cloud servers, propagates TENANT_ID, and auto-heals expired JWTs', async () => {
    const {
      listMasterServers,
      isManagedCloudServer,
      isValidHs256Jwt,
      ensureServerKeys,
      generateServerEnvFiles
    } = await import('../src/supabase/envOrchestrator.ts');

    const envText = [
      '# --- [ SERVIDOR 1: local ] ---',
      'SERVER_local_IS_DEFAULT=true',
      'SERVER_local_TENANT_ID=tenant-abc',
      'SERVER_local_POSTGRES_PASSWORD=ValidPass1234567890',
      'SERVER_local_JWT_SECRET=0123456789abcdef0123456789abcdef',
      'SERVER_local_DASHBOARD_PASSWORD=My@Safe!Pass#2026',
      '',
      '# === [ SERVIDOR: cloud ] ===',
      'SERVER_cloud_DEPLOY_MODE=cloud',
      'SERVER_cloud_SUPABASE_PUBLIC_URL=https://demo.supabase.co'
    ].join('\n');

    expect(listMasterServers(envText)).toStrictEqual(['local', 'cloud']);

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-env-full-'));
    tempDirs.push(tmpRoot);
    process.env.AUDIT_PROJECT_ROOT = tmpRoot;
    try {
      fs.writeFileSync(path.join(tmpRoot, '.env'), `${envText}\n`, 'utf8');
      fs.mkdirSync(path.join(tmpRoot, 'supabase', 'docker'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpRoot, 'supabase', 'docker', '.env.example'),
        'POOLER_TENANT_ID=your-tenant-id\nSTORAGE_TENANT_ID=your-tenant-id\n'
      );

      const cfg: SupabaseDockerConfig = {
        enabled: true,
        projectSlug: 'demo',
        upstreamRef: 'master',
        supabaseDir: 'supabase',
        masterEnvFile: '.env',
        postgres: { expectedMajor: 17 },
        profiles: {}
      };

      const emitted = await generateServerEnvFiles(tmpRoot, cfg, { ensureKeys: true });
      expect(emitted).toHaveLength(2);
      const localEntry = emitted.find((e) => e.server === 'local')!;
      const cloudEntry = emitted.find((e) => e.server === 'cloud')!;

      expect(isManagedCloudServer(cloudEntry.vars)).toBe(true);
      expect(isManagedCloudServer(localEntry.vars)).toBe(false);
      expect(validateEnvSecrets(localEntry.vars)).toStrictEqual([]);
      expect(localEntry.vars.get('POOLER_TENANT_ID')).toBe('tenant-abc');
      expect(localEntry.vars.get('STORAGE_TENANT_ID')).toBe('tenant-abc');
      expect(
        isValidHs256Jwt(localEntry.vars.get('ANON_KEY')!, localEntry.vars.get('JWT_SECRET')!)
      ).toBe(true);
      expect(fs.existsSync(path.join(tmpRoot, 'supabase', 'generated', 'local.env'))).toBe(true);

      const ensuredAgain = ensureServerKeys(tmpRoot, cfg, localEntry.vars);
      expect(ensuredAgain.mutated).toBe(false);
    } finally {
      delete process.env.AUDIT_PROJECT_ROOT;
    }
  });

  it('upsertServerBlock preserves dashed headers and bare SERVER_<name>_* blocks without splitting', () => {
    const initial = [
      '# --- [ SERVIDOR 1: local ] ---',
      'SERVER_local_HOST=127.0.0.1',
      '',
      'SERVER_bare_HOST=10.0.0.5',
      ''
    ].join('\n');

    const withLocal = upsertServerBlock(
      initial,
      'local',
      new Map([
        ['HOST', '127.0.0.1'],
        ['JWT_SECRET', 'super-valid-secret-key']
      ])
    );
    expect(withLocal).not.toContain('# === [ SERVIDOR: local ] ===');
    expect(withLocal).toContain(
      '# --- [ SERVIDOR 1: local ] ---\nSERVER_local_HOST=127.0.0.1\nSERVER_local_JWT_SECRET=super-valid-secret-key'
    );

    const withBare = upsertServerBlock(withLocal, 'bare', new Map([['REGION', 'sa-east-1']]));
    expect(withBare).not.toContain('# === [ SERVIDOR: bare ] ===');
    expect(withBare).toContain('SERVER_bare_HOST=10.0.0.5\nSERVER_bare_REGION=sa-east-1');
  });

  it('generates 16-byte hex REALTIME_DB_ENC_KEY, validates its byte length, and auto-heals 32-char keys', async () => {
    const { ensureServerKeys } = await import('../src/supabase/envOrchestrator.ts');
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-rt-key-'));
    tempDirs.push(tmpRoot);
    process.env.AUDIT_PROJECT_ROOT = tmpRoot;

    try {
      const cfg: SupabaseDockerConfig = {
        enabled: true,
        projectSlug: 'demo',
        upstreamRef: 'master',
        supabaseDir: 'supabase',
        masterEnvFile: '.env',
        postgres: { expectedMajor: 17 },
        profiles: {}
      };
      const keys = generateSupabaseKeys(tmpRoot, cfg);
      const generatedRtKey = keys.get('REALTIME_DB_ENC_KEY') ?? '';
      expect(generatedRtKey).toMatch(/^[0-9a-f]{16}$/u);
      expect(Buffer.byteLength(generatedRtKey, 'utf8')).toBe(16);

      const invalid32 = new Map(keys);
      invalid32.set('REALTIME_DB_ENC_KEY', '0123456789abcdef0123456789abcdef');
      const errs = validateEnvSecrets(invalid32);
      expect(errs.some((e) => e.includes('REALTIME_DB_ENC_KEY'))).toBe(true);

      const healed = ensureServerKeys(tmpRoot, cfg, invalid32);
      expect(healed.mutated).toBe(true);
      const healedKey = healed.vars.get('REALTIME_DB_ENC_KEY') ?? '';
      expect(healedKey).toMatch(/^[0-9a-f]{16}$/u);
      expect(validateEnvSecrets(healed.vars)).toStrictEqual([]);

      const preserved = ensureServerKeys(tmpRoot, cfg, healed.vars);
      expect(preserved.mutated).toBe(false);
      expect(preserved.vars.get('REALTIME_DB_ENC_KEY')).toBe(healedKey);
    } finally {
      delete process.env.AUDIT_PROJECT_ROOT;
    }
  });
});
