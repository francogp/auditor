/**
 * packages/auditor/tests/validate_typography_line_height.test.ts
 *
 * Unit tests for TypographyLineHeightAuditor.
 * Verifies detection of zero/low line-height collisions on multiline text.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import {
  TypographyLineHeightAuditor,
  TYPOGRAPHY_LINE_HEIGHT_RULES,
  type LineHeightRuleId
} from '../src/suites/architecture/validate_typography_line_height.ts';
import type { ViolationInput } from '../src/core/auditorBase.ts';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

class TestableTypographyLineHeightAuditor extends TypographyLineHeightAuditor {
  public readonly collectedViolations: ViolationInput<LineHeightRuleId>[] = [];

  public override addViolation(v: ViolationInput<LineHeightRuleId>): void {
    this.collectedViolations.push(v);
    super.addViolation(v);
  }

  public testScanFile(path: string, content: string): void {
    this.scanFile(path, content);
  }
}

describe('TypographyLineHeightAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  it('instantiates with correct metadata and configuration', () => {
    const auditor = new TypographyLineHeightAuditor([], PROJECT_ROOT);
    expect(auditor.id).toBe('validate_typography_line_height');
    expect(auditor.family).toBe('architecture');
    expect(auditor.name).toBe('Typography Line-Height & Interlinear Spacing Validator');
    expect(auditor.description.length).toBeLessThanOrEqual(60);
    expect(auditor.ruleIds).toEqual(TYPOGRAPHY_LINE_HEIGHT_RULES);
  });

  it('declares mandatory line-height-overlap rule with compliant description', () => {
    expect(TYPOGRAPHY_LINE_HEIGHT_RULES).toContain('line-height-overlap');
    expect(TYPOGRAPHY_LINE_HEIGHT_RULES).toHaveLength(1);

    const auditor = new TypographyLineHeightAuditor([], PROJECT_ROOT);
    expect(auditor.ruleDescriptions).toBeDefined();
    for (const ruleId of TYPOGRAPHY_LINE_HEIGHT_RULES) {
      const desc = auditor.ruleDescriptions?.[ruleId];
      expect(desc).toBeDefined();
      expect(desc!.length).toBeLessThanOrEqual(60);
    }
  });

  it('detects line-height: 0 and line-height: 1 on text selectors (line-height-overlap)', () => {
    const auditor = new TestableTypographyLineHeightAuditor([], PROJECT_ROOT);
    const badScss = `
      .item-title {
        font-size: 10px;
        line-height: 1;
      }
    `;
    auditor.testScanFile('src/test.scss', badScss);
    const violation = auditor.collectedViolations.find(v => v.ruleId === 'line-height-overlap');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('error');
  });

  it('allows safe line-height on text selectors', () => {
    const auditor = new TestableTypographyLineHeightAuditor([], PROJECT_ROOT);
    const goodScss = `
      .item-title {
        font-size: 14px;
        line-height: 1.45;
      }
    `;
    auditor.testScanFile('src/test.scss', goodScss);
    expect(auditor.collectedViolations).toHaveLength(0);
  });

  it('honors the line-height-ok escape hatch comment', () => {
    const auditor = new TestableTypographyLineHeightAuditor([], PROJECT_ROOT);
    const ignoredScss = `
      .item-title {
        // line-height-ok
        font-size: 10px;
        line-height: 1;
      }
    `;
    auditor.testScanFile('src/test.scss', ignoredScss);
    expect(auditor.collectedViolations).toHaveLength(0);
  });

  it('runs audit on clean files and reports zero errors', async () => {
    const auditor = new TestableTypographyLineHeightAuditor([], PROJECT_ROOT);
    const goodScss = `.title { font-size: 14px; line-height: 1.5; }`;
    auditor.testScanFile('src/clean.scss', goodScss);
    expect(auditor.collectedViolations).toHaveLength(0);

    const result = await auditor.execute();
    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });
});
