/**
 * tests/update_package.test.ts
 *
 * Hermetic unit tests for the auditor-update CLI tool:
 * - Host project root discovery
 * - Installed version extraction
 * - Missing declaration detection
 * - Clean execution verification
 */

import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vite-plus/test';

import {
  findHostProjectRoot,
  readInstalledAuditorVersion,
  updateAuditorPackage,
  runAuditorFixAutoRemediation,
  resolveLatestAuditorTag,
  parseTagSemver,
  compareTagsDescending,
  extractTagsFromLsRemote,
  renderUpdateHelp,
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
    it('returns (not installed) if node_modules does not exist', () => {
      const version = readInstalledAuditorVersion(sandboxDir);
      expect(version).toBe('(not installed)');
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
      expect(result.error).toContain('package.json not found');
    });

    it('fails cleanly if @francogp/auditor is not declared in dependencies', () => {
      fs.writeFileSync(
        path.join(sandboxDir, 'package.json'),
        JSON.stringify({ name: 'unrelated-project', dependencies: {} })
      );

      const result = updateAuditorPackage({ cwd: sandboxDir, silent: true });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not declared in dependencies');
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
      const expectedTag = resolveLatestAuditorTag();
      expect(spawnCalls[0]).toEqual(['install', '-D', `github:francogp/auditor#${expectedTag}`]);
      expect(result.previousVersion).toBe('1.2.0-build.20261002-152514');
      expect(result.newVersion).toBe('1.2.0-build.20261002-152514');
      expect(result.updated).toBe(false);
    });

    it('executes npm install -D with pinned tag when declared in devDependencies', () => {
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
      const expectedTag = resolveLatestAuditorTag();
      expect(spawnCalls[0]).toEqual(['install', '-D', `github:francogp/auditor#${expectedTag}`]);
    });

    it('executes npm install -D github:francogp/auditor#v9.0.0 when custom targetVersion is specified', () => {
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

      const result = updateAuditorPackage({
        cwd: sandboxDir,
        targetVersion: 'v9.0.0',
        silent: false
      });
      spy.mockRestore();

      expect(result.success).toBe(true);
      expect(spawnCalls[0]).toEqual(['install', '-D', 'github:francogp/auditor#v9.0.0']);
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
      expect(result.error).toContain('Failed to read package.json');
    });

    it('executes in checkOnly mode without invoking npm install or mutating files', () => {
      fs.writeFileSync(
        path.join(sandboxDir, 'package.json'),
        JSON.stringify({
          name: 'host-check-consumer',
          devDependencies: {
            '@francogp/auditor': 'github:francogp/auditor#v9.0.0'
          }
        })
      );

      const auditorPkgDir = path.join(sandboxDir, 'node_modules/@francogp/auditor');
      fs.mkdirSync(auditorPkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(auditorPkgDir, 'package.json'),
        JSON.stringify({ name: '@francogp/auditor', version: '9.0.0' })
      );

      let spawnCalled = false;
      const spy = vi.spyOn(childProcess, 'spawnSync').mockImplementation(() => {
        spawnCalled = true;
        return {
          status: 0,
          stdout: Buffer.from(''),
          stderr: Buffer.from(''),
          output: [],
          pid: 1234,
          signal: null
        };
      });

      const result = updateAuditorPackage({
        cwd: sandboxDir,
        targetVersion: 'v10.0.0',
        silent: true,
        checkOnly: true
      });
      spy.mockRestore();

      expect(spawnCalled).toBe(false);
      expect(result.success).toBe(true);
      expect(result.previousVersion).toBe('9.0.0');
      expect(result.newVersion).toBe('v10.0.0');
      expect(result.updated).toBe(false);
      expect(result.updateAvailable).toBe(true);
    });

    it('reports updateAvailable false when installed version matches target tag in checkOnly mode', () => {
      fs.writeFileSync(
        path.join(sandboxDir, 'package.json'),
        JSON.stringify({
          name: 'host-check-uptodate',
          devDependencies: {
            '@francogp/auditor': 'github:francogp/auditor#v10.0.0'
          }
        })
      );

      const auditorPkgDir = path.join(sandboxDir, 'node_modules/@francogp/auditor');
      fs.mkdirSync(auditorPkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(auditorPkgDir, 'package.json'),
        JSON.stringify({ name: '@francogp/auditor', version: '10.0.0' })
      );

      const result = updateAuditorPackage({
        cwd: sandboxDir,
        targetVersion: 'v10.0.0',
        silent: true,
        checkOnly: true
      });

      expect(result.success).toBe(true);
      expect(result.previousVersion).toBe('10.0.0');
      expect(result.newVersion).toBe('v10.0.0');
      expect(result.updateAvailable).toBe(false);
    });
  });

  describe('renderUpdateHelp', () => {
    it('renders usage, options and read-only guidance without errors', () => {
      const help = renderUpdateHelp();
      expect(help).toContain('USAGE:');
      expect(help).toContain('auditor-update [targetVersion] [options]');
      expect(help).toContain('--check');
      expect(help).toContain('--help');
      expect(help).toContain('npm run auditor:version');
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

  describe('resolveLatestAuditorTag and SemVer Tag Parsing', () => {
    it('parses clean SemVer tags correctly', () => {
      const sem = parseTagSemver('v9.7.4');
      expect(sem).toEqual({ major: 9, minor: 7, patch: 4, isClean: true });
    });

    it('parses tags without leading v', () => {
      const sem = parseTagSemver('9.7.4');
      expect(sem).toEqual({ major: 9, minor: 7, patch: 4, isClean: true });
    });

    it('parses tags with build metadata', () => {
      const sem = parseTagSemver('v9.7.4-build.20261019-195349');
      expect(sem).toEqual({ major: 9, minor: 7, patch: 4, isClean: false });
    });

    it('returns null for non-semver strings', () => {
      expect(parseTagSemver('latest')).toBeNull();
      expect(parseTagSemver('feature-branch')).toBeNull();
    });

    it('compares tags numerically across major, minor, patch and metadata', () => {
      expect(compareTagsDescending('v10.0.0', 'v9.7.4')).toBeLessThan(0); // 10 comes first
      expect(compareTagsDescending('v9.7.4', 'v10.0.0')).toBeGreaterThan(0);
      expect(compareTagsDescending('v9.8.0', 'v9.7.9')).toBeLessThan(0);
      expect(compareTagsDescending('v9.7.4', 'v9.7.3')).toBeLessThan(0);
      // Clean tag is preferred over build-metadata tag for the same version
      expect(compareTagsDescending('v9.7.4', 'v9.7.4-build.20261019-195349')).toBeLessThan(0);
      expect(compareTagsDescending('v9.7.4-build.20261019-195349', 'v9.7.4')).toBeGreaterThan(0);
    });

    it('extracts and sorts tags from git ls-remote output stripping peeled refs', () => {
      const mockLsRemote = `
24b75ba... refs/tags/v9.7.4-build.20261019-195349^{}
d455bea... refs/tags/v9.7.4-build.20261019-195349
7e233b9... refs/tags/v9.7.4^{}
7e233b9... refs/tags/v9.7.4
2382883... refs/tags/v9.7.3^{}
1917e09... refs/tags/v9.7.3
fe2bf7d... refs/tags/v9.7.0
`;
      const tags = extractTagsFromLsRemote(mockLsRemote);
      expect(tags[0]).toBe('v9.7.4');
      expect(tags[1]).toBe('v9.7.4-build.20261019-195349');
      expect(tags[2]).toBe('v9.7.3');
      expect(tags[3]).toBe('v9.7.0');
    });

    it('resolves latest tag even if only build-metadata tag exists', () => {
      const mockLsRemote = `
24b75ba... refs/tags/v9.8.0-build.20261020-100000^{}
d455bea... refs/tags/v9.8.0-build.20261020-100000
7e233b9... refs/tags/v9.7.4
`;
      const tags = extractTagsFromLsRemote(mockLsRemote);
      expect(tags[0]).toBe('v9.8.0-build.20261020-100000');
      expect(tags[1]).toBe('v9.7.4');
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
