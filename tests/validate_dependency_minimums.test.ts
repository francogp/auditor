/**
 * tests/validate_dependency_minimums.test.ts
 *
 * Unit tests for ValidateDependencyMinimumsAuditor (conditional minimum library versions):
 * metadata, clean path, range violation, installed (lockfile) violation, ignored when not declared.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  ValidateDependencyMinimumsAuditor,
  DEPENDENCY_MINIMUMS_RULES,
  findDeclaredDependency
} from '../src/suites/architecture/validate_dependency_minimums.ts';
import { getAuditorMinimumVersions } from '../src/core/auditorMinimums.ts';

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
    return new ValidateDependencyMinimumsAuditor({ projectRoot: tempDir }).execute();
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
      'dependency-below-minimum-installed'
    ]);
    const auditor = new ValidateDependencyMinimumsAuditor({ projectRoot: tempDir });
    expect(auditor.id).toBe('validate_dependency_minimums');
    expect(auditor.family).toBe('architecture');
    expect(auditor.capabilities.fix).toBe('none');
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
    expect(finding?.message).toContain(`npm install -D html-validate@${htmlValidateFloor}`);
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
});
