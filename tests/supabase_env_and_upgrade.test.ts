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
});
