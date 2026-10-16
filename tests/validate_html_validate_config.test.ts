/**
 * tests/validate_html_validate_config.test.ts
 *
 * Dedicated unit test suite for ValidateHtmlValidateConfigAuditor conforming to BaseAuditor 5-point contract:
 * - Contract conformance & metadata verification
 * - Clean path: Canonical baseline passes with 0 errors
 * - 5-Tier Canary tests:
 *   1. Missing config file detection & auto-scaffolding in fix mode
 *   2. Syntax error detection
 *   3. Missing mandatory strict rule detection & auto-remediation in fix mode
 *   4. Missing doctype-style lowercase rule & auto-remediation in fix mode
 *   5. Missing Vue plugin/transform detection & auto-remediation in fix mode
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  ValidateHtmlValidateConfigAuditor,
  HTML_VALIDATE_CONFIG_RULES,
  CANONICAL_HTML_VALIDATE_CONFIG
} from '../src/suites/architecture/validate_html_validate_config.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';

describe('ValidateHtmlValidateConfigAuditor', () => {
  let tmpDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-htmlvalidate-test-'));
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
      const auditor = new ValidateHtmlValidateConfigAuditor(undefined, tmpDir);
      validateAuditorConstruction(auditor);
      expect(auditor.id).toBe('validate_html_validate_config');
      expect(auditor.family).toBe('architecture');
      expect(auditor.packageName).toBe('HTML');
      expect(auditor.ruleIds).toEqual(HTML_VALIDATE_CONFIG_RULES);
      expect(auditor.ruleIds.length).toBe(6);
    });
  });

  describe('Clean Path Execution', () => {
    it('passes with zero errors on canonical baseline configuration', async () => {
      const configPath = path.join(tmpDir, '.htmlvalidate.json');
      fs.writeFileSync(
        configPath,
        JSON.stringify(CANONICAL_HTML_VALIDATE_CONFIG, null, 2),
        'utf-8'
      );

      const auditor = new ValidateHtmlValidateConfigAuditor(undefined, tmpDir);
      const result = await auditor.execute();

      expect(result.status).toBe('passed');
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
    });
  });

  describe('Canary Tests & Auto-Repair', () => {
    it('Canary 1 (Missing Config): reports error in check mode and scaffolds in fix mode', async () => {
      // 1. Check mode
      const auditorCheck = new ValidateHtmlValidateConfigAuditor(undefined, tmpDir);
      const resultCheck = await auditorCheck.execute();

      expect(resultCheck.status).toBe('failed');
      expect(resultCheck.findings.some((f) => f.ruleId === 'html-validate-config-missing')).toBe(
        true
      );

      // 2. Fix mode
      const auditorFix = new ValidateHtmlValidateConfigAuditor({ projectRoot: tmpDir, fix: true });
      const resultFix = await auditorFix.execute();

      expect(resultFix.status).toBe('passed');
      const createdPath = path.join(tmpDir, '.htmlvalidate.json');
      expect(fs.existsSync(createdPath)).toBe(true);

      const parsed = JSON.parse(fs.readFileSync(createdPath, 'utf-8'));
      expect(parsed.elements).toContain('html5');
      expect(parsed.rules['doctype-style']).toEqual(['error', { style: 'lowercase' }]);
    });

    it('Canary 2 (Syntax Error): detects malformed JSON and reports html-validate-config-syntax', async () => {
      const configPath = path.join(tmpDir, '.htmlvalidate.json');
      fs.writeFileSync(configPath, '{\n  "elements": ["html5",\n', 'utf-8');

      const auditor = new ValidateHtmlValidateConfigAuditor(undefined, tmpDir);
      const result = await auditor.execute();

      expect(result.status).toBe('failed');
      expect(result.findings.some((f) => f.ruleId === 'html-validate-config-syntax')).toBe(true);
    });

    it('Canary 3 (Anti-Castration Mandate): detects missing strict rule and re-injects in fix mode', async () => {
      const configPath = path.join(tmpDir, '.htmlvalidate.json');
      const degradedConfig = {
        ...CANONICAL_HTML_VALIDATE_CONFIG,
        rules: {
          ...CANONICAL_HTML_VALIDATE_CONFIG.rules,
          deprecated: 'off' // Degraded/castrated rule
        }
      };
      fs.writeFileSync(configPath, JSON.stringify(degradedConfig, null, 2), 'utf-8');

      // Check mode flags error
      const auditorCheck = new ValidateHtmlValidateConfigAuditor(undefined, tmpDir);
      const resultCheck = await auditorCheck.execute();

      expect(resultCheck.status).toBe('failed');
      expect(
        resultCheck.findings.some((f) => f.ruleId === 'html-validate-config-missing-strict-rule')
      ).toBe(true);

      // Fix mode restores mandatory strict baseline
      const auditorFix = new ValidateHtmlValidateConfigAuditor({ projectRoot: tmpDir, fix: true });
      await auditorFix.execute();

      const repaired = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(repaired.rules.deprecated).toBe('error');
    });

    it('Canary 4 (Doctype Harmonization): detects missing doctype-style and auto-repairs to lowercase', async () => {
      const configPath = path.join(tmpDir, '.htmlvalidate.json');
      const customConfig = {
        ...CANONICAL_HTML_VALIDATE_CONFIG,
        rules: {
          ...CANONICAL_HTML_VALIDATE_CONFIG.rules
        }
      };
      delete (customConfig.rules as Record<string, unknown>)['doctype-style'];
      fs.writeFileSync(configPath, JSON.stringify(customConfig, null, 2), 'utf-8');

      // Check mode
      const auditorCheck = new ValidateHtmlValidateConfigAuditor(undefined, tmpDir);
      const resultCheck = await auditorCheck.execute();

      expect(resultCheck.status).toBe('failed');
      expect(
        resultCheck.findings.some((f) => f.ruleId === 'html-validate-config-missing-doctype-style')
      ).toBe(true);

      // Fix mode
      const auditorFix = new ValidateHtmlValidateConfigAuditor({ projectRoot: tmpDir, fix: true });
      await auditorFix.execute();

      const repaired = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(repaired.rules['doctype-style']).toEqual(['error', { style: 'lowercase' }]);
    });

    it('Canary 5 (Vue Plugins/Transforms): detects missing html-validate-vue in Vue project and auto-injects', async () => {
      // Create Vue project indicator
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test-vue', dependencies: { vue: '^3.5.0' } }),
        'utf-8'
      );

      const configPath = path.join(tmpDir, '.htmlvalidate.json');
      const nonVueConfig = {
        elements: ['html5'],
        extends: ['html-validate:recommended'],
        rules: {
          ...CANONICAL_HTML_VALIDATE_CONFIG.rules
        }
      };
      fs.writeFileSync(configPath, JSON.stringify(nonVueConfig, null, 2), 'utf-8');

      // Check mode
      const auditorCheck = new ValidateHtmlValidateConfigAuditor(undefined, tmpDir);
      const resultCheck = await auditorCheck.execute();

      expect(resultCheck.status).toBe('failed');
      expect(
        resultCheck.findings.some((f) => f.ruleId === 'html-validate-config-missing-plugin')
      ).toBe(true);
      expect(
        resultCheck.findings.some((f) => f.ruleId === 'html-validate-config-missing-transform')
      ).toBe(true);

      // Fix mode
      const auditorFix = new ValidateHtmlValidateConfigAuditor({ projectRoot: tmpDir, fix: true });
      await auditorFix.execute();

      const repaired = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(repaired.plugins).toContain('html-validate-vue');
      expect(repaired.transform['^.*\\.vue$']).toBe('html-validate-vue');
    });
  });
});
