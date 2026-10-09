import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { bootstrapCliProject, stripProjectCliArgs, resolvePackageBin } from '../src/cli/cliUtils.ts';
import { discoverAuditors } from '../src/cli/auditScanner.ts';

describe('Remote Project CLI Bootstrap (bootstrapCliProject)', () => {
  let originalCwd: string;
  let originalAuditorHome: string | undefined;
  let originalProjectRoot: string | undefined;
  let tempSandboxDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalAuditorHome = process.env.AUDITOR_HOME_DIR;
    originalProjectRoot = process.env.AUDIT_PROJECT_ROOT;

    tempSandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-remote-test-'));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalAuditorHome !== undefined) {
      process.env.AUDITOR_HOME_DIR = originalAuditorHome;
    } else {
      delete process.env.AUDITOR_HOME_DIR;
    }

    if (originalProjectRoot !== undefined) {
      process.env.AUDIT_PROJECT_ROOT = originalProjectRoot;
    } else {
      delete process.env.AUDIT_PROJECT_ROOT;
    }

    try {
      fs.rmSync(tempSandboxDir, { recursive: true, force: true });
    } catch {
      // catch-ok: Best-effort temp dir cleanup
    }
  });

  it('defaults to local auditor execution when no --project flag is passed', () => {
    const res = bootstrapCliProject(['node', 'auditor']);
    expect(res.isRemote).toBe(false);
    expect(res.projectRoot).toBe(originalCwd);
    expect(process.cwd()).toBe(originalCwd);
  });

  it('fails loudly when target directory does not exist', () => {
    const nonExistent = path.join(tempSandboxDir, 'does-not-exist');
    expect(() => {
      bootstrapCliProject(['node', 'auditor', `--project=${nonExistent}`]);
    }).toThrow(/Target project directory does not exist/);
  });

  it('fails loudly when target path is a file instead of a directory', () => {
    const dummyFile = path.join(tempSandboxDir, 'test-file.txt');
    fs.writeFileSync(dummyFile, 'hello', 'utf-8');

    expect(() => {
      bootstrapCliProject(['node', 'auditor', `--project=${dummyFile}`]);
    }).toThrow(/Target project path is not a directory/);
  });

  it('fails loudly when target directory lacks a package.json', () => {
    expect(() => {
      bootstrapCliProject(['node', 'auditor', `--project=${tempSandboxDir}`]);
    }).toThrow(/Target directory does not contain a package\.json/);
  });

  it('switches working directory cleanly when targeting a valid project with --project=<path>', () => {
    fs.writeFileSync(path.join(tempSandboxDir, 'package.json'), JSON.stringify({ name: 'remote-host-app' }), 'utf-8');

    const res = bootstrapCliProject(['node', 'auditor', `--project=${tempSandboxDir}`]);

    const expectedTempRoot = path.resolve(tempSandboxDir);
    expect(res.isRemote).toBe(true);
    expect(res.projectRoot).toBe(expectedTempRoot);
    expect(process.cwd()).toBe(expectedTempRoot);
    expect(process.env.AUDITOR_HOME_DIR).toBe(originalCwd);
    expect(process.env.AUDIT_PROJECT_ROOT).toBe(expectedTempRoot);
  });

  it('supports alternative CLI flag formats: --project <path>, project=<path>, -p <path>, -p=<path>', () => {
    fs.writeFileSync(path.join(tempSandboxDir, 'package.json'), JSON.stringify({ name: 'remote-host-app' }), 'utf-8');

    const flagVariants = [
      ['node', 'auditor', '--project', tempSandboxDir],
      ['node', 'auditor', `project=${tempSandboxDir}`],
      ['node', 'auditor', '-p', tempSandboxDir],
      ['node', 'auditor', `-p=${tempSandboxDir}`]
    ];

    for (const argv of flagVariants) {
      process.chdir(originalCwd);
      delete process.env.AUDITOR_HOME_DIR;
      delete process.env.AUDIT_PROJECT_ROOT;

      const res = bootstrapCliProject(argv);
      expect(res.isRemote).toBe(true);
      expect(res.projectRoot).toBe(path.resolve(tempSandboxDir));
      expect(process.cwd()).toBe(path.resolve(tempSandboxDir));
    }
  });

  it('discovers builtin auditor suites from auditor directory while executing inside remote project', async () => {
    fs.writeFileSync(path.join(tempSandboxDir, 'package.json'), JSON.stringify({ name: 'remote-host-app' }), 'utf-8');
    const auditorDir = path.join(tempSandboxDir, '.auditor');
    fs.mkdirSync(auditorDir, { recursive: true });
    fs.writeFileSync(
      path.join(auditorDir, 'audit.config.ts'),
      `export default { name: 'remote-host-app', paths: { srcRoots: ['src'] } };`,
      'utf-8'
    );

    const bootstrap = bootstrapCliProject(['node', 'auditor', `--project=${tempSandboxDir}`]);
    expect(bootstrap.isRemote).toBe(true);

    const tasks = await discoverAuditors({ projectRoot: tempSandboxDir });
    expect(tasks.length).toBeGreaterThan(30);

    const hasAuditProject = tasks.some(t => t.id === 'audit_project');
    const hasGsap = tasks.some(t => t.id === 'validate_gsap_animations');
    const hasEslint = tasks.some(t => t.id === 'validate_eslint');

    expect(hasAuditProject).toBe(true);
    expect(hasGsap).toBe(true);
    expect(hasEslint).toBe(true);
  });

  it('strips project flags cleanly via stripProjectCliArgs', () => {
    const raw = ['node', 'auditor', '--project=../target', 'category=dupes', '--project', '../target2', '-p=../p1', '-p', '../p2', 'breakdown'];
    const stripped = stripProjectCliArgs(raw);

    expect(stripped).toEqual(['node', 'auditor', 'category=dupes', 'breakdown']);
  });

  it('handles stripProjectCliArgs with empty or non-project args without modification', () => {
    const untouched = ['node', 'report_findings', 'category=all', '--format=json'];
    expect(stripProjectCliArgs(untouched)).toEqual(untouched);
    expect(stripProjectCliArgs([])).toEqual([]);
  });

  it('resolves package binaries using AUDITOR_HOME_DIR fallback when not present in host', () => {
    fs.writeFileSync(path.join(tempSandboxDir, 'package.json'), JSON.stringify({ name: 'remote-host-app' }), 'utf-8');
    bootstrapCliProject(['node', 'auditor', `--project=${tempSandboxDir}`]);

    // Looking up eslint should resolve from AUDITOR_HOME_DIR because tempSandboxDir has no node_modules
    const resolvedBin = resolvePackageBin('eslint', tempSandboxDir);
    expect(resolvedBin).toBeDefined();
    expect(fs.existsSync(resolvedBin!)).toBe(true);
  });
});

