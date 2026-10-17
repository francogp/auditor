import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import {
  ValidateNpmrcConfigAuditor,
  NPMRC_CONFIG_RULES,
  CANONICAL_NPMRC_CONTENT
} from '../src/suites/architecture/validate_npmrc_config.ts';

describe('ValidateNpmrcConfigAuditor', () => {
  let tmpDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-npmrc-test-'));
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // catch-ok
    }
  });

  describe('Contract Conformance & Metadata', () => {
    it('fulfills BaseAuditor metadata and construction contract', () => {
      const auditor = new ValidateNpmrcConfigAuditor(undefined, tmpDir);
      validateAuditorConstruction(auditor);
      expect(auditor.id).toBe('validate_npmrc_config');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toEqual(NPMRC_CONFIG_RULES);
      expect(auditor.description.length).toBeLessThanOrEqual(60);
    });
  });

  describe('Clean Path Execution', () => {
    it('passes with zero errors on canonical baseline configuration', async () => {
      const configPath = path.join(tmpDir, '.npmrc');
      fs.writeFileSync(configPath, CANONICAL_NPMRC_CONTENT, 'utf8');

      const auditor = new ValidateNpmrcConfigAuditor(undefined, tmpDir);
      const result = await auditor.execute();

      expect(result.status).toBe('passed');
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Canary Tests & Auto-Repair', () => {
    it('Canary 1 (Missing Config): reports error in check mode and scaffolds in fix mode', async () => {
      const configPath = path.join(tmpDir, '.npmrc');
      expect(fs.existsSync(configPath)).toBe(false);

      // Check mode
      const checkAuditor = new ValidateNpmrcConfigAuditor(undefined, tmpDir);
      const checkResult = await checkAuditor.execute();
      expect(checkResult.status).toBe('failed');
      expect(checkResult.summary.errors).toBe(1);
      expect(checkResult.findings[0]?.ruleId).toBe('npmrc-config-missing');

      // Fix mode
      const fixAuditor = new ValidateNpmrcConfigAuditor({ fix: true }, tmpDir);
      const fixResult = await fixAuditor.execute();
      expect(fixResult.status).toBe('passed');
      expect(fixResult.summary.errors).toBe(0);
      expect(fs.existsSync(configPath)).toBe(true);

      const content = fs.readFileSync(configPath, 'utf8');
      expect(content).toContain('engine-strict=true');
      expect(content).toContain('save-exact=true');
      expect(content).toContain('package-lock=true');
    });

    it('Canary 2 (Anti-Castration Mandate): detects missing or false settings and repairs non-destructively', async () => {
      const configPath = path.join(tmpDir, '.npmrc');
      const degraded = [
        '# Custom settings',
        '@myorg:registry=https://custom.registry.com/',
        'engine-strict=false'
      ].join('\n');
      fs.writeFileSync(configPath, degraded, 'utf8');

      // Check mode
      const checkAuditor = new ValidateNpmrcConfigAuditor(undefined, tmpDir);
      const checkResult = await checkAuditor.execute();
      expect(checkResult.status).toBe('failed');
      const violations = checkResult.findings.filter(
        (f) => f.ruleId === 'npmrc-config-missing-setting'
      );
      // engine-strict is false (1), save-exact missing (1), package-lock missing (1) => 3
      expect(violations.length).toBe(3);

      // Fix mode
      const fixAuditor = new ValidateNpmrcConfigAuditor({ fix: true }, tmpDir);
      const fixResult = await fixAuditor.execute();
      expect(fixResult.summary.errors).toBe(0);

      const repaired = fs.readFileSync(configPath, 'utf8');
      expect(repaired).toContain('@myorg:registry=https://custom.registry.com/');
      expect(repaired).toContain('engine-strict=true');
      expect(repaired).toContain('save-exact=true');
      expect(repaired).toContain('package-lock=true');
    });
  });
});
