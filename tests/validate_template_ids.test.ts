/**
 * packages/auditor/tests/validate_template_ids.test.ts
 *
 * Dedicated unit test suite for TemplateIdAuditor:
 * - Duplicate static ID within the same template (template-duplicate-static-id)
 * - Shared static ID across different components (template-shared-static-id)
 * - Missing input ID on form controls (template-missing-input-id)
 * - Honors escape hatches (id-ok)
 * - Verifies clean execution (0 errors, passed status)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TemplateIdAuditor,
  TEMPLATE_ID_RULES
} from '../src/suites/architecture/validate_template_ids.ts';
import type { ViolationInput } from '../src/core/auditorBase.ts';
import type { TemplateIdRuleId } from '../src/suites/architecture/validate_template_ids.ts';

class TestableTemplateIdAuditor extends TemplateIdAuditor {
  public readonly collectedViolations: ViolationInput<TemplateIdRuleId>[] = [];

  constructor(options?: { requireInputIds?: boolean }) {
    super(['src'], options ?? { requireInputIds: true });
  }

  public override addViolation(v: ViolationInput<TemplateIdRuleId>): void {
    this.collectedViolations.push(v);
    super.addViolation(v);
  }

  public testScanFile(relPath: string, content: string): void {
    this.scanFile(relPath, content);
  }
}

describe('TemplateIdAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('declares all expected canonical rules', () => {
      expect(TEMPLATE_ID_RULES).toContain('template-duplicate-static-id');
      expect(TEMPLATE_ID_RULES).toContain('template-shared-static-id');
      expect(TEMPLATE_ID_RULES).toContain('template-missing-input-id');
    });

    it('initializes with correct id and family', () => {
      const auditor = new TemplateIdAuditor();
      expect(auditor.id).toBe('validate_template_ids');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toContain('template-duplicate-static-id');
    });
  });

  describe('Violation Detection', () => {
    it('detects duplicate static id within the same component (template-duplicate-static-id)', () => {
      const auditor = new TestableTemplateIdAuditor();
      const sfc = `
        <template>
          <div>
            <div id="duplicate-target">First</div>
            <div id="duplicate-target">Second</div>
          </div>
        </template>
      `;
      auditor.testScanFile('src/components/First.vue', sfc);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'template-duplicate-static-id');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects form control without id (template-missing-input-id)', () => {
      const auditor = new TestableTemplateIdAuditor();
      const sfc = `
        <template>
          <form>
            <input type="text" name="username">
            <select name="country">
              <option value="ar">Argentina</option>
            </select>
          </form>
        </template>
      `;
      auditor.testScanFile('src/components/Form.vue', sfc);
      const violations = auditor.collectedViolations.filter(v => v.ruleId === 'template-missing-input-id');
      expect(violations.length).toBe(2);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects button and interactive event bindings without id (template-missing-input-id)', () => {
      const auditor = new TestableTemplateIdAuditor();
      const sfc = `
        <template>
          <div>
            <button type="submit">Submit</button>
            <div @click="handleClick">Clickable</div>
            <a @keydown.enter="handleEnter">Enterable</a>
          </div>
        </template>
      `;
      auditor.testScanFile('src/components/Interactive.vue', sfc);
      const violations = auditor.collectedViolations.filter(v => v.ruleId === 'template-missing-input-id');
      expect(violations.length).toBe(3);
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects shared static id across different components (template-shared-static-id)', async () => {
      const auditor = new TestableTemplateIdAuditor();
      const sfc1 = `
        <template>
          <button id="common-submit-btn">Save</button>
        </template>
      `;
      const sfc2 = `
        <template>
          <button id="common-submit-btn">Submit</button>
        </template>
      `;
      auditor.testScanFile('src/components/ModalA.vue', sfc1);
      auditor.testScanFile('src/components/ModalB.vue', sfc2);

      await auditor.runAudit();
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'template-shared-static-id');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('allows form controls without id when marked with <!-- id-ok -->', () => {
      const auditor = new TestableTemplateIdAuditor();
      const sfc = `
        <template>
          <div>
            <input type="hidden" name="csrf"> <!-- id-ok: Hidden CSRF token -->
          </div>
        </template>
      `;
      auditor.testScanFile('src/components/Csrf.vue', sfc);
      expect(auditor.collectedViolations).toHaveLength(0);
    });
  });

  describe('Clean Execution', () => {
    it('runs on compliant Vue templates and reports zero errors', async () => {
      const auditor = new TestableTemplateIdAuditor();
      const sfc = `
        <template>
          <div>
            <label for="input-search">Search</label>
            <input id="input-search" type="text" />
            <select id="select-filter">
              <option value="all">All</option>
            </select>
          </div>
        </template>
      `;
      auditor.testScanFile('src/components/CleanSearch.vue', sfc);
      expect(auditor.collectedViolations).toHaveLength(0);

      const result = await auditor.finishAudit();
      expect(result.id).toBe('validate_template_ids');
      expect(result.summary).toBeDefined();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});
