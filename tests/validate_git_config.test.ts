/**
 * tests/validate_git_config.test.ts
 *
 * Dedicated unit test suite for ValidateGitConfigAuditor:
 * - Metadata & configuration conformance
 * - Clean path execution in non-git workspace (graceful not applicable)
 * - Clean path execution in properly configured Git repository
 * - Violation detection for unconfigured/misconfigured core.filemode, core.autocrlf, and core.eol
 * - Auto-fix execution repairing local Git repository settings
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import {
  ValidateGitConfigAuditor,
  GIT_CONFIG_RULES,
  getLocalGitConfig,
  setLocalGitConfig
} from '../src/suites/architecture/validate_git_config.ts';

describe('validate_git_config (Git Configuration Validator)', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-git-config-test-'));
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test-app', version: '1.0.0' }, null, 2),
      'utf8'
    );
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    delete process.env.AUDITOR_ENV;
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      /* non-fatal test cleanup */
    }
  });

  describe('Metadata & Configuration', () => {
    it('declares all expected canonical rules in GIT_CONFIG_RULES', () => {
      expect(GIT_CONFIG_RULES).toEqual([
        'git-config-filemode',
        'git-config-autocrlf',
        'git-config-eol'
      ]);
    });

    it('initializes with correct canonical metadata and description lengths <= 50', () => {
      const auditor = new ValidateGitConfigAuditor({ projectRoot: tempDir });
      expect(auditor.id).toBe('validate_git_config');
      expect(auditor.family).toBe('architecture');
      expect(auditor.packageName).toBe('Git');
      expect(auditor.icon).toBe('🌿');
      expect(auditor.capabilities.fix).toBe('priority');
      expect(auditor.capabilities.fix).not.toBe('none');
      expect(auditor.capabilities.speed).toBe('light');
      expect(auditor.description.length).toBeLessThanOrEqual(60);

      for (const ruleId of GIT_CONFIG_RULES) {
        const fullDesc = auditor.formatRuleDescription(ruleId);
        expect(fullDesc.length).toBeLessThanOrEqual(50);
        expect(fullDesc).not.toContain('\n');
      }
    });
  });

  describe('Non-Git Workspace (Not Applicable Path)', () => {
    it('gracefully passes with zero violations when workspace is not a Git repo', async () => {
      const auditor = new ValidateGitConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Clean Path (Properly Configured Git Repository)', () => {
    it('passes cleanly when git config has filemode=false, autocrlf=input, and eol=lf', async () => {
      spawnSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
      setLocalGitConfig('core.filemode', 'false', tempDir);
      setLocalGitConfig('core.autocrlf', 'input', tempDir);
      setLocalGitConfig('core.eol', 'lf', tempDir);

      const auditor = new ValidateGitConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Violation Detection', () => {
    it('detects violations when Git settings are missing or misconfigured', async () => {
      spawnSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
      setLocalGitConfig('core.filemode', 'true', tempDir);

      const auditor = new ValidateGitConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.summary.errors).toBe(3);
      expect(result.status).toBe('failed');

      const filemodeFinding = result.findings.find((f) => f.ruleId === 'git-config-filemode');
      const autocrlfFinding = result.findings.find((f) => f.ruleId === 'git-config-autocrlf');
      const eolFinding = result.findings.find((f) => f.ruleId === 'git-config-eol');

      expect(filemodeFinding).toBeDefined();
      expect(filemodeFinding?.severity).toBe('error');
      expect(filemodeFinding?.message).toContain('core.filemode must be "false"');

      expect(autocrlfFinding).toBeDefined();
      expect(autocrlfFinding?.severity).toBe('error');
      expect(autocrlfFinding?.message).toContain('core.autocrlf must be "input"');

      expect(eolFinding).toBeDefined();
      expect(eolFinding?.severity).toBe('error');
      expect(eolFinding?.message).toContain('core.eol must be "lf"');
    });
  });

  describe('Auto-Fix Execution', () => {
    it('repairs missing and invalid Git settings automatically with fix=true', async () => {
      spawnSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
      setLocalGitConfig('core.filemode', 'true', tempDir);

      const auditor = new ValidateGitConfigAuditor({
        projectRoot: tempDir
      });
      const result = await auditor.fix();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
      expect(result.findings).toHaveLength(0);

      expect(getLocalGitConfig('core.filemode', tempDir)).toBe('false');
      expect(getLocalGitConfig('core.autocrlf', tempDir)).toBe('input');
      expect(getLocalGitConfig('core.eol', tempDir)).toBe('lf');
    });
  });

  describe('Production Environment (AUDITOR_ENV=production)', () => {
    it('skips cleanly with zero errors when AUDITOR_ENV=production even if Git config is misconfigured', async () => {
      process.env.AUDITOR_ENV = 'production';
      spawnSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
      setLocalGitConfig('core.filemode', 'true', tempDir);

      const auditor = new ValidateGitConfigAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('skipped');
      expect(result.findings).toHaveLength(0);
    });
  });
});
