/**
 * tests/validate_dependency_minimums.test.ts
 *
 * Unit tests for ValidateDependencyMinimumsAuditor (conditional minimum library versions):
 * metadata, clean path, range violation, installed (lockfile) violation, ignored when not declared.
 */

import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import {
  findDeclaredDependency,
  getAuditorManagedDependencyFloors,
  getAuditorMinimumVersions
} from '../src/core/auditorMinimums.ts';
import {
  ValidateDependencyMinimumsAuditor,
  DEPENDENCY_MINIMUMS_RULES
} from '../src/suites/architecture/validate_dependency_minimums.ts';

describe('validate_dependency_minimums', () => {
  let tempDir: string;
  const minimums = getAuditorMinimumVersions();
  const htmlValidateFloor = minimums['html-validate'] as string;
  const htmlValidateMin = htmlValidateFloor.replace('^', '');

  async function writeProject(
    devDependencies: Record<string, string>,
    locked?: Record<string, string>
  ): Promise<void> {
    // open-record: test fixture dictionaries
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'host', devDependencies })
    );
    if (locked) {
      const packages = Object.fromEntries(
        Object.entries(locked).map(([n, v]) => [`node_modules/${n}`, { version: v }])
      );
      await fs.writeFile(
        path.join(tempDir, 'package-lock.json'),
        JSON.stringify({ lockfileVersion: 3, packages })
      );
    }
  }

  async function run() {
    return new ValidateDependencyMinimumsAuditor({ projectRoot: tempDir }).audit();
  }

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-dep-minimums-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('declares canonical rules and metadata', () => {
    expect(DEPENDENCY_MINIMUMS_RULES).toEqual([
      'dependency-below-minimum-range',
      'dependency-below-minimum-installed',
      'dependency-exact-version-pinned',
      'dependency-exceeds-maximum-range',
      'dependency-exceeds-maximum-installed',
      'dependency-conflicting-override',
      'dependency-lockfile-out-of-sync'
    ]);
    const auditor = new ValidateDependencyMinimumsAuditor({ projectRoot: tempDir });
    expect(auditor.id).toBe('validate_dependency_minimums');
    expect(auditor.family).toBe('architecture');
    expect(auditor.capabilities.fix).toBe('priority');
    expect(auditor.description.length).toBeLessThanOrEqual(60);
  });

  it('reads minimums from the auditor peerDependencies (never hardcoded)', () => {
    expect(Object.keys(minimums)).toContain('html-validate');
    expect(minimums['html-validate']).toMatch(/^[\^~]?\d/);
  });

  it('passes cleanly when declared libraries meet the floor', async () => {
    await writeProject(
      { 'html-validate': htmlValidateFloor },
      { 'html-validate': htmlValidateMin }
    );
    const result = await run();
    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
    expect(result.findings).toHaveLength(0);
  });

  it('ignores libraries that are not installed', async () => {
    await writeProject({ 'left-pad': '^1.0.0' }, { 'left-pad': '1.0.0' });
    const result = await run();
    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('fails when the declared range is below the floor', async () => {
    await writeProject({ 'html-validate': '^1.0.0' });
    const result = await run();
    expect(result.summary.errors).toBeGreaterThan(0);
    expect(result.status).toBe('failed');
    const finding = result.findings.find((f) => f.ruleId === 'dependency-below-minimum-range');
    expect(finding?.severity).toBe('error');
    expect(finding?.fixable).toBe(true);
    expect(finding?.message).toContain(`npm install -D html-validate@${htmlValidateFloor}`);
  });

  it('auto-fixes declared range below minimum or above maximum when fix: true', async () => {
    await writeProject({ 'html-validate': '^1.0.0', typescript: '^7.0.0' });
    const auditor = new ValidateDependencyMinimumsAuditor({ projectRoot: tempDir });
    const result = await auditor.fix();
    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');

    const pkg = JSON.parse(await fs.readFile(path.join(tempDir, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>;
    };
    expect(pkg.devDependencies['html-validate']).toBe(htmlValidateFloor);
    expect(pkg.devDependencies.typescript).toBe('^6.0.3');
  });

  it('fails when the lockfile version is below the floor', async () => {
    await writeProject({ 'html-validate': htmlValidateFloor }, { 'html-validate': '1.0.0' });
    const result = await run();
    expect(result.status).toBe('failed');
    expect(
      result.findings.some(
        (f) => f.ruleId === 'dependency-below-minimum-installed' && f.severity === 'error'
      )
    ).toBe(true);
  });

  it('fails when declared range exceeds maximum allowed (e.g. typescript >= 7.0.0)', async () => {
    await writeProject({ typescript: '^7.0.0' });
    const result = await run();
    expect(result.status).toBe('failed');
    const finding = result.findings.find((f) => f.ruleId === 'dependency-exceeds-maximum-range');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('error');
    expect(finding?.fixable).toBe(true);
    expect(finding?.message).toContain('TypeScript 7+ is not permitted');
  });

  it('fails when installed version exceeds maximum allowed (e.g. typescript 7.0.1 in lockfile)', async () => {
    await writeProject({ typescript: '^6.0.3' }, { typescript: '7.0.1' });
    const result = await run();
    expect(result.status).toBe('failed');
    const finding = result.findings.find(
      (f) => f.ruleId === 'dependency-exceeds-maximum-installed'
    );
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('error');
    expect(finding?.message).toContain('exceeds allowed maximum');
  });

  it('fails when a declared library uses an exact pinned version (no range operator)', async () => {
    await writeProject({ 'html-validate': htmlValidateMin }, { 'html-validate': htmlValidateMin });
    const result = await run();
    expect(result.status).toBe('failed');
    const finding = result.findings.find((f) => f.ruleId === 'dependency-exact-version-pinned');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('error');
    expect(finding?.fixable).toBe(true);
    expect(finding?.message).toContain('declares exact pinned version');
  });

  it('auto-repairs exact pinned version to caret range in fix mode', async () => {
    await writeProject({ 'html-validate': htmlValidateMin });
    const auditor = new ValidateDependencyMinimumsAuditor({ projectRoot: tempDir });
    const result = await auditor.fix();
    expect(result.status).toBe('passed');
    const content = await fs.readFile(path.join(tempDir, 'package.json'), 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.devDependencies['html-validate']).toBe(`^${htmlValidateMin}`);
  });

  it('findDeclaredDependency locates libraries across sections', () => {
    expect(findDeclaredDependency({ dependencies: { a: '^1.0.0' } }, 'a')).toEqual({
      range: '^1.0.0',
      isProduction: true,
      section: 'dependencies'
    });
    expect(findDeclaredDependency({ devDependencies: { a: '^1.0.0' } }, 'a')).toEqual({
      range: '^1.0.0',
      isProduction: false,
      section: 'devDependencies'
    });
    expect(findDeclaredDependency({}, 'a')).toBeNull();
  });

  it('detects package.json override below @francogp/auditor managed floor without auto-deleting it', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'override-floor-conflict',
          overrides: {
            stylelint: '^17.0.0'
          }
        },
        null,
        2
      ),
      'utf-8'
    );
    const result = await run();
    expect(result.status).toBe('failed');
    const finding = result.findings.find((f) => f.ruleId === 'dependency-conflicting-override');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('error');
    expect(finding?.fixable).toBe(false);
    expect(finding?.message).toContain('stylelint');
  });

  it('detects installed override whose peerDependencies conflict with @francogp/auditor (e.g. stylelint-config-recommended@18 vs stylelint@18)', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'override-peer-conflict',
          overrides: {
            'stylelint-config-recommended': '^18.0.0'
          }
        },
        null,
        2
      ),
      'utf-8'
    );
    const pkgDir = path.join(tempDir, 'node_modules', 'stylelint-config-recommended');
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(
      path.join(pkgDir, 'package.json'),
      JSON.stringify(
        {
          name: 'stylelint-config-recommended',
          version: '18.0.0',
          peerDependencies: {
            stylelint: '^17.0.0'
          }
        },
        null,
        2
      ),
      'utf-8'
    );

    const result = await run();
    expect(result.status).toBe('failed');
    const finding = result.findings.find((f) => f.ruleId === 'dependency-conflicting-override');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('error');
    expect(finding?.fixable).toBe(false);
    expect(finding?.message).toContain('stylelint-config-recommended');
  });

  it('passes cleanly when package.json declares non-conflicting user overrides', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'override-compatible',
          overrides: {
            'custom-user-pkg': '^1.0.0',
            stylelint: getAuditorManagedDependencyFloors().stylelint as string
          }
        },
        null,
        2
      ),
      'utf-8'
    );

    const result = await run();
    expect(result.status).toBe('passed');
    expect(result.findings.some((f) => f.ruleId === 'dependency-conflicting-override')).toBe(false);
  });

  it('detects package-lock.json root declaration mismatch with package.json (dependency-lockfile-out-of-sync)', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'lock-sync', devDependencies: { 'html-validate': htmlValidateFloor } })
    );
    await fs.writeFile(
      path.join(tempDir, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': { devDependencies: { 'html-validate': '^1.0.0' } },
          'node_modules/html-validate': { version: htmlValidateMin }
        }
      })
    );

    const result = await run();
    expect(result.status).toBe('failed');
    const finding = result.findings.find((f) => f.ruleId === 'dependency-lockfile-out-of-sync');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('error');
    expect(finding?.fixable).toBe(true);
    expect(finding?.file).toBe('package-lock.json');
  });

  it('detects lockfile desync reported by lockfileSyncChecker and runs lockfileInstaller once in fix mode', async () => {
    await writeProject({ 'html-validate': '^1.0.0' }, { 'html-validate': '1.0.0' });
    let installedCalled = 0;
    let synced = false;

    const auditor = new ValidateDependencyMinimumsAuditor({
      projectRoot: tempDir,
      lockfileSyncChecker: () =>
        synced
          ? { inSync: true, reason: null }
          : {
              inSync: false,
              reason:
                'package-lock.json is out of sync (Missing: stylelint-config-recommended@19.0.0)'
            }
    });
    const checkResult = await auditor.audit();
    expect(checkResult.status).toBe('failed');
    expect(
      checkResult.findings.some(
        (f) => f.ruleId === 'dependency-lockfile-out-of-sync' && f.fixable === true
      )
    ).toBe(true);
    expect(
      checkResult.findings.some(
        (f) => f.ruleId === 'dependency-below-minimum-installed' && f.fixable === true
      )
    ).toBe(true);

    const fixAuditor = new ValidateDependencyMinimumsAuditor({
      projectRoot: tempDir,
      lockfileSyncChecker: () =>
        synced
          ? { inSync: true, reason: null }
          : {
              inSync: false,
              reason:
                'package-lock.json is out of sync (Missing: stylelint-config-recommended@19.0.0)'
            },
      lockfileInstaller: (root) => {
        installedCalled += 1;
        synced = true;
        const lockFile = path.join(root, 'package-lock.json');
        const nextLock = {
          lockfileVersion: 3,
          packages: {
            '': { devDependencies: { 'html-validate': htmlValidateFloor } },
            'node_modules/html-validate': { version: htmlValidateMin }
          }
        };
        fsSync.writeFileSync(lockFile, JSON.stringify(nextLock), 'utf8');
      }
    });

    const fixResult = await fixAuditor.fix();
    expect(installedCalled).toBe(1);
    expect(fixResult.status).toBe('passed');
    expect(fixResult.summary.errors).toBe(0);
  });
});
