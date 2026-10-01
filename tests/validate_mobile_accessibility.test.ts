/**
 * packages/auditor/tests/validate_mobile_accessibility.test.ts
 *
 * Dedicated unit test suite for MobileAccessibilityAuditor:
 * - Detects zoom blocking in viewport (no-zoom-blocking-viewport)
 * - Detects <img> missing alt attribute (img-alt-required)
 * - Detects icon-only button without accessible label (icon-button-accessible-label)
 * - Respects escape hatches (a11y-ok)
 * - Verifies clean execution (0 errors, passed status)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  MobileAccessibilityAuditor,
  MOBILE_ACCESSIBILITY_RULES
} from '../src/suites/architecture/validate_mobile_accessibility.ts';

describe('MobileAccessibilityAuditor', () => {
  const scratchDir = path.resolve(process.cwd(), 'scratch/test_mobile_a11y_' + crypto.randomUUID());

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    fs.mkdirSync(scratchDir, { recursive: true });
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    if (fs.existsSync(scratchDir)) {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  describe('Metadata & Rules', () => {
    it('declares all expected canonical rules', () => {
      expect(MOBILE_ACCESSIBILITY_RULES).toContain('no-zoom-blocking-viewport');
      expect(MOBILE_ACCESSIBILITY_RULES).toContain('img-alt-required');
      expect(MOBILE_ACCESSIBILITY_RULES).toContain('icon-button-accessible-label');
    });

    it('initializes with correct id and family', () => {
      const auditor = new MobileAccessibilityAuditor(scratchDir);
      expect(auditor.id).toBe('validate_mobile_accessibility');
      expect(auditor.family).toBe('architecture');
    });
  });

  describe('Violation Detection', () => {
    it('detects user-scalable=no in index.html (no-zoom-blocking-viewport)', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
          </head>
        </html>
      `;
      fs.writeFileSync(path.join(scratchDir, 'index.html'), html, 'utf-8');

      const auditor = new MobileAccessibilityAuditor(scratchDir);
      const result = await auditor.execute();
      const violation = result.findings.find(f => f.ruleId === 'no-zoom-blocking-viewport');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects maximum-scale=1.0 in index.html (no-zoom-blocking-viewport)', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
          </head>
        </html>
      `;
      fs.writeFileSync(path.join(scratchDir, 'index.html'), html, 'utf-8');

      const auditor = new MobileAccessibilityAuditor(scratchDir);
      const result = await auditor.execute();
      const violation = result.findings.find(f => f.ruleId === 'no-zoom-blocking-viewport');
      expect(violation).toBeDefined();
    });

    it('detects <img> without alt attribute in Vue template (img-alt-required)', async () => {
      const componentDir = path.join(scratchDir, 'src/components');
      fs.mkdirSync(componentDir, { recursive: true });
      const sfc = `
        <template>
          <div>
            <img src="/logo.png">
          </div>
        </template>
      `;
      fs.writeFileSync(path.join(componentDir, 'Logo.vue'), sfc, 'utf-8');

      const auditor = new MobileAccessibilityAuditor(scratchDir);
      const result = await auditor.execute();
      const violation = result.findings.find(f => f.ruleId === 'img-alt-required');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects icon-only button without aria-label or title (icon-button-accessible-label)', async () => {
      const componentDir = path.join(scratchDir, 'src/components');
      fs.mkdirSync(componentDir, { recursive: true });
      const sfc = `
        <template>
          <div>
            <button class="btn-icon">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </template>
      `;
      fs.writeFileSync(path.join(componentDir, 'ActionButton.vue'), sfc, 'utf-8');

      const auditor = new MobileAccessibilityAuditor(scratchDir);
      const result = await auditor.execute();
      const violation = result.findings.find(f => f.ruleId === 'icon-button-accessible-label');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('allows <img> with a11y-ok escape hatch', async () => {
      const componentDir = path.join(scratchDir, 'src/components');
      fs.mkdirSync(componentDir, { recursive: true });
      const sfc = `
        <template>
          <div>
            <img src="/logo.png"> <!-- a11y-ok: Decorative background banner -->
          </div>
        </template>
      `;
      fs.writeFileSync(path.join(componentDir, 'Banner.vue'), sfc, 'utf-8');

      const auditor = new MobileAccessibilityAuditor(scratchDir);
      const result = await auditor.execute();
      const violation = result.findings.find(f => f.ruleId === 'img-alt-required');
      expect(violation).toBeUndefined();
    });
  });

  describe('Clean Execution', () => {
    it('runs cleanly on compliant index.html and accessible Vue components', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
        </html>
      `;
      fs.writeFileSync(path.join(scratchDir, 'index.html'), html, 'utf-8');

      const componentDir = path.join(scratchDir, 'src/components');
      fs.mkdirSync(componentDir, { recursive: true });
      const sfc = `
        <template>
          <div>
            <img src="/logo.png" alt="Company Logo">
            <button aria-label="Delete item">
              <i class="fas fa-trash"></i>
            </button>
            <button title="Edit item">
              <i class="fas fa-edit"></i>
            </button>
            <button>
              <span>Click me</span>
            </button>
          </div>
        </template>
      `;
      fs.writeFileSync(path.join(componentDir, 'Accessible.vue'), sfc, 'utf-8');

      const auditor = new MobileAccessibilityAuditor(scratchDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});
