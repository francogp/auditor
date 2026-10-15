/**
 * tests/report_dependencies.test.ts
 *
 * Unit tests for auditor-dependencies CLI reporter and evaluateProjectDependencies:
 * evaluation states, install commands grouping, CLI flag parsing, and clean execution.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  evaluateProjectDependencies,
  getAuditorMinimumVersions
} from '../src/core/auditorMinimums.ts';
import {
  parseCliArgs,
  runDependenciesReport
} from '../src/cli/report_dependencies.ts';

describe('auditor-dependencies CLI reporter', () => {
  let tempDir: string;
  const minimums = getAuditorMinimumVersions();
  const htmlValidateFloor = minimums['html-validate'] as string;
  const htmlValidateMin = htmlValidateFloor.replace('^', '');
  const vueFloor = minimums['vue'] as string;

  async function writeProject(
    pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
    locked?: Record<string, string>
  ): Promise<void> {
    await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-host', ...pkg }));
    if (locked) {
      const packages = Object.fromEntries(
        Object.entries(locked).map(([n, v]) => [`node_modules/${n}`, { version: v }])
      );
      await fs.writeFile(path.join(tempDir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages }));
    }
  }

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-deps-report-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('parses CLI arguments accurately', () => {
    const opts1 = parseCliArgs(['--project=../other', '--json', '--all']);
    expect(opts1.project).toBe('../other');
    expect(opts1.json).toBe(true);
    expect(opts1.all).toBe(true);
    expect(opts1.commandsOnly).toBe(false);

    const opts2 = parseCliArgs(['-p', './custom', '-c', '--no-fail']);
    expect(opts2.project).toBe('./custom');
    expect(opts2.commandsOnly).toBe(true);
    expect(opts2.noFail).toBe(true);
  });

  it('evaluates clean project with zero outdated dependencies', async () => {
    await writeProject(
      { devDependencies: { 'html-validate': htmlValidateFloor } },
      { 'html-validate': htmlValidateMin }
    );
    const report = evaluateProjectDependencies(tempDir);
    expect(report.declaredCount).toBe(1);
    expect(report.satisfiedCount).toBe(1);
    expect(report.outdatedCount).toBe(0);
    expect(report.prodInstallCommand).toBeUndefined();
    expect(report.devInstallCommand).toBeUndefined();
  });

  it('detects outdated declared range and groups prod/dev install commands', async () => {
    await writeProject({
      dependencies: { vue: '^3.0.0' },
      devDependencies: { 'html-validate': '^9.0.0' }
    });

    const report = evaluateProjectDependencies(tempDir);
    expect(report.outdatedCount).toBe(2);
    expect(report.prodInstallCommand).toBe(`npm install vue@${vueFloor}`);
    expect(report.devInstallCommand).toBe(`npm install -D html-validate@${htmlValidateFloor}`);

    const vueEval = report.evaluated.find(e => e.name === 'vue');
    expect(vueEval?.status).toBe('outdated_range');
    expect(vueEval?.installCommand).toBe(`npm install vue@${vueFloor}`);

    const htmlValidateEval = report.evaluated.find(e => e.name === 'html-validate');
    expect(htmlValidateEval?.status).toBe('outdated_range');
    expect(htmlValidateEval?.installCommand).toBe(`npm install -D html-validate@${htmlValidateFloor}`);
  });

  it('detects outdated installed lockfile version', async () => {
    await writeProject(
      { devDependencies: { 'html-validate': htmlValidateFloor } },
      { 'html-validate': '9.0.0' }
    );

    const report = evaluateProjectDependencies(tempDir);
    expect(report.outdatedCount).toBe(1);
    const htmlValidateEval = report.evaluated.find(e => e.name === 'html-validate');
    expect(htmlValidateEval?.status).toBe('outdated_installed');
    expect(report.devInstallCommand).toBe(`npm install -D html-validate@${htmlValidateFloor}`);
  });

  it('marks non-declared libraries as undeclared', async () => {
    await writeProject({ devDependencies: { 'html-validate': htmlValidateFloor } });
    const report = evaluateProjectDependencies(tempDir);
    const undeclared = report.evaluated.filter(e => e.status === 'undeclared');
    expect(undeclared.length).toBe(report.totalGoverned - 1);
    const tsEval = undeclared.find(e => e.name === 'typescript');
    expect(tsEval?.declaredRange).toBeNull();
  });

  it('runDependenciesReport outputs json mode without crashing', async () => {
    await writeProject({ devDependencies: { 'html-validate': htmlValidateFloor } });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const report = runDependenciesReport(tempDir, { json: true, commandsOnly: false, all: false, noFail: true });
      expect(report.declaredCount).toBe(1);
      expect(spy).toHaveBeenCalled();
      const firstCall = spy.mock.calls[0]?.[0];
      const parsed = JSON.parse(firstCall as string);
      expect(parsed.totalGoverned).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('runDependenciesReport outputs commands mode cleanly', async () => {
    await writeProject({
      dependencies: { vue: '^3.0.0' },
      devDependencies: { 'html-validate': '^9.0.0' }
    });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const report = runDependenciesReport(tempDir, { json: false, commandsOnly: true, all: false, noFail: true });
      expect(report.outdatedCount).toBe(2);
      expect(spy).toHaveBeenCalledWith(`npm install vue@${vueFloor}`);
      expect(spy).toHaveBeenCalledWith(`npm install -D html-validate@${htmlValidateFloor}`);
    } finally {
      spy.mockRestore();
    }
  });
});
