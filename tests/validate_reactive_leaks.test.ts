/**
 * packages/auditor/tests/validate_reactive_leaks.test.ts
 *
 * Dedicated unit test suite for ReactiveLeaksAuditor:
 * - Detects uncleaned addEventListener in components (dom-event-leak)
 * - Detects uncleaned setInterval in components (interval-leak)
 * - Allows addEventListener with onUnmounted / removeEventListener / { once: true }
 * - Verifies clean execution (0 errors, passed status)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import {
  ReactiveLeaksAuditor,
  REACTIVE_LEAK_RULES,
  type ReactiveLeakRuleId
} from '../src/suites/architecture/validate_reactive_leaks.ts';
import type { ViolationInput } from '../src/core/auditorBase.ts';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

class TestableReactiveLeaksAuditor extends ReactiveLeaksAuditor {
  public readonly collectedViolations: ViolationInput<ReactiveLeakRuleId>[] = [];

  public override addViolation(v: ViolationInput<ReactiveLeakRuleId>): void {
    this.collectedViolations.push(v);
    super.addViolation(v);
  }

  public testScanFile(relPath: string, content: string): void {
    this.scanFile(relPath, content);
  }
}

describe('ReactiveLeaksAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('declares all expected canonical rules', () => {
      expect(REACTIVE_LEAK_RULES).toContain('dom-event-leak');
      expect(REACTIVE_LEAK_RULES).toContain('interval-leak');
    });

    it('instantiates with correct metadata', () => {
      const auditor = new ReactiveLeaksAuditor([], PROJECT_ROOT);
      expect(auditor.id).toBe('validate_reactive_leaks');
      expect(auditor.family).toBe('architecture');
      expect(auditor.description.length).toBeLessThanOrEqual(60);
      expect(auditor.ruleIds).toEqual(REACTIVE_LEAK_RULES);
    });
  });

  describe('Violation Detection', () => {
    it('detects uncleaned addEventListener in component without unmount hook (dom-event-leak)', () => {
      const auditor = new TestableReactiveLeaksAuditor([], PROJECT_ROOT);
      const badCode = `
        <script setup lang="ts">
        window.addEventListener('resize', () => {});
        </script>
      `;

      auditor.testScanFile('src/components/LeakTest.vue', badCode);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'dom-event-leak');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('allows addEventListener when onUnmounted or removeEventListener is present', () => {
      const auditor = new TestableReactiveLeaksAuditor([], PROJECT_ROOT);
      const goodCode = `
        <script setup lang="ts">
        import { onUnmounted } from 'vue';
        const handler = () => {};
        window.addEventListener('resize', handler);
        onUnmounted(() => {
          window.removeEventListener('resize', handler);
        });
        </script>
      `;

      auditor.testScanFile('src/components/CleanTest.vue', goodCode);
      expect(auditor.collectedViolations).toHaveLength(0);
    });

    it('allows addEventListener with { once: true }', () => {
      const auditor = new TestableReactiveLeaksAuditor([], PROJECT_ROOT);
      const onceCode = `
        <script setup lang="ts">
        window.addEventListener('load', () => {}, { once: true });
        </script>
      `;

      auditor.testScanFile('src/components/OnceTest.vue', onceCode);
      expect(auditor.collectedViolations).toHaveLength(0);
    });

    it('detects uncleaned setInterval (interval-leak)', () => {
      const auditor = new TestableReactiveLeaksAuditor([], PROJECT_ROOT);
      const badCode = `
        <script setup lang="ts">
        setInterval(() => {}, 1000);
        </script>
      `;

      auditor.testScanFile('src/components/IntervalLeak.vue', badCode);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'interval-leak');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });
  });

  describe('Clean Execution', () => {
    it('runs audit on clean files and reports zero errors', async () => {
      const auditor = new TestableReactiveLeaksAuditor([], PROJECT_ROOT);
      const goodCode = `<script setup lang="ts">\nconst x = 1;\n</script>`;
      auditor.testScanFile('src/components/Clean.vue', goodCode);
      expect(auditor.collectedViolations).toHaveLength(0);

      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});
