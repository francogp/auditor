/**
 * packages/auditor/tests/validate_render_performance.test.ts
 *
 * Dedicated unit test suite for ValidateRenderPerformanceAuditor:
 * - Detects mix-blend-mode in weather layers (render-banned-mix-blend-mode)
 * - Detects heavy blur/drop-shadow filters in weather styles (render-banned-filter-in-weather)
 * - Detects excessive negative insets (render-excessive-atmospheric-inset)
 * - Detects CPU modifiers in GSAP atmosphere animations (render-gsap-cpu-modifier)
 * - Honors escape hatches (render-ok, blend-ok)
 * - Verifies clean execution (0 errors, passed status)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ValidateRenderPerformanceAuditor,
  RENDER_PERFORMANCE_RULES
} from '../src/suites/architecture/validate_render_performance.ts';
import type { ViolationInput } from '../src/core/auditorBase.ts';
import type { RenderPerformanceRuleId } from '../src/suites/architecture/validate_render_performance.ts';

class TestableRenderPerformanceAuditor extends ValidateRenderPerformanceAuditor {
  public readonly collectedViolations: ViolationInput<RenderPerformanceRuleId>[] = [];

  public override addViolation(v: ViolationInput<RenderPerformanceRuleId>): void {
    this.collectedViolations.push(v);
    super.addViolation(v);
  }

  public testScanFile(relPath: string, content: string): void {
    this.scanFile(relPath, content);
  }
}

describe('ValidateRenderPerformanceAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('declares all expected canonical rules', () => {
      expect(RENDER_PERFORMANCE_RULES).toContain('render-banned-mix-blend-mode');
      expect(RENDER_PERFORMANCE_RULES).toContain('render-banned-filter-in-weather');
      expect(RENDER_PERFORMANCE_RULES).toContain('render-excessive-atmospheric-inset');
      expect(RENDER_PERFORMANCE_RULES).toContain('render-gsap-cpu-modifier');
    });

    it('initializes with correct id and family', () => {
      const auditor = new ValidateRenderPerformanceAuditor();
      expect(auditor.id).toBe('validate_render_performance');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toContain('render-banned-mix-blend-mode');
    });
  });

  describe('Violation Detection', () => {
    it('detects mix-blend-mode in weather styles (render-banned-mix-blend-mode)', () => {
      const auditor = new TestableRenderPerformanceAuditor();
      const scss = `
        .rain-drop {
          mix-blend-mode: overlay;
        }
      `;
      auditor.testScanFile('src/styles/components/weather/rain.scss', scss);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'render-banned-mix-blend-mode');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects drop-shadow and blur filter in weather layers (render-banned-filter-in-weather)', () => {
      const auditor = new TestableRenderPerformanceAuditor();
      const scss = `
        .cloud-puff {
          filter: drop-shadow(0 4px 6px rgba(0,0,0,0.2));
        }
      `;
      auditor.testScanFile('src/styles/components/weather/clouds.scss', scss);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'render-banned-filter-in-weather');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects excessive negative inset (>128px) in atmosphere (render-excessive-atmospheric-inset)', () => {
      const auditor = new TestableRenderPerformanceAuditor();
      const scss = `
        .storm-layer {
          inset: -256px;
        }
      `;
      auditor.testScanFile('src/styles/components/weather/storm.scss', scss);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'render-excessive-atmospheric-inset');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects GSAP CPU modifiers in atmosphere loop (render-gsap-cpu-modifier)', () => {
      const auditor = new TestableRenderPerformanceAuditor();
      const code = `
        gsap.to(drop, {
          y: 500,
          modifiers: {
            y: (y) => parseFloat(y) % 500
          }
        });
      `;
      auditor.testScanFile('src/components/common/useAtmosphere.ts', code);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'render-gsap-cpu-modifier');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('allows mix-blend-mode when marked with // blend-ok or // render-ok', () => {
      const auditor = new TestableRenderPerformanceAuditor();
      const scss = `
        .special-effect {
          mix-blend-mode: multiply; // blend-ok: Single frame visual benchmark
        }
      `;
      auditor.testScanFile('src/styles/components/weather/test.scss', scss);
      expect(auditor.collectedViolations).toHaveLength(0);
    });
  });

  describe('Clean Execution', () => {
    it('runs on compliant GPU-accelerated styles and reports zero errors', async () => {
      const auditor = new TestableRenderPerformanceAuditor();
      const scss = `
        .weather-container {
          inset: -64px;
          opacity: 0.85;
          transform: translate3d(0, 0, 0);
          will-change: transform;
        }
      `;
      auditor.testScanFile('src/styles/components/weather/clean.scss', scss);
      expect(auditor.collectedViolations).toHaveLength(0);

      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});
