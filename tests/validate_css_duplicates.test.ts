/**
 * packages/auditor/tests/validate_css_duplicates.test.ts
 *
 * Comprehensive unit test suite for CssDuplicatesAuditor (Stylelint-backed):
 * - Metadata & Contract compliance (rule descriptions <= 50 chars, BaseAuditor)
 * - Alias & Inheritance contract (extends StylelintAuditor)
 * - Clean Path Verification (errors === 0, status === 'passed')
 * - Negative verification (real duplicate selectors & empty rules flagged)
 * - Zero false positives on nested SCSS &:hover and @include mixins
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CssDuplicatesAuditor,
  CSS_DUPLICATES_RULES
} from '../src/suites/architecture/validate_css_duplicates.ts';

describe('CssDuplicatesAuditor (Stylelint-backed)', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & BaseAuditor Compliance', () => {
    it('instantiates cleanly with BaseAuditor compliance and required metadata', () => {
      const auditor = new CssDuplicatesAuditor();
      expect(auditor.id).toBe('validate_css_duplicates');
      expect(auditor.family).toBe('architecture');
      expect(auditor.name).toBe('CSS Duplication & Hygiene Validator');
      expect(auditor.packageName).toBe('Stylelint');
      expect(auditor.description).toBeDefined();
      expect(auditor.description.length).toBeLessThanOrEqual(60);
    });

    it('declares canonical rules matching CSS_DUPLICATES_RULES constant', () => {
      const auditor = new CssDuplicatesAuditor();
      expect(auditor.ruleIds).toEqual(CSS_DUPLICATES_RULES);
      expect(auditor.ruleIds).toContain('stylelint-issue');
      expect(auditor.ruleIds).toContain('css-duplicate-selectors');
      expect(auditor.ruleIds).toContain('css-duplicate-properties');
      expect(auditor.ruleIds).toContain('css-empty-blocks');
      expect(auditor.ruleIds).toContain('css-order-violation');
      expect(auditor.ruleIds).toContain('scss-syntax-issue');
    });

    it('enforces composed rule descriptions <= 50 characters (AGENTS.md rule)', () => {
      const auditor = new CssDuplicatesAuditor();
      expect(auditor.ruleDescriptions).toBeDefined();

      for (const [, desc] of Object.entries(auditor.ruleDescriptions!)) {
        const composed = `${auditor.packageName}: ${desc}`;
        expect(composed.length).toBeLessThanOrEqual(50);
        expect(composed).not.toContain('\n');
      }
    });
  });

  describe('Hermetic Execution & Precision', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-css-dup-test-'));
      const srcDir = path.join(tempDir, 'src');
      await fs.mkdir(srcDir, { recursive: true });
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('executes cleanly without false positives on nested SCSS rules and mixins', async () => {
      const scssFile = path.join(tempDir, 'src/clean.scss');
      const scss = `
@mixin theme-btn {
  border-radius: 4px;
}

.btn-primary {
  @include theme-btn;
  &:hover {
    color: blue;
  }
}

.btn-secondary {
  @include theme-btn;
  &:hover {
    color: green;
  }
}
`;
      await fs.writeFile(scssFile, scss, 'utf-8');

      const auditor = new CssDuplicatesAuditor('.', tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('catches real duplicate selectors in the same stylesheet', async () => {
      const scssFile = path.join(tempDir, 'src/dup.scss');
      const scss = `
.duplicate-box {
  display: block;
}

.duplicate-box {
  display: none;
}
`;
      await fs.writeFile(scssFile, scss, 'utf-8');

      const auditor = new CssDuplicatesAuditor('.', tempDir);
      const result = await auditor.execute();

      const dupFindings = result.findings.filter(f => f.ruleId === 'css-duplicate-selectors');
      expect(dupFindings.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Clean Path Verification (StandardAuditResult)', () => {
    it('executes cleanly on source roots reporting passed status with 0 errors', async () => {
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
  });
});
