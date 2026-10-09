/**
 * tests/validate_gsap_framework_hygiene.test.ts
 *
 * Unit tests for ValidateGsapFrameworkHygieneAuditor fulfilling BaseAuditor 5-point contract:
 * 1. Instantiation and metadata conformance
 * 2. Clean path verification (status === 'passed', errors === 0)
 * 3. Violation detection (status === 'failed', severity === 'error')
 * 4. Warning path verification
 * 5. 100% of declared rule IDs tested
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ValidateGsapFrameworkHygieneAuditor,
  GSAP_FRAMEWORK_HYGIENE_RULES,
  type GsapFrameworkHygieneRuleId
} from '../src/suites/architecture/validate_gsap_framework_hygiene.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import type { ViolationInput } from '../src/core/auditorBase.ts';

class TestableGsapFrameworkHygieneAuditor extends ValidateGsapFrameworkHygieneAuditor {
  public readonly recordedViolations: ViolationInput<GsapFrameworkHygieneRuleId>[] = [];

  public override addViolation(v: ViolationInput<GsapFrameworkHygieneRuleId>): void {
    this.recordedViolations.push(v);
    super.addViolation(v);
  }

  public testScanFile(relPath: string, content: string): void {
    this.scanFile(relPath, content);
  }
}

describe('ValidateGsapFrameworkHygieneAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Contract Conformance', () => {
    it('fulfills BaseAuditor metadata and construction contract', () => {
      const auditor = new ValidateGsapFrameworkHygieneAuditor();
      validateAuditorConstruction(auditor);
      expect(auditor.id).toBe('validate_gsap_framework_hygiene');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toEqual(GSAP_FRAMEWORK_HYGIENE_RULES);
      expect(auditor.ruleIds.length).toBe(4);
    });
  });

  describe('Clean Path', () => {
    it('passes cleanly when component correctly manages GSAP scope, context, and plugin registration', async () => {
      const auditor = new TestableGsapFrameworkHygieneAuditor();

      // Clean Vue component with gsap.context and revert on unmount
      auditor.testScanFile(
        'src/components/CleanHero.vue',
        `<script setup lang="ts">
        import { ref, onMounted, onUnmounted } from 'vue';
        import gsap from 'gsap';
        import { Flip } from 'gsap/Flip';

        gsap.registerPlugin(Flip);

        const root = ref<HTMLElement | null>(null);
        let ctx: gsap.Context | undefined;

        onMounted(() => {
          if (!root.value) return;
          ctx = gsap.context(() => {
            gsap.to('.card', { opacity: 1 });
          }, root.value);
        });

        onUnmounted(() => {
          ctx?.revert();
        });

        if (import.meta.env.DEV) {
          GSDevTools.create();
        }
        </script>`
      );

      const result = await auditor.finishAudit();
      expect(result.status).toBe('passed');
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(auditor.recordedViolations).toHaveLength(0);
    });
  });

  describe('Violation Detection (All 4 Rules)', () => {
    it('detects unscoped global selector inside UI component', () => {
      const auditor = new TestableGsapFrameworkHygieneAuditor();
      auditor.testScanFile(
        'src/components/UnscopedCard.vue',
        `<script setup lang="ts">
        import gsap from 'gsap';

        function animate() {
          gsap.to('.card', { x: 100 });
        }
        </script>`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-unscoped-component-selectors');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects unscoped selector outside gsap.context even when another gsap.context exists in the same component', () => {
      const auditor = new TestableGsapFrameworkHygieneAuditor();
      auditor.testScanFile(
        'src/components/MixedContext.vue',
        `<script setup lang="ts">
        import { ref, onMounted, onUnmounted } from 'vue';
        import gsap from 'gsap';

        const root = ref(null);
        let ctx: gsap.Context | undefined;

        onMounted(() => {
          ctx = gsap.context(() => {
            gsap.to('.scoped-card', { opacity: 1 });
          }, root.value);
        });

        onUnmounted(() => {
          ctx?.revert();
        });

        function handleOrphanClick() {
          // This tween is outside gsap.context, unscoped!
          gsap.to('.unscoped-banner', { x: 50 });
        }
        </script>`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-unscoped-component-selectors');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
      expect(violations[0]?.message).toContain('.unscoped-banner');
    });

    it('detects missing context.revert() on component unmount', () => {
      const auditor = new TestableGsapFrameworkHygieneAuditor();
      auditor.testScanFile(
        'src/components/LeakingContext.vue',
        `<script setup lang="ts">
        import { ref, onMounted } from 'vue';
        import gsap from 'gsap';

        const root = ref(null);
        onMounted(() => {
          gsap.context(() => {
            gsap.to('.card', { opacity: 1 });
          }, root.value);
        });
        </script>`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-missing-context-revert');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects imported GSAP plugin without registerPlugin call', () => {
      const auditor = new TestableGsapFrameworkHygieneAuditor();
      auditor.testScanFile(
        'src/features/unregisteredPlugin.ts',
        `import { Draggable } from 'gsap/Draggable';

        Draggable.create('.box', { type: 'x,y' });`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-missing-plugin-registration');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects GSDevTools in source code without dev environment guard', () => {
      const auditor = new TestableGsapFrameworkHygieneAuditor();
      auditor.testScanFile(
        'src/features/leakedDevtools.ts',
        `import { GSDevTools } from 'gsap/GSDevTools';

        GSDevTools.create();`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-banned-devtools-production');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });
  });

  describe('Escape Hatches & Suppressions', () => {
    it('honors // scope-ok: line suppression for component selector', () => {
      const auditor = new TestableGsapFrameworkHygieneAuditor();
      auditor.testScanFile(
        'src/components/SuppressedSelector.vue',
        `<script setup lang="ts">
        import gsap from 'gsap';
        gsap.to('.global-overlay', { opacity: 0 }); // scope-ok: intentional full-page portal
        </script>`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-unscoped-component-selectors');
      expect(violations).toHaveLength(0);
    });

    it('honors // scope-ok: suppression placed on preceding line', () => {
      const auditor = new TestableGsapFrameworkHygieneAuditor();
      auditor.testScanFile(
        'src/components/SuppressedPrecedingSelector.vue',
        `<script setup lang="ts">
        import gsap from 'gsap';
        // scope-ok: intentional full-page portal
        gsap.to('.global-overlay', { opacity: 0 });
        </script>`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-unscoped-component-selectors');
      expect(violations).toHaveLength(0);
    });

    it('detects unscoped selector on timeline instances', () => {
      const auditor = new TestableGsapFrameworkHygieneAuditor();
      auditor.testScanFile(
        'src/components/TimelineSelector.vue',
        `<script setup lang="ts">
        import gsap from 'gsap';
        const tl = gsap.timeline();
        tl.to('.unscoped-item', { opacity: 1 });
        </script>`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-unscoped-component-selectors');
      expect(violations.length).toBe(1);
    });
  });
});
