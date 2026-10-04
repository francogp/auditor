/**
 * tests/constant_analyzer_types.test.ts
 *
 * Unit tests verifying that TypeScript type assertions (as const, <const>, as type)
 * and parentheses are properly unwrapped during duplicate constant analysis.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DuplicateConstantsAuditor } from '../src/suites/architecture/validate_duplicate_constants.ts';

describe('DuplicateConstantsAuditor Type Unwrapping', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'const-types-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('treats constants with "as const" and plain literals as identical instead of divergent', async () => {
    const srcDir = path.join(tempDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    const fileA = path.join(srcDir, 'moduleA.ts');
    const fileB = path.join(srcDir, 'moduleB.ts');

    await fs.writeFile(fileA, 'export const RATIO_FACTOR = 0.75;\n', 'utf-8');
    await fs.writeFile(fileB, 'export const RATIO_FACTOR = 0.75 as const;\n', 'utf-8');

    const auditor = new DuplicateConstantsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    const identical = result.findings.filter(f => f.ruleId === 'duplicate-constant-identical');
    const divergent = result.findings.filter(f => f.ruleId === 'duplicate-constant-divergent');

    expect(divergent.length).toBe(0);
    expect(identical.length).toBe(2);
    expect(identical[0]?.message).toContain('idéntico');
  });

  it('unwraps parenthesized expressions and type assertion angles (<const>)', async () => {
    const srcDir = path.join(tempDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    const fileA = path.join(srcDir, 'moduleA.ts');
    const fileB = path.join(srcDir, 'moduleB.ts');

    await fs.writeFile(fileA, 'export const SENTINEL_LIMIT = (5000);\n', 'utf-8');
    await fs.writeFile(fileB, 'export const SENTINEL_LIMIT = <const>5000;\n', 'utf-8');

    const auditor = new DuplicateConstantsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    const identical = result.findings.filter(f => f.ruleId === 'duplicate-constant-identical');
    const divergent = result.findings.filter(f => f.ruleId === 'duplicate-constant-divergent');

    expect(divergent.length).toBe(0);
    expect(identical.length).toBe(2);
  });

  it('correctly reports divergent constants when the underlying unwrapped values actually differ', async () => {
    const srcDir = path.join(tempDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    const fileA = path.join(srcDir, 'moduleA.ts');
    const fileB = path.join(srcDir, 'moduleB.ts');

    await fs.writeFile(fileA, 'export const SPEED_MULTIPLIER = 1.25 as const;\n', 'utf-8');
    await fs.writeFile(fileB, 'export const SPEED_MULTIPLIER = 1.5;\n', 'utf-8');

    const auditor = new DuplicateConstantsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    const identical = result.findings.filter(f => f.ruleId === 'duplicate-constant-identical');
    const divergent = result.findings.filter(f => f.ruleId === 'duplicate-constant-divergent');

    expect(identical.length).toBe(0);
    expect(divergent.length).toBe(2);
    expect(divergent[0]?.message).toContain('valores diferentes');
  });
});
