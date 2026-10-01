/**
 * packages/auditor/tests/validate_test_fragmentation.test.ts
 *
 * Dedicated unit test suite for TestFragmentationAuditor:
 * - Micro-test fragmentation under 60 lines (no-fragmented-tests)
 * - Unnecessary JSDOM overhead (unnecessary-jsdom)
 * - Whitelist and escape hatches (test-fragmentation-ok, jsdom-ok)
 * - Verifies clean execution (0 errors, passed status)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TestFragmentationAuditor,
  TEST_FRAGMENTATION_RULES
} from '../src/suites/architecture/validate_test_fragmentation.ts';
import type { ViolationInput } from '../src/core/auditorBase.ts';
import type { TestFragmentationRuleId } from '../src/suites/architecture/validate_test_fragmentation.ts';

class TestableTestFragmentationAuditor extends TestFragmentationAuditor {
  public readonly collectedViolations: ViolationInput<TestFragmentationRuleId>[] = [];

  public override addViolation(v: ViolationInput<TestFragmentationRuleId>): void {
    this.collectedViolations.push(v);
    super.addViolation(v);
  }

  public testScanFile(relPath: string, content: string): void {
    this.scanFile(relPath, content);
  }
}

describe('TestFragmentationAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('declares all expected canonical rules', () => {
      expect(TEST_FRAGMENTATION_RULES).toContain('no-fragmented-tests');
      expect(TEST_FRAGMENTATION_RULES).toContain('unnecessary-jsdom');
    });

    it('initializes with correct id and family', () => {
      const auditor = new TestFragmentationAuditor();
      expect(auditor.id).toBe('validate_test_fragmentation');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toContain('no-fragmented-tests');
      expect(auditor.ruleIds).toContain('unnecessary-jsdom');
    });
  });

  describe('Violation Detection', () => {
    it('detects fragmented micro-test files under 60 lines (no-fragmented-tests)', () => {
      const auditor = new TestableTestFragmentationAuditor();
      const code = `
        import { describe, it, expect } from 'vitest';
        describe('Tiny', () => {
          it('works', () => {
            expect(1).toBe(1);
          });
        });
      `;
      auditor.testScanFile('tests/unit/tiny.test.ts', code);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'no-fragmented-tests');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects unnecessary jsdom when no DOM or Vue mount is used (unnecessary-jsdom)', () => {
      const auditor = new TestableTestFragmentationAuditor();
      const lines = new Array(70).fill('// padding line');
      const code = [
        '// ' + '@vitest-environment jsdom',
        "import { describe, it, expect } from 'vitest';",
        ...lines,
        "describe('Pure Math', () => { it('adds', () => { expect(1 + 1).toBe(2); }); });"
      ].join('\n');

      auditor.testScanFile('tests/unit/math.test.ts', code);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'unnecessary-jsdom');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('allows micro-test when marked with // test-fragmentation-ok', () => {
      const auditor = new TestableTestFragmentationAuditor();
      const code = `
        // test-fragmentation-ok: Isolated test runner
        import { describe, it, expect } from 'vitest';
        describe('Tiny', () => { it('runs', () => expect(true).toBe(true)); });
      `;
      auditor.testScanFile('tests/unit/exempt.test.ts', code);
      expect(auditor.collectedViolations).toHaveLength(0);
    });

    it('allows jsdom when mounting Vue components or accessing window', () => {
      const auditor = new TestableTestFragmentationAuditor();
      const lines = new Array(70).fill('// padding line');
      const code = [
        '// ' + '@vitest-environment jsdom',
        "import { describe, it, expect } from 'vitest';",
        "import { mount } from '@vue/test-utils';",
        ...lines,
        "describe('Vue UI', () => { it('mounts', () => { window.scrollTo(0, 0); }); });"
      ].join('\n');

      auditor.testScanFile('tests/unit/component.test.ts', code);
      expect(auditor.collectedViolations).toHaveLength(0);
    });
  });

  describe('Clean Execution', () => {
    it('runs on compliant, domain-cohesive test suites and reports zero errors', async () => {
      const auditor = new TestableTestFragmentationAuditor();
      const lines = new Array(80).fill('// cohesive test logic line');
      const code = [
        "import { describe, it, expect } from 'vitest';",
        ...lines,
        "describe('Billing', () => { it('computes tariffs', () => { expect(100).toBe(100); }); });"
      ].join('\n');

      auditor.testScanFile('tests/unit/billing_cohesive.test.ts', code);
      expect(auditor.collectedViolations).toHaveLength(0);

      const result = await auditor.finishAudit();
      expect(result.id).toBe('validate_test_fragmentation');
      expect(result.summary).toBeDefined();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});
