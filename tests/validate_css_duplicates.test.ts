/**
 * tests/node/auditors/validate_css_duplicates.test.ts
 *
 * Comprehensive unit test suite for CssDuplicatesAuditor and SCSS duplication rules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CssDuplicatesAuditor,
  CSS_DUPLICATES_RULES
} from '../src/suites/architecture/validate_css_duplicates.ts';
import { getCssCheckerCmd } from '../src/analyzers/cssAnalyzer.ts';

describe('CssDuplicatesAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  it('instantiates cleanly with BaseAuditor compliance and required metadata', () => {
    const auditor = new CssDuplicatesAuditor();
    expect(auditor.id).toBe('validate_css_duplicates');
    expect(auditor.family).toBe('architecture');
    expect(auditor.name).toBe('CSS Duplication Validator');
    expect(auditor.description).toBeDefined();
    expect(auditor.description.length).toBeLessThanOrEqual(60);
    expect(auditor.ruleDescriptions).toBeDefined();
    expect(auditor.ruleDescriptions?.['css-duplicate-rules']).toBeDefined();
    expect(auditor.ruleDescriptions?.['css-checker-missing']).toBeDefined();
  });

  it('verifies that getCssCheckerCmd attempts to resolve system binary or returns null safely', () => {
    const cmd = getCssCheckerCmd();
    expect(cmd === null || typeof cmd === 'string').toBe(true);
  });

  it('runs audit on src and reports passed status with valid StandardAuditResult', async () => {
    const auditor = new CssDuplicatesAuditor();
    const result = await auditor.execute();

    expect(result).toBeDefined();
    expect(result.id).toBe('validate_css_duplicates');
    expect(result.family).toBe('architecture');
    expect(typeof result.durationMs).toBe('number');
    expect(result.summary).toBeDefined();
    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
    expect(Array.isArray(result.findings)).toBe(true);
  });

  it('declares valid rule ids matching CSS_DUPLICATES_RULES constant', () => {
    const auditor = new CssDuplicatesAuditor();
    expect(auditor.ruleIds).toBeDefined();
    expect(auditor.ruleIds.length).toBeGreaterThan(0);
    expect(auditor.ruleIds).toEqual(CSS_DUPLICATES_RULES);
    expect(auditor.ruleIds).toContain('css-duplicate-rules');
    expect(auditor.ruleIds).toContain('css-checker-missing');
  });

  it('accepts a custom target directory in constructor without throwing', () => {
    const customAuditor = new CssDuplicatesAuditor('src/styles');
    expect(customAuditor.id).toBe('validate_css_duplicates');
    expect(customAuditor.family).toBe('architecture');
  });
});
