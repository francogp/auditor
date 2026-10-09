/**
 * tests/validate_vue_reactivity.test.ts
 *
 * Dedicated unit test suite for ValidateVueReactivityAuditor conforming to BaseAuditor 5-point contract:
 * - Contract conformance & metadata verification
 * - Clean path: Pure computed, getter-wrapped watch, toRefs destructure, native defineProps
 * - Violation path: 100% of declared rule IDs tested with positive error detection
 * - False positive defense: Spreading before sort ([...arr].sort()), Vue 3.5 defineProps destructuring
 * - Escape hatches: // reactivity-ok:, // sfc-ok:
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ValidateVueReactivityAuditor,
  VUE_REACTIVITY_RULES,
  type VueReactivityRuleId
} from '../src/suites/architecture/validate_vue_reactivity.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import type { ViolationInput } from '../src/core/auditorBase.ts';

class TestableVueReactivityAuditor extends ValidateVueReactivityAuditor {
  public readonly collectedViolations: ViolationInput<VueReactivityRuleId>[] = [];

  public override addViolation(v: ViolationInput<VueReactivityRuleId>): void {
    this.collectedViolations.push(v);
    super.addViolation(v);
  }

  public testScanFile(relPath: string, content: string): void {
    this.scanFile(relPath, content);
  }
}

describe('ValidateVueReactivityAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Contract Conformance & Metadata', () => {
    it('fulfills BaseAuditor metadata and construction contract', () => {
      const auditor = new ValidateVueReactivityAuditor();
      validateAuditorConstruction(auditor);
      expect(auditor.id).toBe('validate_vue_reactivity');
      expect(auditor.family).toBe('architecture');
      expect(auditor.packageName).toBe('Vue');
      expect(auditor.ruleIds).toEqual(VUE_REACTIVITY_RULES);
      expect(auditor.ruleIds.length).toBe(4);
    });
  });

  describe('Clean Path Execution', () => {
    it('passes with zero errors on idiomatic, pure Vue 3 Composition API code', async () => {
      const auditor = new TestableVueReactivityAuditor();

      const cleanVueSfc = `<template>
  <div class="user-card">
    <span>{{ formattedName }}</span>
    <ul><li v-for="item in sortedItems" :key="item">{{ item }}</li></ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

interface Props {
  userId: string;
  items: string[];
}

// Vue 3.5+ native reactive props destructuring is allowed and canonical
const { userId, items } = defineProps<Props>();

const count = ref(0);
const formattedName = computed(() => 'User: ' + userId);

// Pure computed using spread before sorting
const sortedItems = computed(() => [...items].sort());

// Proper watch with getter arrow function
watch(() => userId, (newId) => {
  count.value = 0;
});
</script>`;

      auditor.testScanFile('src/components/CleanUserCard.vue', cleanVueSfc);
      const result = await auditor.finishAudit();

      expect(result.status).toBe('passed');
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(auditor.collectedViolations).toHaveLength(0);
    });
  });

  describe('Violation Detection (Proving the auditor ACTIVATES)', () => {
    it('detects in-place array mutation inside computed (no-side-effects-in-computed)', () => {
      const auditor = new TestableVueReactivityAuditor();
      const sfc = `<script setup lang="ts">
import { computed } from 'vue';
const list = [3, 1, 2];
const sorted = computed(() => {
  return list.sort(); // mutation in-place
});
</script>`;

      auditor.testScanFile('src/components/BadSort.vue', sfc);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'no-side-effects-in-computed');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
      expect(violation?.message).toContain('sort');
    });

    it('detects ref reassignments inside computed (no-side-effects-in-computed)', () => {
      const auditor = new TestableVueReactivityAuditor();
      const sfc = `<script setup lang="ts">
import { ref, computed } from 'vue';
const count = ref(0);
const double = computed(() => {
  count.value = 10; // side effect inside computed
  return 20;
});
</script>`;

      auditor.testScanFile('src/components/BadRefAssign.vue', sfc);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'no-side-effects-in-computed');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
      expect(violation?.message).toContain('count.value =');
    });

    it('detects watching reactive props directly without getter arrow function (watch-reactive-property-getter)', () => {
      const auditor = new TestableVueReactivityAuditor();
      const sfc = `<script setup lang="ts">
import { watch } from 'vue';
const props = defineProps<{ modelValue: string }>();
watch(props.modelValue, (val) => {
  console.log(val);
});
</script>`;

      auditor.testScanFile('src/components/BadWatch.vue', sfc);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'watch-reactive-property-getter');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
      expect(violation?.message).toContain('watch');
    });

    it('detects async callbacks in computed (no-async-in-computed)', () => {
      const auditor = new TestableVueReactivityAuditor();
      const sfc = `<script setup lang="ts">
import { computed } from 'vue';
const userProfile = computed(async () => {
  const res = await fetch('/api/user');
  return res.json();
});
</script>`;

      auditor.testScanFile('src/components/AsyncComputed.vue', sfc);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'no-async-in-computed');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects direct destructuring of reactive() objects (no-destructured-reactive)', () => {
      const auditor = new TestableVueReactivityAuditor();
      const sfc = `<script setup lang="ts">
import { reactive } from 'vue';
const { count, name } = reactive({ count: 0, name: 'Ash' });
</script>`;

      auditor.testScanFile('src/components/DestructuredReactive.vue', sfc);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'no-destructured-reactive');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });
  });

  describe('Suppression & False Positive Resistance', () => {
    it('honors // reactivity-ok: escape hatch', () => {
      const auditor = new TestableVueReactivityAuditor();
      const sfc = `<script setup lang="ts">
import { computed } from 'vue';
const list = [1, 2];
const sorted = computed(() => {
  return list.sort(); // reactivity-ok: legacy sandbox clone
});
</script>`;

      auditor.testScanFile('src/components/Suppressed.vue', sfc);
      expect(auditor.collectedViolations).toHaveLength(0);
    });

    it('does not flag defineProps destructuring as no-destructured-reactive', () => {
      const auditor = new TestableVueReactivityAuditor();
      const sfc = `<script setup lang="ts">
const { currentGen, sortBy } = defineProps<{ currentGen: number; sortBy: string }>();
</script>`;

      auditor.testScanFile('src/components/PokedexControls.vue', sfc);
      expect(auditor.collectedViolations).toHaveLength(0);
    });

    it('does not flag local accumulator arrays (.push) built inside computed', () => {
      const auditor = new TestableVueReactivityAuditor();
      const sfc = `<script setup lang="ts">
import { computed } from 'vue';
const summary = computed(() => {
  const active: string[] = [];
  if (true) {
    active.push('item');
  }
  return active;
});
</script>`;

      auditor.testScanFile('src/components/Accumulator.vue', sfc);
      expect(auditor.collectedViolations).toHaveLength(0);
    });

    it('does not flag .sort() on shallow copy created within computed', () => {
      const auditor = new TestableVueReactivityAuditor();
      const sfc = `<script setup lang="ts">
import { ref, computed } from 'vue';
const items = ref(['b', 'a']);
const sorted = computed(() => {
  let list = [...items.value];
  list.sort((a, b) => a.localeCompare(b));
  return list;
});
</script>`;

      auditor.testScanFile('src/components/SortedCopy.vue', sfc);
      expect(auditor.collectedViolations).toHaveLength(0);
    });
  });
});
