/**
 * packages/auditor/tests/validate_test_hygiene.test.ts
 *
 * Dedicated unit test suite for TestHygieneAuditor:
 * - Tautological integration mocks (no-tautological-integration-mocks)
 * - Text-based locators in E2E (playwright-id-locators-only)
 * - Force-clicks in E2E (no-playwright-force-click)
 * - Timeout inflation > 30000ms (no-test-timeout-inflation)
 * - Polling sleeps in E2E (no-playwright-polling-waits)
 * - Honors escape hatches (mock-ok, locator-ok, force-ok, timeout-ok, wait-ok)
 * - Verifies clean execution (0 errors, passed status)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TestHygieneAuditor,
  TEST_HYGIENE_RULES
} from '../src/suites/architecture/validate_test_hygiene.ts';
import type { ViolationInput } from '../src/core/auditorBase.ts';
import type { TestHygieneRuleId } from '../src/suites/architecture/validate_test_hygiene.ts';

class TestableTestHygieneAuditor extends TestHygieneAuditor {
  public readonly collectedViolations: ViolationInput<TestHygieneRuleId>[] = [];

  public override addViolation(v: ViolationInput<TestHygieneRuleId>): void {
    this.collectedViolations.push(v);
    super.addViolation(v);
  }

  public testScanFile(relPath: string, content: string): void {
    this.scanFile(relPath, content);
  }
}

describe('TestHygieneAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('declares all expected canonical rules', () => {
      expect(TEST_HYGIENE_RULES).toContain('no-tautological-integration-mocks');
      expect(TEST_HYGIENE_RULES).toContain('playwright-id-locators-only');
      expect(TEST_HYGIENE_RULES).toContain('no-playwright-force-click');
      expect(TEST_HYGIENE_RULES).toContain('no-test-timeout-inflation');
      expect(TEST_HYGIENE_RULES).toContain('no-playwright-polling-waits');
    });

    it('initializes with correct id and family', () => {
      const auditor = new TestHygieneAuditor();
      expect(auditor.id).toBe('validate_test_hygiene');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toContain('no-tautological-integration-mocks');
    });
  });

  describe('Violation Detection', () => {
    it('detects tautological database mocks in integration tests (no-tautological-integration-mocks)', () => {
      const auditor = new TestableTestHygieneAuditor();
      const code = `
        import { vi } from 'vitest';
        vi.mock('@/logic/db/supabase', () => ({}));
      `;
      auditor.testScanFile('tests/integration/billing.test.ts', code);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'no-tautological-integration-mocks');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects text-based locators in E2E specs (playwright-id-locators-only)', () => {
      const auditor = new TestableTestHygieneAuditor();
      const code = `
        await page.getByText('Submit Order').click();
      `;
      auditor.testScanFile('tests/e2e/order.spec.ts', code);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'playwright-id-locators-only');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects force-click in E2E specs (no-playwright-force-click)', () => {
      const auditor = new TestableTestHygieneAuditor();
      const code = `
        await page.locator('#btn-save').click({ force: true });
      `;
      auditor.testScanFile('tests/e2e/save.spec.ts', code);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'no-playwright-force-click');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects page.waitForTimeout polling sleeps in E2E specs (no-playwright-polling-waits)', () => {
      const auditor = new TestableTestHygieneAuditor();
      const code = `
        await page.waitForTimeout(3000);
      `;
      auditor.testScanFile('tests/e2e/wait.spec.ts', code);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'no-playwright-polling-waits');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects test timeout inflation > 30000ms (no-test-timeout-inflation)', () => {
      const auditor = new TestableTestHygieneAuditor();
      const code = `
        export default { testTimeout: 60000 };
      `;
      auditor.testScanFile('tests/node/heavy.test.ts', code);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'no-test-timeout-inflation');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('allows exceptions with valid escape hatches', () => {
      const auditor = new TestableTestHygieneAuditor();
      const code = `
        vi.mock('@/logic/db/supabase', () => ({})); // mock-ok: Isolated mock
        await page.getByText('Accept').click(); // locator-ok: Third-party iframe
        await page.locator('#btn').click({ force: true }); // force-ok: Animated overlap
        await page.waitForTimeout(100); // wait-ok: Frame buffer tick
      `;
      auditor.testScanFile('tests/integration/escaped.test.ts', code);
      auditor.testScanFile('tests/e2e/escaped.spec.ts', code);
      expect(auditor.collectedViolations).toHaveLength(0);
    });
  });

  describe('Clean Execution', () => {
    it('runs on compliant test suites and reports zero errors', async () => {
      const auditor = new TestableTestHygieneAuditor();
      const e2eCode = `
        await page.locator('#input-username').fill('admin');
        await page.locator('#btn-login').click();
        await expect(page.locator('#dashboard-header')).toBeVisible();
      `;
      auditor.testScanFile('tests/e2e/clean_login.spec.ts', e2eCode);
      expect(auditor.collectedViolations).toHaveLength(0);

      const result = await auditor.finishAudit();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});
