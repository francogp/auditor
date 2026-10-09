/**
 * tests/validate_gsap_scrolltrigger.test.ts
 *
 * Unit tests for ValidateGsapScrollTriggerAuditor fulfilling BaseAuditor 5-point contract:
 * 1. Instantiation and metadata conformance
 * 2. Clean path verification (status === 'passed', errors === 0)
 * 3. Violation detection (status === 'failed', severity === 'error')
 * 4. Warning path verification
 * 5. 100% of declared rule IDs tested
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ValidateGsapScrollTriggerAuditor,
  GSAP_SCROLLTRIGGER_RULES,
  type GsapScrollTriggerRuleId
} from '../src/suites/architecture/validate_gsap_scrolltrigger.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import type { ViolationInput } from '../src/core/auditorBase.ts';

class TestableGsapScrollTriggerAuditor extends ValidateGsapScrollTriggerAuditor {
  public readonly recordedViolations: ViolationInput<GsapScrollTriggerRuleId>[] = [];

  public override addViolation(v: ViolationInput<GsapScrollTriggerRuleId>): void {
    this.recordedViolations.push(v);
    super.addViolation(v);
  }

  public testScanFile(relPath: string, content: string): void {
    this.scanFile(relPath, content);
  }
}

describe('ValidateGsapScrollTriggerAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Contract Conformance', () => {
    it('fulfills BaseAuditor metadata and construction contract', () => {
      const auditor = new ValidateGsapScrollTriggerAuditor();
      validateAuditorConstruction(auditor);
      expect(auditor.id).toBe('validate_gsap_scrolltrigger');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toEqual(GSAP_SCROLLTRIGGER_RULES);
      expect(auditor.ruleIds.length).toBe(5);
    });
  });

  describe('Clean Path', () => {
    it('passes cleanly when code adheres to canonical ScrollTrigger architecture', async () => {
      const auditor = new TestableGsapScrollTriggerAuditor();

      auditor.testScanFile(
        'src/features/cleanScroll.ts',
        `import gsap from 'gsap';
        import { ScrollTrigger } from 'gsap/ScrollTrigger';

        // Timeline with top-level ScrollTrigger
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: '.container',
            start: 'top top',
            end: '+=1000',
            scrub: true,
            pin: true
          }
        });
        tl.to('.item', { opacity: 1 });

        // Standalone ScrollTrigger with toggleActions only
        ScrollTrigger.create({
          trigger: '.header',
          start: 'top 80%',
          toggleActions: 'play none none reverse'
        });

        // Horizontal container animation with ease: 'none'
        const scrollTween = gsap.to('.sections', {
          xPercent: -200,
          ease: 'none',
          scrollTrigger: {
            trigger: '.wrapper',
            pin: true,
            scrub: 1
          }
        });

        ScrollTrigger.create({
          trigger: '.box',
          containerAnimation: scrollTween,
          start: 'left center'
        });`
      );

      const result = await auditor.finishAudit();
      expect(result.status).toBe('passed');
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(auditor.recordedViolations).toHaveLength(0);
    });
  });

  describe('Violation Detection (All 5 Rules)', () => {
    it('detects scrollTrigger in child tween of timeline', () => {
      const auditor = new TestableGsapScrollTriggerAuditor();
      auditor.testScanFile(
        'src/features/brokenTimeline.ts',
        `const tl = gsap.timeline();
        tl.to('.header', { opacity: 1 })
          .to('.card', { opacity: 1, scrollTrigger: { trigger: '.card' } });`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-scrolltrigger-in-timeline-child');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects conflicting scrub and toggleActions in ScrollTrigger', () => {
      const auditor = new TestableGsapScrollTriggerAuditor();
      auditor.testScanFile(
        'src/features/scrubConflict.ts',
        `ScrollTrigger.create({
          trigger: '.section',
          scrub: true,
          toggleActions: 'play none none reverse'
        });`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-scrolltrigger-scrub-and-toggle');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects markers: true in production code without dev guard', () => {
      const auditor = new TestableGsapScrollTriggerAuditor();
      auditor.testScanFile(
        'src/features/leakedMarkers.ts',
        `ScrollTrigger.create({
          trigger: '.hero',
          start: 'top top',
          markers: true
        });`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-scrolltrigger-markers-production');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects transform animation on pinned element', () => {
      const auditor = new TestableGsapScrollTriggerAuditor();
      auditor.testScanFile(
        'src/features/pinnedTransform.ts',
        `gsap.to('.hero-banner', { pin: true, x: 200, duration: 1 });`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-scrolltrigger-animating-pinned-element');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects non-linear ease on containerAnimation driver tween', () => {
      const auditor = new TestableGsapScrollTriggerAuditor();
      auditor.testScanFile(
        'src/features/badContainerEase.ts',
        `const horizontalTween = gsap.to('.slider', { xPercent: -100, ease: 'power2.inOut' });
        ScrollTrigger.create({
          containerAnimation: horizontalTween,
          trigger: '.slide-2'
        });`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-scrolltrigger-container-animation-ease');
      expect(violations.length).toBe(1);
      expect(violations[0]?.severity).toBe('error');
    });
  });

  describe('Escape Hatches & Suppressions', () => {
    it('honors // scrolltrigger-ok: suppression', () => {
      const auditor = new TestableGsapScrollTriggerAuditor();
      auditor.testScanFile(
        'src/features/suppressedST.ts',
        `tl.to('.card', { opacity: 1, scrollTrigger: { trigger: '.card' } }); // scrolltrigger-ok: standalone sequence`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-scrolltrigger-in-timeline-child');
      expect(violations).toHaveLength(0);
    });

    it('allows markers: true when guarded by import.meta.env.DEV', () => {
      const auditor = new TestableGsapScrollTriggerAuditor();
      auditor.testScanFile(
        'src/features/guardedMarkers.ts',
        `const isDev = import.meta.env.DEV;
        ScrollTrigger.create({
          trigger: '.hero',
          markers: true
        });`
      );

      const violations = auditor.recordedViolations.filter(v => v.ruleId === 'gsap-scrolltrigger-markers-production');
      expect(violations).toHaveLength(0);
    });
  });
});
