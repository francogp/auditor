/**
 * tests/core/refactor/typesRefactorEngine.test.ts
 *
 * Unit tests for TypesRefactorEngine (Type Assertions & Return Type Hygiene).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { TypesRefactorEngine } from '../../../src/core/refactor/typesRefactorEngine.ts';

describe('TypesRefactorEngine', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'types-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('discoverInFile', () => {
    it('discovers as any cast', () => {
      const tsFile = path.join(tmpDir, 'anySample.ts');
      fs.writeFileSync(
        tsFile,
        `
export function parsePayload(raw: unknown): any {
  return raw as any;
}
        `.trim()
      );

      const findings = TypesRefactorEngine.discoverInFile(tsFile);
      const anyFindings = findings.filter((f) => f.kind === 'as-any');
      expect(anyFindings.length).toBe(1);
      expect(anyFindings[0]?.suggestedReplacement).toBe('as unknown');
    });

    it('discovers double assertions (as unknown as T)', () => {
      const tsFile = path.join(tmpDir, 'doubleCastSample.ts');
      fs.writeFileSync(
        tsFile,
        `
export function castValue(val: number): string {
  return val as unknown as string;
}
        `.trim()
      );

      const findings = TypesRefactorEngine.discoverInFile(tsFile);
      const castFindings = findings.filter((f) => f.kind === 'double-assertion');
      expect(castFindings.length).toBe(1);
      expect(castFindings[0]?.suggestedReplacement).toBe('as string /* verify narrowing */');
    });

    it('discovers exported function without explicit return type', () => {
      const tsFile = path.join(tmpDir, 'missingReturnSample.ts');
      fs.writeFileSync(
        tsFile,
        `
export function computeTotal(a: number, b: number) {
  return a + b;
}
        `.trim()
      );

      const findings = TypesRefactorEngine.discoverInFile(tsFile);
      const returnFindings = findings.filter((f) => f.kind === 'missing-return-type');
      expect(returnFindings.length).toBe(1);
      expect(returnFindings[0]?.identifier).toBe('computeTotal');
      expect(returnFindings[0]?.suggestedReplacement).toContain('): void');
    });

    it('honors // type-ok: escape hatch', () => {
      const tsFile = path.join(tmpDir, 'escapeSample.ts');
      fs.writeFileSync(
        tsFile,
        `
export function parse(raw: unknown): any {
  return raw as any; // type-ok: dynamic untyped mock
}
        `.trim()
      );

      const findings = TypesRefactorEngine.discoverInFile(tsFile);
      expect(findings.length).toBe(0);
    });
  });

  describe('createPlan & applyPlan', () => {
    it('creates and applies plan deterministically', () => {
      const tsFile = path.join(tmpDir, 'service.ts');
      fs.writeFileSync(
        tsFile,
        `
export function getData(input: string): any {
  return input as any;
}
        `.trim()
      );

      const findings = TypesRefactorEngine.discoverInFile(tsFile);
      expect(findings.length).toBeGreaterThanOrEqual(1);

      const plan = TypesRefactorEngine.createPlan('test-plan-1', findings);
      expect(plan.planId).toBe('test-plan-1');
      expect(plan.assertionReplacements?.length).toBe(1);

      TypesRefactorEngine.applyPlan(tmpDir, plan);

      const updated = fs.readFileSync(tsFile, 'utf8');
      expect(updated).not.toContain('input as any');
      expect(updated).toContain('input as unknown');
    });
  });
});
