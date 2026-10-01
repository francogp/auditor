/**
 * packages/auditor/tests/validate_reactive_purity.test.ts
 *
 * Dedicated unit test suite for ReactivePurityAuditor:
 * - Detects reactive state mutation inside computed() (computed-state-mutation)
 * - Detects impure side-effect calls inside computed() (computed-side-effect)
 * - Honors // purity-ok: <reason> escape hatch
 * - Verifies clean execution (0 errors, passed status)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ReactivePurityAuditor,
  REACTIVE_PURITY_RULES,
  type ReactivePurityRuleId
} from '../src/suites/architecture/validate_reactive_purity.ts';

import type { ViolationInput } from '../src/core/auditorBase.ts';

class TestableReactivePurityAuditor extends ReactivePurityAuditor {
  public readonly collectedViolations: ViolationInput<ReactivePurityRuleId>[] = [];

  public override addViolation(v: ViolationInput<ReactivePurityRuleId>): void {
    this.collectedViolations.push(v);
    super.addViolation(v);
  }

  public testScanFile(relPath: string, content: string): void {
    this.scanFile(relPath, content);
  }
}

describe('ReactivePurityAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('declares all canonical rules', () => {
      expect(REACTIVE_PURITY_RULES).toContain('computed-state-mutation');
      expect(REACTIVE_PURITY_RULES).toContain('computed-side-effect');
    });

    it('initializes with correct id and family', () => {
      const auditor = new ReactivePurityAuditor();
      expect(auditor.id).toBe('validate_reactive_purity');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toContain('computed-state-mutation');
      expect(auditor.ruleIds).toContain('computed-side-effect');
    });
  });

  describe('Violation Detection', () => {
    it('detects state mutation inside arrow computed getter (computed-state-mutation)', () => {
      const auditor = new TestableReactivePurityAuditor();
      const code = `
        import { ref, computed } from 'vue';
        const count = ref(0);
        const double = computed(() => {
          count.value = count.value + 1;
          return count.value * 2;
        });
      `;
      auditor.testScanFile('src/composables/useCount.ts', code);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'computed-state-mutation');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects state mutation inside object computed getter (computed-state-mutation)', () => {
      const auditor = new TestableReactivePurityAuditor();
      const code = `
        import { ref, computed } from 'vue';
        const total = ref(100);
        const formatted = computed({
          get: () => {
            total.value += 10;
            return '$' + total.value;
          },
          set: (v) => {}
        });
      `;
      auditor.testScanFile('src/stores/billingStore.ts', code);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'computed-state-mutation');
      expect(violation).toBeDefined();
    });

    it('detects side-effect persistence call inside computed getter (computed-side-effect)', () => {
      const auditor = new TestableReactivePurityAuditor();
      const code = `
        import { ref, computed } from 'vue';
        const user = ref({ name: 'Test' });
        const summary = computed(() => {
          scheduleSave();
          return user.value.name;
        });
      `;
      auditor.testScanFile('src/stores/userStore.ts', code);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'computed-side-effect');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('allows mutation when marked with // purity-ok escape hatch', () => {
      const auditor = new TestableReactivePurityAuditor();
      const code = `
        import { ref, computed } from 'vue';
        const cached = ref(null);
        const data = computed(() => {
          cached.value = 1; // purity-ok: Internal memoization cache
          return cached.value;
        });
      `;
      auditor.testScanFile('src/composables/useMemo.ts', code);
      expect(auditor.collectedViolations).toHaveLength(0);
    });
  });

  describe('Clean Execution', () => {
    it('runs on pure computed functions and reports zero errors', async () => {
      const auditor = new TestableReactivePurityAuditor();
      const cleanCode = `
        import { ref, computed } from 'vue';
        const price = ref(100);
        const tax = ref(0.21);
        const total = computed(() => price.value * (1 + tax.value));
      `;
      auditor.testScanFile('src/composables/usePricing.ts', cleanCode);
      expect(auditor.collectedViolations).toHaveLength(0);

      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});
