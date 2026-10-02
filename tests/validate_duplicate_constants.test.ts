/**
 * tests/node/auditors/validate_duplicate_constants.test.ts
 *
 * Comprehensive unit test suite for DuplicateConstantsAuditor and AST constant analysis.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import ts from 'typescript';
import { DuplicateConstantsAuditor } from '../src/suites/architecture/validate_duplicate_constants.ts';
import { extractConstantsFromSource } from '../src/analyzers/constantAnalyzer.ts';

describe('DuplicateConstantsAuditor', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'const-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('instantiates cleanly with AST requirement conforming to auditor', () => {
    const auditor = new DuplicateConstantsAuditor();
    expect(auditor.id).toBe('validate_duplicate_constants');
    expect(auditor.family).toBe('architecture');
    expect(auditor.requiresAst).toBe(true);
    expect(auditor.name).toBe('Duplicate Constants Validator');
  });

  it('extracts top-level const declarations using TypeScript AST', () => {
    const sourceCode = `
      export const BILLING_ROUND_LIMIT = 50;
      export const TARIFF_BONUS_MULTIPLIER = 2.5;
      const LOCAL_HELPER_THRESHOLD = 10;
      let mutableVar = 100;
    `;
    const sourceFile = ts.createSourceFile('test.ts', sourceCode, ts.ScriptTarget.Latest, true);
    const decls = extractConstantsFromSource(sourceFile, 'test.ts');

    expect(decls.length).toBe(3);
    expect(decls.some(d => d.name === 'BILLING_ROUND_LIMIT')).toBe(true);
    expect(decls.some(d => d.name === 'TARIFF_BONUS_MULTIPLIER')).toBe(true);
    expect(decls.some(d => d.name === 'LOCAL_HELPER_THRESHOLD')).toBe(true);
  });

  it('detects duplicate identical constants across separate files with ruleId duplicate-constant-identical', async () => {
    const srcDir = path.join(tempDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    const fileA = path.join(srcDir, 'moduleA.ts');
    const fileB = path.join(srcDir, 'moduleB.ts');

    await fs.writeFile(fileA, 'export const GLOBAL_SPECIAL_KEY = "SPECIAL_VALUE";\n', 'utf-8');
    await fs.writeFile(fileB, 'export const GLOBAL_SPECIAL_KEY = "SPECIAL_VALUE";\n', 'utf-8');

    const auditor = new DuplicateConstantsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    const identical = result.findings.find(f => f.ruleId === 'duplicate-constant-identical');
    expect(identical).toBeDefined();
    expect(identical?.severity).toBe('error');
    expect(identical?.message).toContain('idéntico');
  });

  it('detects duplicate divergent constants across separate files with ruleId duplicate-constant-divergent', async () => {
    const srcDir = path.join(tempDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    const fileA = path.join(srcDir, 'moduleA.ts');
    const fileB = path.join(srcDir, 'moduleB.ts');

    await fs.writeFile(fileA, 'export const DIVERGENT_TEST_KEY = 100;\n', 'utf-8');
    await fs.writeFile(fileB, 'export const DIVERGENT_TEST_KEY = 200;\n', 'utf-8');

    const auditor = new DuplicateConstantsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    const divergent = result.findings.find(f => f.ruleId === 'duplicate-constant-divergent');
    expect(divergent).toBeDefined();
    expect(divergent?.severity).toBe('error');
    expect(divergent?.message).toContain('diferentes');
  });

  it('runs audit on clean files and reports zero errors', async () => {
    const srcDir = path.join(tempDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'moduleA.ts'), 'export const UNIQUE_KEY_A = 1;\n', 'utf-8');
    await fs.writeFile(path.join(srcDir, 'moduleB.ts'), 'export const UNIQUE_KEY_B = 2;\n', 'utf-8');

    const auditor = new DuplicateConstantsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });
});
