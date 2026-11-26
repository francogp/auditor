import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vite-plus/test';

import { supabaseManageCommand } from '../src/cli/supabase_manage.ts';
import {
  DEFAULT_SUPABASE_DOCKER_CONFIG,
  listOrderedMigrationFiles,
  resolveProfileDbContainerName,
  resolveRemoteImageRef,
  type SupabaseDockerConfig
} from '../src/supabase/index.ts';

const tempDirs: string[] = [];

afterEach(() => {
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
  });
});
