/**
 * TEMPLATE: Sub-Auditor Unit Test
 * Location: tests/node/auditors/validate_<name>.test.ts
 * 
 * Tests your sub-auditor in isolation: clean state passes, violations trigger in RED,
 * and suppression comments (escape hatches) are respected.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { MyFeatureAuditor } from '../../../scripts/auditors/architecture/validate_my_feature.ts';

const TEST_DIR = path.resolve(process.cwd(), 'scratch/test_auditor_tmp');

describe('MyFeatureAuditor', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('passes cleanly when no violations are present', async () => {
    const cleanFile = path.join(TEST_DIR, 'clean.ts');
    fs.writeFileSync(cleanFile, 'export const valid = true;\n', 'utf-8');

    const auditor = new MyFeatureAuditor(['scratch/test_auditor_tmp']);
    const result = await auditor.execute();

    expect(result.errors.length).toBe(0);
    expect(result.warnings.length).toBe(0);
    expect(result.violations.length).toBe(0);
    expect(result.success).toBe(true);
  });

  it('detects violations and records structured ruleId and context', async () => {
    const dirtyFile = path.join(TEST_DIR, 'dirty.ts');
    fs.writeFileSync(dirtyFile, 'const bad = forbiddenToken;\n', 'utf-8');

    const auditor = new MyFeatureAuditor(['scratch/test_auditor_tmp']);
    const result = await auditor.execute();

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.violations.some(v => v.ruleId === 'my-feature-forbidden-pattern')).toBe(true);
    expect(result.success).toBe(false);
  });

  it('respects canonical suppression escape hatches', async () => {
    const ignoredFile = path.join(TEST_DIR, 'ignored.ts');
    fs.writeFileSync(ignoredFile, 'const bad = forbiddenToken; // my-feature-ok: Justified test exception\n', 'utf-8');

    const auditor = new MyFeatureAuditor(['scratch/test_auditor_tmp']);
    const result = await auditor.execute();

    expect(result.violations.length).toBe(0);
    expect(result.success).toBe(true);
  });
});
