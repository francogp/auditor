/**
 * packages/auditor/tests/validate_pinia_reactivity.test.ts
 *
 * Dedicated unit test suite for PiniaReactivityAuditor:
 * - Detects direct and indirect store destructuring without storeToRefs (no-store-destructuring-without-storetorefs)
 * - Detects direct store.$state mutation outside authorized files (no-direct-state-mutation-outside-actions)
 * - Honors escape hatch comments (// pinia-ok)
 * - Verifies clean execution (0 errors, passed status)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import {
  PiniaReactivityAuditor,
  PINIA_REACTIVITY_RULES,
  type PiniaReactivityRuleId
} from '../src/suites/architecture/validate_pinia_reactivity.ts';
import type { ViolationInput } from '../src/core/auditorBase.ts';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

class TestablePiniaReactivityAuditor extends PiniaReactivityAuditor {
  public readonly collectedViolations: ViolationInput<PiniaReactivityRuleId>[] = [];

  public override addViolation(v: ViolationInput<PiniaReactivityRuleId>): void {
    this.collectedViolations.push(v);
    super.addViolation(v);
  }

  public testScanFile(relPath: string, content: string): void {
    this.scanFile(relPath, content);
  }
}

describe('PiniaReactivityAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('declares all expected canonical rules', () => {
      expect(PINIA_REACTIVITY_RULES).toContain('no-store-destructuring-without-storetorefs');
      expect(PINIA_REACTIVITY_RULES).toContain('no-direct-state-mutation-outside-actions');
    });

    it('initializes with correct id and family', () => {
      const auditor = new PiniaReactivityAuditor([], PROJECT_ROOT);
      expect(auditor.id).toBe('validate_pinia_reactivity');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toEqual(PINIA_REACTIVITY_RULES);
    });
  });

  describe('Violation Detection', () => {
    it('detects direct store destructuring without storeToRefs (no-store-destructuring-without-storetorefs)', () => {
      const auditor = new TestablePiniaReactivityAuditor([], PROJECT_ROOT);
      const badCode = `
        import { useBillingProjectStore } from '@/stores/billingProjectStore';
        const { currentProject, projects } = useBillingProjectStore();
      `;

      auditor.testScanFile('src/components/MyComponent.vue', badCode);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'no-store-destructuring-without-storetorefs');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('allows storeToRefs pattern', () => {
      const auditor = new TestablePiniaReactivityAuditor([], PROJECT_ROOT);
      const goodCode = `
        import { storeToRefs } from 'pinia';
        import { useBillingProjectStore } from '@/stores/billingProjectStore';
        const billingStore = useBillingProjectStore();
        const { currentProject, projects } = storeToRefs(billingStore);
      `;

      auditor.testScanFile('src/components/MyComponent.vue', goodCode);
      expect(auditor.collectedViolations).toHaveLength(0);
    });

    it('detects indirect store destructuring without storeToRefs', () => {
      const auditor = new TestablePiniaReactivityAuditor([], PROJECT_ROOT);
      const badCode = `
        import { useBillingProjectStore } from '@/stores/billingProjectStore';
        const billingStore = useBillingProjectStore();
        const { currentProject, projects } = billingStore;
      `;

      auditor.testScanFile('src/components/MyComponent.vue', badCode);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'no-store-destructuring-without-storetorefs');
      expect(violation).toBeDefined();
    });

    it('allows action destructuring with // pinia-ok', () => {
      const auditor = new TestablePiniaReactivityAuditor([], PROJECT_ROOT);
      const goodCode = `
        import { useBillingProjectStore } from '@/stores/billingProjectStore';
        const { resetProject } = useBillingProjectStore(); // pinia-ok: pure action destructuring without state
      `;

      auditor.testScanFile('src/components/MyComponent.vue', goodCode);
      expect(auditor.collectedViolations).toHaveLength(0);
    });

    it('detects direct store.$state mutation outside authorized files (no-direct-state-mutation-outside-actions)', () => {
      const auditor = new TestablePiniaReactivityAuditor([], PROJECT_ROOT);
      const badCode = `
        billingStore.$state = { ...billingStore.$state, currentProject: null };
      `;

      auditor.testScanFile('src/components/Cheater.vue', badCode);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'no-direct-state-mutation-outside-actions');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });
  });

  describe('Clean Execution', () => {
    it('runs audit on clean files and reports zero errors', async () => {
      const auditor = new TestablePiniaReactivityAuditor([], PROJECT_ROOT);
      const goodCode = `
        import { storeToRefs } from 'pinia';
        import { useBillingProjectStore } from '@/stores/billingProjectStore';
        const billingStore = useBillingProjectStore();
        const { currentProject } = storeToRefs(billingStore);
      `;
      auditor.testScanFile('src/components/CleanComponent.vue', goodCode);
      expect(auditor.collectedViolations).toHaveLength(0);

      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});
