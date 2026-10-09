/**
 * packages/auditor/tests/validate_vue_sfc_hygiene.test.ts
 *
 * Dedicated unit test suite for VueSfcHygieneAuditor:
 * - Options API export default or script without setup (script-setup-required)
 * - Prohibited exports inside <script setup> (no-script-setup-exports)
 * - Template quote escaping errors (vue-template-quote-escaping)
 * - Heavy data provider invocations in template (no-data-provider-in-template)
 * - Honors escape hatches (sfc-ok, template-ok)
 * - Verifies clean execution (0 errors, passed status)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  VueSfcHygieneAuditor,
  VUE_SFC_HYGIENE_RULES
} from '../src/suites/architecture/validate_vue_sfc_hygiene.ts';
import type { ViolationInput } from '../src/core/auditorBase.ts';
import type { VueSfcHygieneRuleId } from '../src/suites/architecture/validate_vue_sfc_hygiene.ts';

class TestableVueSfcHygieneAuditor extends VueSfcHygieneAuditor {
  public readonly collectedViolations: ViolationInput<VueSfcHygieneRuleId>[] = [];

  public override addViolation(v: ViolationInput<VueSfcHygieneRuleId>): void {
    this.collectedViolations.push(v);
    super.addViolation(v);
  }

  public testScanFile(relPath: string, content: string): void {
    this.scanFile(relPath, content);
  }
}

describe('VueSfcHygieneAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('declares all expected canonical rules', () => {
      expect(VUE_SFC_HYGIENE_RULES).toContain('script-setup-required');
      expect(VUE_SFC_HYGIENE_RULES).toContain('no-script-setup-exports');
      expect(VUE_SFC_HYGIENE_RULES).toContain('vue-template-quote-escaping');
      expect(VUE_SFC_HYGIENE_RULES).toContain('no-data-provider-in-template');
    });

    it('initializes with correct id and family', () => {
      const auditor = new VueSfcHygieneAuditor();
      expect(auditor.id).toBe('validate_vue_sfc_hygiene');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toContain('script-setup-required');
    });
  });

  describe('Violation Detection', () => {
    it('detects Options API export default (script-setup-required)', () => {
      const auditor = new TestableVueSfcHygieneAuditor();
      const sfc = `
        <template><div>Hello</div></template>
        <script lang="ts">
          export default {
            name: 'OldComponent'
          };
        </script>
      `;
      auditor.testScanFile('src/components/Old.vue', sfc);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'script-setup-required');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects <script> lacking setup attribute (script-setup-required)', () => {
      const auditor = new TestableVueSfcHygieneAuditor();
      const sfc = `
        <template><div>Hello</div></template>
        <script lang="ts">
          const a = 1;
        </script>
      `;
      auditor.testScanFile('src/components/NoSetup.vue', sfc);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'script-setup-required');
      expect(violation).toBeDefined();
    });

    it('detects exports inside <script setup> (no-script-setup-exports)', () => {
      const auditor = new TestableVueSfcHygieneAuditor();
      const sfc = `
        <template><div>Hello</div></template>
        <script setup lang="ts">
          export const MY_DATA = 42;
        </script>
      `;
      auditor.testScanFile('src/components/Exported.vue', sfc);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'no-script-setup-exports');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects unescaped double quotes inside attribute bindings (vue-template-quote-escaping)', () => {
      const auditor = new TestableVueSfcHygieneAuditor();
      const sfc = `
        <template>
          <img :alt="name || \\"default\\"" />
        </template>
        <script setup lang="ts">
          const name = 'test';
        </script>
      `;
      auditor.testScanFile('src/components/Quotes.vue', sfc);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'vue-template-quote-escaping');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects direct data provider invocations in template (no-data-provider-in-template)', () => {
      const auditor = new TestableVueSfcHygieneAuditor();
      const sfc = `
        <template>
          <div>{{ tariffDataProvider.getRate(123) }}</div>
        </template>
        <script setup lang="ts">
        </script>
      `;
      auditor.testScanFile('src/components/DirectCall.vue', sfc);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'no-data-provider-in-template');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects direct database identifiers in template (no-data-provider-in-template)', () => {
      const auditor = new TestableVueSfcHygieneAuditor();
      const sfc = `
        <template>
          <div>{{ supabase.from('users').select() }}</div>
        </template>
        <script setup lang="ts">
        </script>
      `;
      auditor.testScanFile('src/components/DbTemplate.vue', sfc);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'no-data-provider-in-template');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('allows exceptions with // sfc-ok and // template-ok escape hatches', () => {
      const auditor = new TestableVueSfcHygieneAuditor();
      const sfc = `
        <template>
          <div>{{ tariffDataProvider.getRate(123) }}</div> <!-- template-ok: One-off debug probe -->
        </template>
        <script lang="ts"> // sfc-ok: Legacy wrapper
          export default { name: 'Wrapper' }; // sfc-ok: Legacy wrapper
        </script>
      `;
      auditor.testScanFile('src/components/Exempt.vue', sfc);
      expect(auditor.collectedViolations).toHaveLength(0);
    });
  });

  describe('Clean Execution', () => {
    it('runs on compliant Vue SFCs and reports zero errors', async () => {
      const auditor = new TestableVueSfcHygieneAuditor();
      const sfc = `
        <template>
          <div :title="tooltipText">
            <span>{{ formattedTotal }}</span>
          </div>
        </template>
        <script setup lang="ts">
          import { ref, computed } from 'vue';
          const total = ref(100);
          const tooltipText = 'Current Total';
          const formattedTotal = computed(() => '$' + total.value);
        </script>
      `;
      auditor.testScanFile('src/components/CleanComponent.vue', sfc);
      expect(auditor.collectedViolations).toHaveLength(0);

      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});
