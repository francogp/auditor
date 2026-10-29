import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { setAuditConfig, resetAuditConfig, defineAuditConfig } from '../src/core/auditConfig.ts';
import {
  ValidateAccessibilityAuditor,
  ACCESSIBILITY_RULES,
  mapA11yRuleId
} from '../src/suites/architecture/validate_accessibility.ts';

describe('ValidateAccessibilityAuditor & mapA11yRuleId', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-a11y-test-'));
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* non-fatal test cleanup */
    }
  });

  describe('Rule Declarations & Metadata', () => {
    it('declares all expected rules in ACCESSIBILITY_RULES', () => {
      expect(ACCESSIBILITY_RULES).toContain('a11y-img-alt');
      expect(ACCESSIBILITY_RULES).toContain('a11y-form-control-has-label');
      expect(ACCESSIBILITY_RULES).toContain('a11y-interactive-supports-focus');
      expect(ACCESSIBILITY_RULES).toContain('a11y-anchor-has-content');
      expect(ACCESSIBILITY_RULES).toContain('a11y-aria-role-invalid');
      expect(ACCESSIBILITY_RULES).toContain('a11y-viewport-zoom-lock');
      expect(ACCESSIBILITY_RULES).toContain('a11y-no-positive-tabindex');
      expect(ACCESSIBILITY_RULES).toContain('a11y-no-aria-hidden-focusable');
      expect(ACCESSIBILITY_RULES).toContain('a11y-svg-accessibility');
      expect(ACCESSIBILITY_RULES).toContain('a11y-iframe-title-and-scroll');
      expect(ACCESSIBILITY_RULES).toContain('forms-identifier-input-type');
      expect(ACCESSIBILITY_RULES).toContain('forms-autocomplete-hygiene');
      expect(ACCESSIBILITY_RULES).toContain('html-dialog-popover-exclusivity');
    });

    it('initializes with correct auditor metadata and rule descriptions', () => {
      const auditor = new ValidateAccessibilityAuditor({ projectRoot: tempDir });
      expect(auditor.id).toBe('validate_accessibility');
      expect(auditor.family).toBe('architecture');
      expect(auditor.packageName).toBe('A11y');
      expect(auditor.ruleDescriptions['a11y-img-alt']).toBe(
        'Image missing accessible alt attribute'
      );
      expect(auditor.ruleDescriptions['a11y-viewport-zoom-lock']).toBe(
        'Viewport zoom lock in HTML'
      );
    });
  });

  describe('mapA11yRuleId rule mapping', () => {
    it('maps alt-text to a11y-img-alt', () => {
      expect(mapA11yRuleId('vuejs-accessibility/alt-text')).toBe('a11y-img-alt');
    });

    it('maps form labels to a11y-form-control-has-label', () => {
      expect(mapA11yRuleId('vuejs-accessibility/form-control-has-label')).toBe(
        'a11y-form-control-has-label'
      );
      expect(mapA11yRuleId('vuejs-accessibility/label-has-for')).toBe(
        'a11y-form-control-has-label'
      );
    });

    it('maps interactive focus to a11y-interactive-supports-focus', () => {
      expect(mapA11yRuleId('vuejs-accessibility/interactive-supports-focus')).toBe(
        'a11y-interactive-supports-focus'
      );
    });

    it('maps anchor and heading content to a11y-anchor-has-content', () => {
      expect(mapA11yRuleId('vuejs-accessibility/anchor-has-content')).toBe(
        'a11y-anchor-has-content'
      );
      expect(mapA11yRuleId('vuejs-accessibility/heading-has-content')).toBe(
        'a11y-anchor-has-content'
      );
    });

    it('maps aria roles and props to a11y-aria-role-invalid', () => {
      expect(mapA11yRuleId('vuejs-accessibility/aria-role')).toBe('a11y-aria-role-invalid');
      expect(mapA11yRuleId('vuejs-accessibility/aria-props')).toBe('a11y-aria-role-invalid');
    });
  });

  describe('Clean Path Verification (StandardAuditResult)', () => {
    it('executes cleanly with zero errors when accessibility is disabled', async () => {
      setAuditConfig(
        defineAuditConfig({
          name: 'A11y Disabled Project',
          accessibility: { enabled: false },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          packageDistribution: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidateAccessibilityAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('skipped');
    });

    it('executes on clean SFC component and valid viewport reporting zero errors', async () => {
      const srcDir = path.join(tempDir, 'src/components');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, 'CleanButton.vue'),
        '<template><button type="button">Accessible Label</button><img src="avatar.png" alt="User avatar" /></template>\n'
      );
      fs.writeFileSync(
        path.join(tempDir, 'index.html'),
        '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body></body></html>\n'
      );

      setAuditConfig(
        defineAuditConfig({
          name: 'Clean A11y Project',
          accessibility: { enabled: true },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          packageDistribution: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidateAccessibilityAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');

      const ledger = auditor.getCoverageRecorder().toLedger({
        runId: 't',
        suiteId: auditor.id,
        skipped: false,
        ruleIds: auditor.getRuleCatalog()
      });
      expect(ledger.scanned).toEqual(['index.html', 'src/components/CleanButton.vue']);
      for (const ruleId of ledger.ruleIds) {
        expect(ledger.ruleEvaluations[ruleId]).toBeGreaterThan(0);
      }
    });

    it('marks every rule as not applicable when accessibility is disabled', async () => {
      setAuditConfig(defineAuditConfig({ name: 'A11y Off', accessibility: { enabled: false } }));
      const auditor = new ValidateAccessibilityAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const ledger = auditor.getCoverageRecorder().toLedger({
        runId: 't',
        suiteId: auditor.id,
        skipped: false,
        ruleIds: auditor.getRuleCatalog()
      });
      expect(ledger.scanned).toEqual([]);
      expect(Object.keys(ledger.notApplicable).sort()).toEqual([...ledger.ruleIds].sort());
    });
  });

  describe('Violation Detection', () => {
    it('detects missing alt attribute on img elements in Vue SFCs', async () => {
      const srcDir = path.join(tempDir, 'src/components');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, 'BadImage.vue'),
        '<template><img src="logo.png" /></template>\n'
      );

      setAuditConfig(
        defineAuditConfig({
          name: 'Bad A11y Project',
          accessibility: { enabled: true },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          packageDistribution: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidateAccessibilityAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      const imgAltIssue = result.findings.find((f) => f.ruleId === 'a11y-img-alt');
      expect(imgAltIssue).toBeDefined();
      expect(imgAltIssue?.file).toBe('src/components/BadImage.vue');
    });

    it('detects user-scalable=no viewport zoom lock in index.html', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'index.html'),
        '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, user-scalable=no"></head><body></body></html>\n'
      );

      setAuditConfig(
        defineAuditConfig({
          name: 'Zoom Locked Project',
          accessibility: { enabled: true },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          packageDistribution: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidateAccessibilityAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      const zoomIssue = result.findings.find((f) => f.ruleId === 'a11y-viewport-zoom-lock');
      expect(zoomIssue).toBeDefined();
      expect(zoomIssue?.file).toBe('index.html');
      expect(zoomIssue?.message).toContain('WCAG 1.4.4');
    });

    it('detects all 7 modern accessibility rules on fixture and auto-repairs 6 fixable rules + viewport zoom lock', async () => {
      const fixtureSource = fs.readFileSync(
        path.resolve(import.meta.dirname, 'fixtures/modern_web/AccessibilityBroken.vue.cases'),
        'utf-8'
      );
      const srcDir = path.join(tempDir, 'src/components');
      fs.mkdirSync(srcDir, { recursive: true });
      const targetSfc = path.join(srcDir, 'AccessibilityBroken.vue');
      fs.writeFileSync(targetSfc, fixtureSource, 'utf-8');
      fs.writeFileSync(
        path.join(tempDir, 'index.html'),
        '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, maximum-scale=1.0"></head><body></body></html>\n'
      );

      setAuditConfig(
        defineAuditConfig({
          name: 'Modern A11y Fixture Test',
          accessibility: { enabled: true },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          packageDistribution: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const checkAuditor = new ValidateAccessibilityAuditor({ projectRoot: tempDir });
      await checkAuditor.runAudit();
      const checkRes = await checkAuditor.finishAudit();

      const ruleSet = new Set(checkRes.findings.map((f) => f.ruleId));
      expect(ruleSet.has('a11y-viewport-zoom-lock')).toBe(true);
      expect(ruleSet.has('a11y-no-positive-tabindex')).toBe(true);
      expect(ruleSet.has('a11y-no-aria-hidden-focusable')).toBe(true);
      expect(ruleSet.has('a11y-svg-accessibility')).toBe(true);
      expect(ruleSet.has('a11y-iframe-title-and-scroll')).toBe(true);
      expect(ruleSet.has('forms-identifier-input-type')).toBe(true);
      expect(ruleSet.has('forms-autocomplete-hygiene')).toBe(true);
      expect(ruleSet.has('html-dialog-popover-exclusivity')).toBe(true);

      // Run in --fix mode
      const fixAuditor = new ValidateAccessibilityAuditor({ projectRoot: tempDir, fix: true });
      await fixAuditor.runAudit();

      const fixedSfc = fs.readFileSync(targetSfc, 'utf-8');
      expect(fixedSfc).toContain('tabindex="0"');
      expect(fixedSfc).not.toContain('aria-hidden="true">Hidden focus trap');
      expect(fixedSfc).toContain('<svg aria-hidden="true"');
      expect(fixedSfc).toContain('<svg class="standalone-chart"');
      expect(fixedSfc).not.toContain('<svg class="standalone-chart" aria-hidden');
      expect(fixedSfc).not.toContain('scrolling="no"');
      expect(fixedSfc).toContain('type="text" inputmode="numeric"');
      expect(fixedSfc).toContain('autocomplete="current-password"');

      const fixedHtml = fs.readFileSync(path.join(tempDir, 'index.html'), 'utf-8');
      expect(fixedHtml).toContain('content="width=device-width, initial-scale=1.0"');
      expect(fixedHtml).not.toContain('user-scalable=no');
    });

    it('avoids false positives on <defs>-only filter SVGs, interactive SVG canvases, and numeric quantity inputs', async () => {
      const srcDir = path.join(tempDir, 'src/components');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, 'AntiFalsePositive.vue'),
        [
          '<template>',
          '  <div>',
          '    <svg width="0" height="0" style="visibility: hidden"><defs><filter id="f1" /></defs></svg>',
          '    <svg viewBox="0 0 500 500" @pointermove="onMove"><text x="10" y="20">City</text></svg>',
          '    <label for="qty">Quantity</label>',
          '    <input id="qty" type="number" name="quantity" min="1" max="10" />',
          '  </div>',
          '</template>'
        ].join('\n')
      );

      setAuditConfig(
        defineAuditConfig({
          name: 'A11y Anti-FP Test',
          accessibility: { enabled: true },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          packageDistribution: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidateAccessibilityAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.findings).toHaveLength(0);
    });
  });
});
