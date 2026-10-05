import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  ValidateAccessibilityAuditor,
  mapA11yRuleId
} from '../src/suites/architecture/validate_accessibility.ts';
import { setAuditConfig, resetAuditConfig, defineAuditConfig } from '../src/core/auditConfig.ts';

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
      // catch-ok: cleanup temporary test directory
    }
  });

  describe('mapA11yRuleId rule mapping', () => {
    it('maps alt-text to a11y-img-alt', () => {
      expect(mapA11yRuleId('vuejs-accessibility/alt-text')).toBe('a11y-img-alt');
    });

    it('maps form labels to a11y-form-control-has-label', () => {
      expect(mapA11yRuleId('vuejs-accessibility/form-control-has-label')).toBe('a11y-form-control-has-label');
      expect(mapA11yRuleId('vuejs-accessibility/label-has-for')).toBe('a11y-form-control-has-label');
    });

    it('maps interactive focus to a11y-interactive-supports-focus', () => {
      expect(mapA11yRuleId('vuejs-accessibility/interactive-supports-focus')).toBe('a11y-interactive-supports-focus');
    });

    it('maps anchor and heading content to a11y-anchor-has-content', () => {
      expect(mapA11yRuleId('vuejs-accessibility/anchor-has-content')).toBe('a11y-anchor-has-content');
      expect(mapA11yRuleId('vuejs-accessibility/heading-has-content')).toBe('a11y-anchor-has-content');
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
      expect(result.status).toBe('passed');
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
        runId: 't', suiteId: auditor.id, skipped: false, ruleIds: auditor.getRuleCatalog()
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
        runId: 't', suiteId: auditor.id, skipped: false, ruleIds: auditor.getRuleCatalog()
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
      const imgAltIssue = result.findings.find(f => f.ruleId === 'a11y-img-alt');
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
      const zoomIssue = result.findings.find(f => f.ruleId === 'a11y-viewport-zoom-lock');
      expect(zoomIssue).toBeDefined();
      expect(zoomIssue?.file).toBe('index.html');
      expect(zoomIssue?.message).toContain('WCAG 1.4.4');
    });
  });
});
