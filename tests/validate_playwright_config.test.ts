import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import {
  ValidatePlaywrightConfigAuditor,
  PLAYWRIGHT_CONFIG_RULES,
  CANONICAL_PLAYWRIGHT_CONFIG_CONTENT
} from '../src/suites/architecture/validate_playwright_config.ts';

describe('ValidatePlaywrightConfigAuditor', () => {
  let tmpDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-playwright-test-'));
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
      const auditor = new ValidatePlaywrightConfigAuditor(undefined, tmpDir);
      validateAuditorConstruction(auditor);
      expect(auditor.id).toBe('validate_playwright_config');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toEqual(PLAYWRIGHT_CONFIG_RULES);
      expect(auditor.description.length).toBeLessThanOrEqual(60);
    });
  });

  describe('Conditional Applicability', () => {
    it('skips cleanly without errors or findings if no Playwright dependency or e2e folder exists', async () => {
      const auditor = new ValidatePlaywrightConfigAuditor(undefined, tmpDir);
      const result = await auditor.execute();

      expect(result.status).toBe('skipped');
      expect(result.summary.errors).toBe(0);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Clean Path Execution', () => {
    it('passes with zero errors on canonical baseline configuration when Playwright is declared', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ devDependencies: { '@playwright/test': '^1.50.0' } }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'playwright.config.ts'),
        CANONICAL_PLAYWRIGHT_CONFIG_CONTENT,
        'utf8'
      );

      const auditor = new ValidatePlaywrightConfigAuditor(undefined, tmpDir);
      const result = await auditor.execute();

      expect(result.status).toBe('passed');
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Canary Tests & Auto-Repair', () => {
    it('Canary 1 (Missing Config): reports error in check mode and scaffolds in fix mode', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ devDependencies: { '@playwright/test': '^1.50.0' } }),
        'utf8'
      );
      const configPath = path.join(tmpDir, 'playwright.config.ts');
      expect(fs.existsSync(configPath)).toBe(false);

      // Check mode
      const checkAuditor = new ValidatePlaywrightConfigAuditor(undefined, tmpDir);
      const checkResult = await checkAuditor.execute();
      expect(checkResult.status).toBe('failed');
      expect(checkResult.summary.errors).toBe(1);
      expect(checkResult.findings[0]?.ruleId).toBe('playwright-config-missing');

      // Fix mode
      const fixAuditor = new ValidatePlaywrightConfigAuditor({ fix: true }, tmpDir);
      const fixResult = await fixAuditor.execute();
      expect(fixResult.status).toBe('passed');
      expect(fixResult.summary.errors).toBe(0);
      expect(fs.existsSync(configPath)).toBe(true);

      const content = fs.readFileSync(configPath, 'utf8');
      expect(content).toContain('defineConfig');
      expect(content).toContain('timeout: 30000');
    });

    it('Canary 2 (Anti-Castration Mandate): detects missing timeout or reporter and repairs in fix mode', async () => {
      fs.mkdirSync(path.join(tmpDir, 'e2e'), { recursive: true });
      const configPath = path.join(tmpDir, 'playwright.config.ts');
      const degraded = [
        "import { defineConfig } from '@playwright/test';",
        'export default defineConfig({',
        "  testDir: './e2e'",
        '});'
      ].join('\n');
      fs.writeFileSync(configPath, degraded, 'utf8');

      // Check mode
      const checkAuditor = new ValidatePlaywrightConfigAuditor(undefined, tmpDir);
      const checkResult = await checkAuditor.execute();
      expect(checkResult.status).toBe('failed');
      const violations = checkResult.findings.filter(
        (f) => f.ruleId === 'playwright-config-missing-setting'
      );
      // missing timeout (1), reporter (1), use.trace (1) => 3
      expect(violations.length).toBe(3);

      // Fix mode
      const fixAuditor = new ValidatePlaywrightConfigAuditor({ fix: true }, tmpDir);
      const fixResult = await fixAuditor.execute();
      expect(fixResult.summary.errors).toBe(0);

      const repaired = fs.readFileSync(configPath, 'utf8');
      expect(repaired).toContain('timeout: 30000');
      expect(repaired).toContain('reporter:');
      expect(repaired).toContain('trace:');
    });

    it('Canary 3 (Legacy Runner Migration): detects npx vite in webServer.command and migrates to vp dev in fix mode', async () => {
      fs.mkdirSync(path.join(tmpDir, 'tests/e2e'), { recursive: true });
      const configPath = path.join(tmpDir, 'playwright.config.ts');
      const legacyCmd = 'npx ' + 'vite --port 5173';
      const legacyConfig = CANONICAL_PLAYWRIGHT_CONFIG_CONTENT.replace(
        '});',
        `  ,webServer: { command: '${legacyCmd}' }\n});`
      );
      fs.writeFileSync(configPath, legacyConfig, 'utf8');

      const checkAuditor = new ValidatePlaywrightConfigAuditor(undefined, tmpDir);
      const checkResult = await checkAuditor.execute();
      expect(checkResult.status).toBe('failed');
      expect(
        checkResult.findings.some((f) => f.ruleId === 'playwright-config-missing-setting')
      ).toBe(true);

      const fixAuditor = new ValidatePlaywrightConfigAuditor({ fix: true }, tmpDir);
      const fixResult = await fixAuditor.execute();
      expect(fixResult.status).toBe('passed');
      expect(fixResult.summary.errors).toBe(0);

      const repaired = fs.readFileSync(configPath, 'utf8');
      expect(repaired).toContain('vp dev --port 5173');
    });
  });
});
