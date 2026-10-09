/**
 * TEMPLATE: Sub-Auditor Unit Test (Auditor v6+ Conformance Standard)
 * Location: tests/node/auditors/validate_<name>.test.ts (or tests/validate_<name>.test.ts)
 * 
 * Tests your sub-auditor in hermetic isolation adhering to the 5-Point Conformance Contract:
 *   1. Construction & Metadata Integrity: Instantiation with hermetic options and validateAuditorConstruction()
 *   2. Clean Path Verification: Zero violations cleanly passes (errors = 0, warnings = 0, status = 'passed')
 *   3. Violation Path Verification: Violation triggers in RED (errors > 0, status = 'failed', severity = 'error')
 *   4. Warning Path Verification: Warnings trigger in YELLOW (warnings > 0, status = 'warned', severity = 'warning')
 *   5. 100% Rule Coverage: Every declared ruleId is asserted in tests
 * 
 * StandardAuditResult v6+ Contract:
 *   - result.status === 'passed' | 'failed' | 'warned' | 'skipped'
 *   - result.summary.errors === 0
 *   - result.summary.warnings === 0
 *   - result.findings (structured array of AuditFinding objects)
 * 
 * Dynamic Whole-Workspace Verification:
 * Host projects can also verify ALL custom extensions dynamically in 2 lines with:
 *   import { runAuditorContractConformanceTests } from '@francogp/auditor';
 *   describe('All Auditors Dynamic Conformance', () => {
 *     runAuditorContractConformanceTests();
 *   });
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { validateAuditorConstruction } from '@francogp/auditor';
import { MyFeatureAuditor } from '../../../scripts/auditors/architecture/validate_my_feature.ts';

const TEST_DIR = path.resolve(process.cwd(), 'scratch/test_auditor_tmp');

describe('MyFeatureAuditor', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('conforms to construction metadata contract and exposes manifest', () => {
    const auditor = new MyFeatureAuditor({ projectRoot: TEST_DIR });
    validateAuditorConstruction(auditor);

    const manifest = auditor.toManifest();
    expect(manifest.id).toBe('validate_my_feature');
    expect(manifest.family).toBe('architecture');
    expect(manifest.packageName).toBe('MiModulo');
    expect(manifest.configKey).toBe('paths.srcRoots');
    expect(manifest.rules['my-feature-forbidden-pattern']).toBeDefined();
    expect(manifest.rules['my-feature-missing-attribute']).toBeDefined();
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

  it('detects violations and records structured ruleId and error severity', async () => {
    const dirtyFile = path.join(TEST_DIR, 'dirty.ts');
    fs.writeFileSync(dirtyFile, 'const bad = forbiddenToken;\n', 'utf-8');

    const auditor = new MyFeatureAuditor({
      projectRoot: TEST_DIR,
      roots: [TEST_DIR]
    });
    const result = await auditor.execute();

    expect(result.summary.errors).toBeGreaterThan(0);
    const violation = result.findings.find(f => f.ruleId === 'my-feature-forbidden-pattern');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('error');
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

  it('verifies 100% of declared rule IDs', async () => {
    const auditor = new MyFeatureAuditor({ projectRoot: TEST_DIR });
    const declaredRules = auditor.ruleIds;

    expect(declaredRules).toContain('my-feature-forbidden-pattern');
    expect(declaredRules).toContain('my-feature-missing-attribute');
  });
});
