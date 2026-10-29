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

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import type { ViolationInput } from '../src/core/auditorBase.ts';
import {
  VueSfcHygieneAuditor,
  VUE_SFC_HYGIENE_RULES
} from '../src/suites/architecture/validate_vue_sfc_hygiene.ts';
import type { VueSfcHygieneRuleId } from '../src/suites/architecture/validate_vue_sfc_hygiene.ts';

class TestableVueSfcHygieneAuditor extends VueSfcHygieneAuditor {
  public readonly collectedViolations: ViolationInput<VueSfcHygieneRuleId>[] = [];

  public override addViolation(v: ViolationInput<VueSfcHygieneRuleId>): void {
    this.collectedViolations.push(v);
    super.addViolation(v);
  }

  public override testScanFile(relPath: string, content: string): void {
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
      expect(VUE_SFC_HYGIENE_RULES).toContain('vue-template-magic-calculation');
      expect(VUE_SFC_HYGIENE_RULES).toContain('ime-unsafe-enter-submit');
      expect(VUE_SFC_HYGIENE_RULES).toContain('vue-template-no-side-effects');
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
      const violation = auditor.collectedViolations.find(
        (v) => v.ruleId === 'script-setup-required'
      );
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
      const violation = auditor.collectedViolations.find(
        (v) => v.ruleId === 'script-setup-required'
      );
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
      const violation = auditor.collectedViolations.find(
        (v) => v.ruleId === 'no-script-setup-exports'
      );
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
      const violation = auditor.collectedViolations.find(
        (v) => v.ruleId === 'vue-template-quote-escaping'
      );
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
      const violation = auditor.collectedViolations.find(
        (v) => v.ruleId === 'no-data-provider-in-template'
      );
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
      const violation = auditor.collectedViolations.find(
        (v) => v.ruleId === 'no-data-provider-in-template'
      );
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects violations even when // sfc-ok and <!-- template-ok --> comments are present (Zero-Ignore Mandate)', () => {
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
      expect(auditor.collectedViolations.length).toBeGreaterThan(0);
    });

    it('does not produce false positives for HTML comments, static classes or static text containing "db" or "supabase"', () => {
      const auditor = new TestableVueSfcHygieneAuditor();
      // Reproduce exact patterns from DevShadowHeaderToolbar.vue and PokemonSummaryTab.vue
      const sfc = `
        <template>
          <!-- DB Info and Diagnostics Panel -->
          <div class="db-info-section shadow-card">
            <span class="label">ID ÚNICO DB:</span>
            <span class="val">{{ userId }}</span>
            <button :class="{ active: currentTab === 'db' }">Pestaña DB</button>
          </div>
        </template>
        <script setup lang="ts">
          import { ref } from 'vue';
          const userId = ref('usr_123');
          const currentTab = ref('db');
        </script>
      `;
      auditor.testScanFile('src/components/PokemonSummaryTab.vue', sfc);
      const violations = auditor.collectedViolations.filter(
        (v) => v.ruleId === 'no-data-provider-in-template'
      );
      expect(violations).toHaveLength(0);
    });

    it('detects prohibited database access in dynamic event handlers like @click="supabase.auth.signOut()"', () => {
      const auditor = new TestableVueSfcHygieneAuditor();
      const sfc = `
        <template>
          <button @click="supabase.auth.signOut()">Salir</button>
        </template>
        <script setup lang="ts">
        </script>
      `;
      auditor.testScanFile('src/components/SignOutButton.vue', sfc);
      const violation = auditor.collectedViolations.find(
        (v) => v.ruleId === 'no-data-provider-in-template'
      );
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects inline arithmetic calculations with numbers in template (vue-template-magic-calculation)', () => {
      const auditor = new TestableVueSfcHygieneAuditor();
      const sfc = `
        <template>
          <div>{{ price * 1.21 }}</div>
        </template>
        <script setup lang="ts">
          const price = 100;
        </script>
      `;
      auditor.testScanFile('src/components/CalcPrice.vue', sfc);
      const violation = auditor.collectedViolations.find(
        (v) => v.ruleId === 'vue-template-magic-calculation'
      );
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
      expect(violation?.message).toContain('* 1.21');
    });

    it('detects magic number comparisons in directives (vue-template-magic-calculation)', () => {
      const auditor = new TestableVueSfcHygieneAuditor();
      const sfc = `
        <template>
          <div v-if="items.length > 5">More than five</div>
        </template>
        <script setup lang="ts">
          const items = ['a', 'b'];
        </script>
      `;
      auditor.testScanFile('src/components/CompareMagic.vue', sfc);
      const violation = auditor.collectedViolations.find(
        (v) => v.ruleId === 'vue-template-magic-calculation'
      );
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
      expect(violation?.message).toContain('> 5');
    });

    it('allows valid markup props, 0/1 comparisons, and index + 1 without violations', () => {
      const auditor = new TestableVueSfcHygieneAuditor();
      const sfc = `
        <template>
          <div :cols="2" :span="12">
            <span v-if="items.length === 0">Vacío</span>
            <span v-if="items.length > 0">Con items</span>
            <p>{{ index + 1 }}</p>
          </div>
        </template>
        <script setup lang="ts">
          const items = [];
          const index = 0;
        </script>
      `;
      auditor.testScanFile('src/components/ValidTemplate.vue', sfc);
      const violations = auditor.collectedViolations.filter(
        (v) => v.ruleId === 'vue-template-magic-calculation'
      );
      expect(violations).toHaveLength(0);
    });

    it('detects ime-unsafe-enter-submit and vue-template-no-side-effects on fixture and auto-repairs via --fix', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vue-hygiene-fix-'));
      try {
        const fixtureContent = fs.readFileSync(
          path.resolve(import.meta.dirname, 'fixtures/modern_web/VueHygieneBroken.vue.cases'),
          'utf-8'
        );
        const compDir = path.join(tempDir, 'src/components');
        fs.mkdirSync(compDir, { recursive: true });
        const targetFile = path.join(compDir, 'VueHygieneBroken.vue');
        fs.writeFileSync(targetFile, fixtureContent, 'utf-8');

        const checkAuditor = new TestableVueSfcHygieneAuditor({ projectRoot: tempDir });
        checkAuditor.testScanFile('src/components/VueHygieneBroken.vue', fixtureContent);

        const ruleSet = new Set(checkAuditor.collectedViolations.map((v) => v.ruleId));
        expect(ruleSet.has('ime-unsafe-enter-submit')).toBe(true);
        expect(ruleSet.has('vue-template-no-side-effects')).toBe(true);

        // Run in --fix mode
        const fixAuditor = new TestableVueSfcHygieneAuditor({
          projectRoot: tempDir,
          fix: true
        });
        fixAuditor.testScanFile('src/components/VueHygieneBroken.vue', fixtureContent);

        const fixedSfc = fs.readFileSync(targetFile, 'utf-8');
        expect(fixedSfc).toContain("e.key === 'Enter' && !e.isComposing");
        expect(fixedSfc).toContain('items.toSorted()');
        expect(fixedSfc).toContain('tags.toReversed()');

        // Re-verify 0 errors on repaired file
        const verifyAuditor = new TestableVueSfcHygieneAuditor({ projectRoot: tempDir });
        verifyAuditor.testScanFile('src/components/VueHygieneBroken.vue', fixedSfc);
        expect(verifyAuditor.collectedViolations).toHaveLength(0);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('avoids false positives on [...items].sort(), items.slice().sort(), and @click mutations in templates', () => {
      const auditor = new TestableVueSfcHygieneAuditor();
      const sfc = [
        '<template>',
        '  <div>',
        '    <li v-for="x in [...items].sort()" :key="x">{{ x }}</li>',
        '    <li v-for="y in items.slice().reverse()" :key="y">{{ y }}</li>',
        '    <button type="button" @click="count++">Increment</button>',
        '  </div>',
        '</template>',
        '<script setup lang="ts">',
        'import { ref } from "vue";',
        'const items = ref(["b", "a"]);',
        'const count = ref(0);',
        'function onKeydown(e: KeyboardEvent): void {',
        '  if (e.key === "Enter" && !e.isComposing) {',
        '    submitForm();',
        '  }',
        '}',
        'function submitForm(): void {}',
        '</script>'
      ].join('\n');

      auditor.testScanFile('src/components/SafeVueModern.vue', sfc);
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
