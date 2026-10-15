/**
 * tests/update_package.test.ts
 *
 * Hermetic unit tests for the auditor-update CLI tool:
 * - Host project root discovery
 * - Installed version extraction
 * - Missing declaration detection
 * - Clean execution verification
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import {
  findHostProjectRoot,
  readInstalledAuditorVersion,
  updateAuditorPackage,
  runAuditorFixAutoRemediation,
  runCli
} from '../src/cli/update_package.ts';
import { ensureNpmrcAllowGit } from '../src/core/npmrcAllowGit.ts';

describe('update_package CLI', () => {
  const sandboxDir = path.resolve(
    process.cwd(),
    'scratch/test_update_package_' + crypto.randomUUID()
  );

  beforeEach(() => {
    fs.mkdirSync(sandboxDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(sandboxDir)) {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    }
  });

  describe('findHostProjectRoot', () => {
    it('discovers project root containing package.json', () => {
      const nestedDir = path.join(sandboxDir, 'nested/child/grandchild');
      fs.mkdirSync(nestedDir, { recursive: true });
      fs.writeFileSync(
        path.join(sandboxDir, 'package.json'),
        JSON.stringify({ name: 'host-project' })
      );

      const found = findHostProjectRoot(nestedDir);
      expect(found).toBe(sandboxDir);
    });

    it('returns start directory if no package.json exists in ancestry', () => {
      const emptyDir = path.join(sandboxDir, 'no_pkg');
      fs.mkdirSync(emptyDir, { recursive: true });

      const found = findHostProjectRoot(emptyDir);
      expect(found).toBeDefined();
    });
  });

  describe('readInstalledAuditorVersion', () => {
    it('returns (no instalada) if node_modules does not exist', () => {
      const version = readInstalledAuditorVersion(sandboxDir);
      expect(version).toBe('(no instalada)');
    });

    it('reads version from node_modules/@francogp/auditor/package.json', () => {
      const auditorPkgDir = path.join(sandboxDir, 'node_modules/@francogp/auditor');
      fs.mkdirSync(auditorPkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(auditorPkgDir, 'package.json'),
        JSON.stringify({ name: '@francogp/auditor', version: '1.2.0-build.20261002-152514' })
      );

      const version = readInstalledAuditorVersion(sandboxDir);
      expect(version).toBe('1.2.0-build.20261002-152514');
    });
  });

  describe('updateAuditorPackage', () => {
    it('fails cleanly if package.json does not exist', () => {
      const result = updateAuditorPackage({ cwd: sandboxDir, stopAt: sandboxDir, silent: true });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No se encontró package.json');
    });

    it('fails cleanly if @francogp/auditor is not declared in dependencies', () => {
      fs.writeFileSync(
        path.join(sandboxDir, 'package.json'),
        JSON.stringify({ name: 'unrelated-project', dependencies: {} })
      );

      const result = updateAuditorPackage({ cwd: sandboxDir, silent: true });
      expect(result.success).toBe(false);
      expect(result.error).toContain('no está declarado en dependencies');
    });

    it('executes npm install with unpinned github repo when declared in dependencies', () => {
      fs.writeFileSync(
        path.join(sandboxDir, 'package.json'),
        JSON.stringify({
          name: 'host-consumer',
          dependencies: {
            '@francogp/auditor': 'github:francogp/auditor#v7.1.1'
          }
        })
      );

      const auditorPkgDir = path.join(sandboxDir, 'node_modules/@francogp/auditor');
      fs.mkdirSync(auditorPkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(auditorPkgDir, 'package.json'),
        JSON.stringify({ name: '@francogp/auditor', version: '1.2.0-build.20261002-152514' })
      );

      const spawnCalls: string[][] = [];
      const spy = vi.spyOn(childProcess, 'spawnSync').mockImplementation((_cmd, args) => {
        spawnCalls.push(args as string[]);
        return {
          status: 0,
          stdout: Buffer.from(''),
          stderr: Buffer.from(''),
          output: [],
          pid: 1234,
          signal: null
        };
      });

      const result = updateAuditorPackage({ cwd: sandboxDir, silent: true });
      spy.mockRestore();

      expect(result.success).toBe(true);
      expect(spawnCalls[0]).toEqual(['install', '-D', 'github:francogp/auditor#semver:*']);
      expect(result.previousVersion).toBe('1.2.0-build.20261002-152514');
      expect(result.newVersion).toBe('1.2.0-build.20261002-152514');
      expect(result.updated).toBe(false);
    });

    it('executes npm install -D github:francogp/auditor#semver:* when declared in devDependencies', () => {
      fs.writeFileSync(
        path.join(sandboxDir, 'package.json'),
        JSON.stringify({
          name: 'host-dev-consumer',
          devDependencies: {
            '@francogp/auditor': 'github:francogp/auditor#v7.1.1'
          }
        })
      );

      const spawnCalls: string[][] = [];
      const spy = vi.spyOn(childProcess, 'spawnSync').mockImplementation((_cmd, args) => {
        spawnCalls.push(args as string[]);
        return {
          status: 0,
          stdout: Buffer.from(''),
          stderr: Buffer.from(''),
          output: [],
          pid: 1234,
          signal: null
        };
      });

      const result = updateAuditorPackage({ cwd: sandboxDir, silent: false });
      spy.mockRestore();

      expect(result.success).toBe(true);
      expect(spawnCalls[0]).toEqual(['install', '-D', 'github:francogp/auditor#semver:*']);
    });

    it('handles npm update command failure cleanly', () => {
      fs.writeFileSync(
        path.join(sandboxDir, 'package.json'),
        JSON.stringify({
          name: 'host-failing-consumer',
          dependencies: {
            '@francogp/auditor': 'github:francogp/auditor#semver:*'
          }
        })
      );

      const spy = vi.spyOn(childProcess, 'spawnSync').mockImplementation(() => {
        return {
          status: 1,
          stdout: Buffer.from(''),
          stderr: Buffer.from('Network error ETIMEDOUT'),
          output: [],
          pid: 1234,
          signal: null
        };
      });

      const result = updateAuditorPackage({ cwd: sandboxDir, silent: true });
      spy.mockRestore();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error ETIMEDOUT');
    });

    it('handles childProcess spawnSync error (e.g. EINVAL on Windows) cleanly', () => {
      fs.writeFileSync(
        path.join(sandboxDir, 'package.json'),
        JSON.stringify({
          name: 'host-einval-consumer',
          dependencies: {
            '@francogp/auditor': 'github:francogp/auditor#semver:*'
          }
        })
      );

      let passedOptions: childProcess.SpawnSyncOptions | undefined;
      const spy = vi.spyOn(childProcess, 'spawnSync').mockImplementation((_cmd, _args, opts) => {
        passedOptions = opts as childProcess.SpawnSyncOptions;
        return {
          status: null,
          stdout: Buffer.from(''),
          stderr: Buffer.from(''),
          output: [],
          pid: 0,
          signal: null,
          error: new Error('spawnSync npm.cmd EINVAL')
        };
      });

      const result = updateAuditorPackage({ cwd: sandboxDir, silent: true });
      spy.mockRestore();

      expect(result.success).toBe(false);
      expect(result.error).toContain('spawnSync npm.cmd EINVAL');
      if (process.platform === 'win32') {
        expect(passedOptions?.shell).toBe(true);
      }
    });

    it('handles malformed package.json cleanly', () => {
      fs.writeFileSync(path.join(sandboxDir, 'package.json'), 'not valid json');

      const result = updateAuditorPackage({ cwd: sandboxDir, silent: true });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Error al leer package.json');
    });
  });

  describe('runAuditorFixAutoRemediation', () => {
    it('executes auditor fix in host project successfully', () => {
      const spy = vi.spyOn(childProcess, 'spawnSync').mockImplementation(() => {
        return {
          status: 0,
          stdout: Buffer.from(''),
          stderr: Buffer.from(''),
          output: [],
          pid: 1234,
          signal: null
        };
      });

      const success = runAuditorFixAutoRemediation(sandboxDir, true);
      spy.mockRestore();

      expect(success).toBe(true);
    });

    it('executes via host node binary when host auditor package exists', () => {
      const hostAuditorPkg = path.join(
        sandboxDir,
        'node_modules/@francogp/auditor/dist/cli/audit_full.js'
      );
      fs.mkdirSync(path.dirname(hostAuditorPkg), { recursive: true });
      fs.writeFileSync(hostAuditorPkg, '// runner stub');

      let executedCmd = '';
      const spy = vi.spyOn(childProcess, 'spawnSync').mockImplementation((cmd) => {
        executedCmd = cmd as string;
        return {
          status: 0,
          stdout: Buffer.from(''),
          stderr: Buffer.from(''),
          output: [],
          pid: 1234,
          signal: null
        };
      });

      const success = runAuditorFixAutoRemediation(sandboxDir, false);
      spy.mockRestore();

      expect(success).toBe(true);
      expect(executedCmd).toBe('node');
    });
  });

  describe('runCli', () => {
    it('exits with code 1 when update fails', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit(1)');
      }) as unknown as (code?: string | number | null | undefined) => never);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => runCli()).toThrow('process.exit(1)');
      exitSpy.mockRestore();
      errSpy.mockRestore();
    });
  });
});

describe('ensureNpmrcAllowGit', () => {
  const dir = path.resolve(process.cwd(), 'scratch/test_npmrc_' + crypto.randomUUID());

  beforeEach(() => fs.mkdirSync(dir, { recursive: true }));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('creates .npmrc with allow-git=all when missing', () => {
    expect(ensureNpmrcAllowGit(dir)).toBe(true);
    expect(fs.readFileSync(path.join(dir, '.npmrc'), 'utf-8')).toBe('allow-git=all\n');
  });

  it('replaces a restrictive allow-git and preserves other lines', () => {
    fs.writeFileSync(path.join(dir, '.npmrc'), 'registry=https://example.org\nallow-git=none\n');
    expect(ensureNpmrcAllowGit(dir)).toBe(true);
    expect(fs.readFileSync(path.join(dir, '.npmrc'), 'utf-8')).toBe(
      'registry=https://example.org\nallow-git=all\n'
    );
  });

  it('is idempotent when allow-git=all already exists', () => {
    fs.writeFileSync(path.join(dir, '.npmrc'), 'allow-git=all\n');
    expect(ensureNpmrcAllowGit(dir)).toBe(false);
    expect(fs.readFileSync(path.join(dir, '.npmrc'), 'utf-8')).toBe('allow-git=all\n');
  });
});
