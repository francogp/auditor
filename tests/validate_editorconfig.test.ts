import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  ValidateEditorconfigAuditor,
  EDITORCONFIG_RULES,
  CANONICAL_EDITORCONFIG_CONTENT
} from '../src/suites/architecture/validate_editorconfig.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';

describe('ValidateEditorconfigAuditor', () => {
  let tmpDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-editorconfig-test-'));
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
      const auditor = new ValidateEditorconfigAuditor(undefined, tmpDir);
      validateAuditorConstruction(auditor);
      expect(auditor.id).toBe('validate_editorconfig');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toEqual(EDITORCONFIG_RULES);
      expect(auditor.description.length).toBeLessThanOrEqual(60);
    });
  });

  describe('Clean Path Execution', () => {
    it('passes with zero errors on canonical baseline configuration', async () => {
      const configPath = path.join(tmpDir, '.editorconfig');
      fs.writeFileSync(configPath, CANONICAL_EDITORCONFIG_CONTENT, 'utf8');

      const auditor = new ValidateEditorconfigAuditor(undefined, tmpDir);
      const result = await auditor.execute();

      expect(result.status).toBe('passed');
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Canary Tests & Auto-Repair', () => {
    it('Canary 1 (Missing Config): reports error in check mode and scaffolds in fix mode', async () => {
      const configPath = path.join(tmpDir, '.editorconfig');
      expect(fs.existsSync(configPath)).toBe(false);

      // Check mode
      const checkAuditor = new ValidateEditorconfigAuditor(undefined, tmpDir);
      const checkResult = await checkAuditor.execute();
      expect(checkResult.status).toBe('failed');
      expect(checkResult.summary.errors).toBe(1);
      expect(checkResult.findings[0]?.ruleId).toBe('editorconfig-missing');

      // Fix mode
      const fixAuditor = new ValidateEditorconfigAuditor({ fix: true }, tmpDir);
      const fixResult = await fixAuditor.execute();
      expect(fixResult.status).toBe('passed');
      expect(fixResult.summary.errors).toBe(0);
      expect(fs.existsSync(configPath)).toBe(true);

      const content = fs.readFileSync(configPath, 'utf8');
      expect(content).toContain('root = true');
      expect(content).toContain('end_of_line = lf');
      expect(content).toContain('indent_size = 2');
    });

    it('Canary 2 (Anti-Castration Mandate): detects incorrect settings and repairs them', async () => {
      const configPath = path.join(tmpDir, '.editorconfig');
      const degraded = ['[*]', 'charset = utf-8', 'end_of_line = crlf', 'indent_size = 4'].join(
        '\n'
      );
      fs.writeFileSync(configPath, degraded, 'utf8');

      // Check mode
      const checkAuditor = new ValidateEditorconfigAuditor(undefined, tmpDir);
      const checkResult = await checkAuditor.execute();
      expect(checkResult.status).toBe('failed');
      const violations = checkResult.findings.filter(
        (f) => f.ruleId === 'editorconfig-missing-setting'
      );
      // missing root=true (1), end_of_line=crlf (1), indent_size=4 (1) => 3
      expect(violations.length).toBe(3);

      // Fix mode
      const fixAuditor = new ValidateEditorconfigAuditor({ fix: true }, tmpDir);
      const fixResult = await fixAuditor.execute();
      expect(fixResult.summary.errors).toBe(0);

      const repaired = fs.readFileSync(configPath, 'utf8');
      expect(repaired).toContain('root = true');
      expect(repaired).toContain('end_of_line = lf');
      expect(repaired).toContain('indent_size = 2');
    });
  });
});
