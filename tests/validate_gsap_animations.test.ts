/**
 * tests/validate_gsap_animations.test.ts
 *
 * Unit tests for ValidateGsapAnimationsAuditor:
 * - Conformance with BaseAuditor 5-point contract
 * - Clean path: GSAP tweens, timelines, useGSAP, delayedCall with named constants
 * - Violation path: CSS @keyframes, native UI timers (setTimeout/setInterval), layout tweens,
 *   unnamed timer constants, empty Vue transitions, !important on transforms/filters, gpu gaps
 * - Suppression / escape hatches (timer-ok, layout-ok, audit-disable)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ValidateGsapAnimationsAuditor,
  GSAP_ANIMATION_RULES,
  type GsapAnimationRuleId
} from '../src/suites/architecture/validate_gsap_animations.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import type { ViolationInput } from '../src/core/auditorBase.ts';

class TestableGsapAnimationsAuditor extends ValidateGsapAnimationsAuditor {
  public readonly recordedViolations: ViolationInput<GsapAnimationRuleId>[] = [];

  public override addViolation(v: ViolationInput<GsapAnimationRuleId>): void {
    this.recordedViolations.push(v);
    super.addViolation(v);
  }

  public testScanFile(relPath: string, content: string): void {
    this.scanFile(relPath, content);
  }
}

describe('ValidateGsapAnimationsAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Contract Conformance', () => {
    it('fulfills BaseAuditor metadata and construction contract', () => {
      const auditor = new ValidateGsapAnimationsAuditor();
      validateAuditorConstruction(auditor);
      expect(auditor.id).toBe('validate_gsap_animations');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toEqual(GSAP_ANIMATION_RULES);
      expect(auditor.ruleIds.length).toBe(14);
    });
  });

  describe('Clean Path', () => {
    it('passes cleanly when code uses canonical GSAP patterns and zero violations', async () => {
      const auditor = new TestableGsapAnimationsAuditor();

      auditor.testScanFile(
        'src/components/CleanModal.vue',
        `<template>
          <Transition :css="false" @enter="onEnter" @leave="onLeave">
            <div v-if="isOpen" class="modal">Hello</div>
          </Transition>
        </template>
        <script setup lang="ts">
        import gsap from 'gsap';
        import { gsapSleep } from '@/utils/animation';

        const ANIM_DURATION_SEC = 0.3;
        function onEnter(el: HTMLElement) {
          gsap.fromTo(el, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: ANIM_DURATION_SEC });
          gsap.delayedCall(ANIM_DURATION_SEC, () => {});
          gsapSleep(ANIM_DURATION_SEC);
        }
        </script>
        <style scoped>
        .modal {
          will-change: transform, opacity;
        }
        </style>`
      );

      auditor.testScanFile(
        'src/styles/clean.scss',
        `.container {
          display: flex;
          color: #333;
        }`
      );

      const result = await auditor.finishAudit();
      expect(result.status).toBe('passed');
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(auditor.recordedViolations).toHaveLength(0);
    });
  });

  describe('Violation Detection (All 8 Rules)', () => {
    it('detects banned CSS animations (@keyframes and transition)', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      auditor.testScanFile(
        'src/styles/banned.scss',
        `@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }
         .btn { transition: all 0.3s ease; }`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-banned-css-animations');
      expect(violations.length).toBeGreaterThanOrEqual(1);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects banned UI timers (setTimeout / setInterval in components)', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      auditor.testScanFile(
        'src/components/TimerCard.vue',
        `<script setup lang="ts">
        setTimeout(() => { console.log('delayed'); }, 1000);
        setInterval(() => {}, 500);
        </script>`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-banned-ui-timers');
      expect(violations.length).toBeGreaterThanOrEqual(2);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects layout properties animated inside GSAP tweens', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      auditor.testScanFile(
        'src/utils/anim.ts',
        `gsap.to('.hero', {
          backgroundPosition: '100% 0%',
          duration: 1
        });`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-no-layout-properties');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects magic numbers in GSAP delays (named timer constants)', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      auditor.testScanFile(
        'src/features/runner.ts',
        `gsap.delayedCall(0.5, () => {});
         gsapSleep(1.2);`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-named-timer-constants');
      expect(violations.length).toBe(2);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects empty Vue transition classes in styles', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      auditor.testScanFile(
        'src/styles/transitions.scss',
        `.fade-enter-active, .fade-leave-active { }`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-empty-vue-transitions');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects !important on transform properties in CSS', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      auditor.testScanFile(
        'src/styles/frozen.scss',
        `.hero { transform: translateY(0) !important; }`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-no-important-transforms');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects !important on filter properties in CSS', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      auditor.testScanFile(
        'src/styles/filter.scss',
        `.blur { filter: blur(5px) !important; }`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-no-important-filters');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects dynamic filters missing will-change (gpu gaps)', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      auditor.testScanFile(
        'src/styles/gpu.scss',
        `.container {
          filter: blur(10px);
          transition: filter 0.5s ease;
        }`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-gpu-layer-promotion');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects timeline constructor duration instead of defaults', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      auditor.testScanFile(
        'src/features/badTimeline.ts',
        `const tl = gsap.timeline({ duration: 2 });`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-timeline-constructor-duration');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects kebab-case CSS property names in tween configs', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      auditor.testScanFile(
        'src/features/kebabTween.ts',
        `gsap.to('.card', { 'background-color': '#fff' });`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-kebab-case-properties');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects raw transform string in GSAP tweens', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      auditor.testScanFile(
        'src/features/rawTransform.ts',
        `gsap.to('.box', { transform: 'translateX(20px)' });`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-raw-transform-string');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects simultaneous svgOrigin and transformOrigin conflict', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      auditor.testScanFile(
        'src/features/originConflict.ts',
        `gsap.to('#svg-circle', { svgOrigin: '100 100', transformOrigin: '50% 50%' });`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-simultaneous-origin-conflict');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects legacy GSAP v2 ease names', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      auditor.testScanFile(
        'src/features/legacyEase.ts',
        `gsap.to('.hero', { opacity: 1, ease: Power2.easeOut });`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-legacy-ease-names');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects high frequency tween creation without quickTo', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      auditor.testScanFile(
        'src/features/mouseFollower.ts',
        `window.addEventListener('mousemove', (e) => {
          gsap.to('.cursor', { x: e.clientX, y: e.clientY });
        });`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-high-frequency-tween-creation');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('warning');
    });
  });

  describe('Warning Path', () => {
    it('sets status to warned when only warning violations are found', async () => {
      const auditor = new TestableGsapAnimationsAuditor();
      auditor.testScanFile(
        'src/features/warningOnly.ts',
        `window.addEventListener('mousemove', (e) => {
          gsap.to('.cursor', { x: e.clientX, y: e.clientY });
        });`
      );

      const result = await auditor.finishAudit();
      expect(result.summary.warnings).toBe(1);
      expect(result.summary.errors).toBe(0);
      expect(result.findings[0]?.severity).toBe('warning');
    });
  });

  describe('Escape Hatches & Line Suppressions', () => {
    it('honors // timer-ok: line suppression for UI timers', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      auditor.testScanFile(
        'src/components/SuppressedTimer.vue',
        `<script setup lang="ts">
        setTimeout(() => {}, 1000); // timer-ok: debouncing external search input
        </script>`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-banned-ui-timers');
      expect(violations).toHaveLength(0);
    });

    it('honors // layout-ok: line suppression for backgroundPosition', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      auditor.testScanFile(
        'src/utils/suppressedLayout.ts',
        `// layout-ok: legacy fallback for non-webgl shimmer
        gsap.to('.shimmer', { backgroundPosition: '200% 0', duration: 1.5 });`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-no-layout-properties');
      expect(violations).toHaveLength(0);
    });

    it('honors // delay-ok: suppression for delayedCall numeric arguments', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      auditor.testScanFile(
        'src/features/suppressedDelay.ts',
        `gsap.delayedCall(0.25, () => {}); // delay-ok: one-off tick alignment`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-named-timer-constants');
      expect(violations).toHaveLength(0);
    });

    it('allows delayedCall(0, ...) as an idiomatic deferred microtask without error', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      auditor.testScanFile(
        'src/features/deferral.ts',
        `gsap.delayedCall(0, () => nextTick());`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-named-timer-constants');
      expect(violations).toHaveLength(0);
    });

    it('does not produce false positive when gsap.to in script is followed by template :style="{ top: ... }"', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      // Reproduce the exact pattern from BattleGroundHazards.vue
      const vueSfc = `<template>
  <div class="hazards-layer" :style="{ top: localGroundY + 'px', left: '0px' }">
    <span class="hazard-icon">⚡</span>
  </div>
</template>

<script setup lang="ts">
import gsap from 'gsap';
import { ref } from 'vue';

const localGroundY = ref(150);

function animateEntry(el: HTMLElement) {
  gsap.to(el, { opacity: 1, duration: 0.3 });
}
</script>`;

      auditor.testScanFile('src/components/BattleGroundHazards.vue', vueSfc);
      const layoutViolations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-no-layout-properties');
      expect(layoutViolations).toHaveLength(0);
    });

    it('does not produce false positive when comments mention setInterval or setTimeout', () => {
      const auditor = new TestableGsapAnimationsAuditor();
      const vueSfc = `<template><div>Breeding</div></template>
<script setup lang="ts">
// Ticker GSAP: actualiza el display del timer cada frame sin setInterval
const display = '10:00';
/* Another comment mentioning setTimeout */
const inlineComment = true; // No need for clearInterval here
</script>`;

      auditor.testScanFile('src/components/BreedingSummary.vue', vueSfc);
      const timerViolations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-banned-ui-timers');
      expect(timerViolations).toHaveLength(0);
    });
  });
});
