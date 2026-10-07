/**
 * TEMPLATE: Sub-Auditor Unit Test (Auditor v4+ Standard)
 * Location: tests/node/auditors/validate_<name>.test.ts
 * 
 * Tests your sub-auditor in hermetic isolation:
 *   1. Clean state passes (errors = 0, status = 'passed')
 *   2. Violations trigger in RED (ruleId, severity, status = 'failed')
 *   3. Suppression comments (escape hatches) are respected
 * 
 * StandardAuditResult v4+ Contract:
 *   - result.status === 'passed' | 'failed' | 'warned'
 *   - result.summary.errors === 0
 *   - result.summary.warnings === 0
 *   - result.findings (replaces legacy result.violations)
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

    const auditor = new MyFeatureAuditor({
      projectRoot: TEST_DIR,
      roots: [TEST_DIR]
    });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBe(0);
    expect(result.findings.length).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('detects violations and records structured ruleId and context', async () => {
    const dirtyFile = path.join(TEST_DIR, 'dirty.ts');
    fs.writeFileSync(dirtyFile, 'const bad = forbiddenToken;\n', 'utf-8');

    const auditor = new MyFeatureAuditor({
      projectRoot: TEST_DIR,
      roots: [TEST_DIR]
    });
    const result = await auditor.execute();

    expect(result.summary.errors).toBeGreaterThan(0);
    expect(result.findings.some(f => f.ruleId === 'my-feature-forbidden-pattern')).toBe(true);
    expect(result.status).toBe('failed');
  });

  it('respects canonical suppression escape hatches', async () => {
    const ignoredFile = path.join(TEST_DIR, 'ignored.ts');
    fs.writeFileSync(ignoredFile, 'const bad = forbiddenToken; // my-feature-ok: Justified test exception\n', 'utf-8');

    const auditor = new MyFeatureAuditor({
      projectRoot: TEST_DIR,
      roots: [TEST_DIR]
    });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.findings.length).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('exposes mandatory metadata, configKey, and defaultConfig in manifest', () => {
    const auditor = new MyFeatureAuditor();
    const manifest = auditor.toManifest();
    expect(manifest.id).toBe('validate_my_feature');
    expect(manifest.family).toBe('architecture');
    expect(manifest.configKey).toBe('paths.srcRoots');
    expect(manifest.rules['my-feature-forbidden-pattern']).toBeDefined();
    expect(manifest.rules['my-feature-missing-attribute']).toBeDefined();
  });
});
