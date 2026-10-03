/**
 * tests/reproduce_template_missing_input_id.test.ts
 *
 * Reproduction test for template form control ID detection.
 * Strictly adheres to Gate 1 of /systematic-debugging:
 * Assert that dynamic IDs with spaces, v-bind:id, and hidden inputs are handled properly
 * without false positives.
 */

import { describe, it, expect } from 'vitest';
import {
  TemplateIdAuditor,
  type TemplateIdRuleId
} from '../src/suites/architecture/validate_template_ids.ts';
import type { ViolationInput } from '../src/core/auditorBase.ts';

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

describe('Template Input ID Detection (template-missing-input-id)', () => {
  it('does NOT flag input with dynamic :id containing spaces and expressions', () => {
    const auditor = new TestableTemplateIdAuditor({ requireInputIds: true });
    const content = `
      <template>
        <div>
          <input :id="'user-input-' + index" type="text" />
          <input :id="item.id || 'fallback'" type="text" />
        </div>
      </template>
    `;
    auditor.testScanFile('src/components/MyForm.vue', content);

    const violations = auditor.collectedViolations.filter(v => v.ruleId === 'template-missing-input-id');
    expect(violations).toEqual([]);
  });

  it('does NOT flag input with v-bind:id', () => {
    const auditor = new TestableTemplateIdAuditor({ requireInputIds: true });
    const content = `
      <template>
        <div>
          <input v-bind:id="customId" type="text" />
        </div>
      </template>
    `;
    auditor.testScanFile('src/components/BoundForm.vue', content);

    const violations = auditor.collectedViolations.filter(v => v.ruleId === 'template-missing-input-id');
    expect(violations.length).toBe(0);
  });

  it('does NOT flag <input type="hidden">', () => {
    const auditor = new TestableTemplateIdAuditor({ requireInputIds: true });
    const content = `
      <template>
        <div>
          <input type="hidden" name="csrf" value="token" />
        </div>
      </template>
    `;
    auditor.testScanFile('src/components/HiddenForm.vue', content);

    const violations = auditor.collectedViolations.filter(v => v.ruleId === 'template-missing-input-id');
    expect(violations.length).toBe(0);
  });

  it('does NOT fail prematurely on multiline inputs or attributes containing ">"', () => {
    const auditor = new TestableTemplateIdAuditor({ requireInputIds: true });
    const content = `
      <template>
        <div>
          <input
            :disabled="count > 5"
            :id="inputId"
            type="text"
          />
        </div>
      </template>
    `;
    auditor.testScanFile('src/components/MultilineForm.vue', content);

    const violations = auditor.collectedViolations.filter(v => v.ruleId === 'template-missing-input-id');
    expect(violations.length).toBe(0);
  });

  it('DOES flag truly missing ID on an interactive input', () => {
    const auditor = new TestableTemplateIdAuditor({ requireInputIds: true });
    const content = `
      <template>
        <div>
          <input type="text" placeholder="Enter name" />
        </div>
      </template>
    `;
    auditor.testScanFile('src/components/MissingId.vue', content);

    const violations = auditor.collectedViolations.filter(v => v.ruleId === 'template-missing-input-id');
    expect(violations.length).toBe(1);
    expect(violations[0]?.ruleId).toBe('template-missing-input-id');
  });
});
