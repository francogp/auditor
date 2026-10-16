import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  ValidateMarkdownLintConfigAuditor,
  MARKDOWNLINT_CONFIG_RULES,
  CANONICAL_MARKDOWNLINT_CONFIG,
  type MarkdownLintConfigShape
} from '../src/suites/documentation/validate_markdown_lint_config.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';

describe('ValidateMarkdownLintConfigAuditor', () => {
  let tmpDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-mdlint-test-'));
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
      const auditor = new ValidateMarkdownLintConfigAuditor(undefined, tmpDir);
      validateAuditorConstruction(auditor);
      expect(auditor.id).toBe('validate_markdown_lint_config');
      expect(auditor.family).toBe('documentation');
      expect(auditor.ruleIds).toEqual(MARKDOWNLINT_CONFIG_RULES);
      expect(auditor.description.length).toBeLessThanOrEqual(60);
    });
  });

  describe('Clean Path Execution', () => {
    it('passes with zero errors on canonical baseline configuration', async () => {
      const configPath = path.join(tmpDir, '.markdownlint.json');
      fs.writeFileSync(configPath, JSON.stringify(CANONICAL_MARKDOWNLINT_CONFIG, null, 2), 'utf8');

      const auditor = new ValidateMarkdownLintConfigAuditor(undefined, tmpDir);
      const result = await auditor.execute();

      expect(result.status).toBe('passed');
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Canary Tests & Auto-Repair', () => {
    it('Canary 1 (Missing Config): reports error in check mode and scaffolds in fix mode', async () => {
      const configPath = path.join(tmpDir, '.markdownlint.json');
      expect(fs.existsSync(configPath)).toBe(false);

      // Check mode
      const checkAuditor = new ValidateMarkdownLintConfigAuditor(undefined, tmpDir);
      const checkResult = await checkAuditor.execute();
      expect(checkResult.status).toBe('failed');
      expect(checkResult.summary.errors).toBe(1);
      expect(checkResult.findings[0]?.ruleId).toBe('markdownlint-config-missing');

      // Fix mode
      const fixAuditor = new ValidateMarkdownLintConfigAuditor({ fix: true }, tmpDir);
      const fixResult = await fixAuditor.execute();
      expect(fixResult.status).toBe('passed');
      expect(fixResult.summary.errors).toBe(0);
      expect(fs.existsSync(configPath)).toBe(true);

      const created = JSON.parse(fs.readFileSync(configPath, 'utf8')) as MarkdownLintConfigShape;
      expect(created.default).toBe(true);
      expect(created.MD033).toEqual({ allowed_elements: ['br'] });
    });

    it('Canary 2 (Syntax Error): detects malformed JSON and reports markdownlint-config-syntax', async () => {
      const configPath = path.join(tmpDir, '.markdownlint.json');
      fs.writeFileSync(configPath, '{ default: true, unclosed: }', 'utf8');

      const auditor = new ValidateMarkdownLintConfigAuditor(undefined, tmpDir);
      const result = await auditor.execute();
      expect(result.status).toBe('failed');
      expect(result.findings.some((f) => f.ruleId === 'markdownlint-config-syntax')).toBe(true);
    });

    it('Canary 3 (Anti-Castration Mandate): detects missing strict rules and re-injects in fix mode', async () => {
      const configPath = path.join(tmpDir, '.markdownlint.json');
      const degraded: MarkdownLintConfigShape = {
        default: false,
        MD013: false
      };
      fs.writeFileSync(configPath, JSON.stringify(degraded, null, 2), 'utf8');

      // Check mode
      const checkAuditor = new ValidateMarkdownLintConfigAuditor(undefined, tmpDir);
      const checkResult = await checkAuditor.execute();
      expect(checkResult.status).toBe('failed');
      const violations = checkResult.findings.filter(
        (f) => f.ruleId === 'markdownlint-config-missing-strict-rule'
      );
      expect(violations.length).toBeGreaterThanOrEqual(1);

      // Fix mode
      const fixAuditor = new ValidateMarkdownLintConfigAuditor({ fix: true }, tmpDir);
      const fixResult = await fixAuditor.execute();
      expect(fixResult.summary.errors).toBe(0);

      const repaired = JSON.parse(fs.readFileSync(configPath, 'utf8')) as MarkdownLintConfigShape;
      expect(repaired.default).toBe(true);
      expect(repaired.MD033).toEqual({ allowed_elements: ['br'] });
      expect(repaired.MD024).toEqual({ siblings_only: true });
      expect(repaired.MD007).toEqual({ indent: 2 });
    });
  });
});
