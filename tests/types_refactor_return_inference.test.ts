import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { TypesRefactorEngine } from '../src/core/refactor/typesRefactorEngine.ts';

describe('TypesRefactorEngine AST Return Inference', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-types-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('infers void and Promise<void> for functions without return values', () => {
    const filePath = path.join(tempDir, 'actions.ts');
    const code = `
export function doSync() {
  console.log('done');
}

export async function doAsync() {
  await Promise.resolve();
}
`;
    fs.writeFileSync(filePath, code, 'utf-8');

    const findings = TypesRefactorEngine.discoverInFile(filePath);
    const returns = findings.filter((f) => f.kind === 'missing-return-type');

    expect(returns.length).toBe(2);
    expect(returns.find((f) => f.identifier === 'doSync')?.suggestedReplacement).toBe('void');
    expect(returns.find((f) => f.identifier === 'doAsync')?.suggestedReplacement).toBe(
      'Promise<void>'
    );

    const plan = TypesRefactorEngine.buildTypeAssertionPlan('plan-void', findings);
    TypesRefactorEngine.applyPlan(tempDir, plan);

    const updated = fs.readFileSync(filePath, 'utf-8');
    expect(updated).toContain('export function doSync(): void {');
    expect(updated).toContain('export async function doAsync(): Promise<void> {');
  });

  it('infers boolean, number, and string return types correctly', () => {
    const filePath = path.join(tempDir, 'helpers.ts');
    const code = `
export function isValid(name: string) {
  return name.length > 0;
}

export function computeTotal(a: number, b: number) {
  return a + b;
}

export function formatLabel(id: string) {
  return \`#\${id}\`;
}
`;
    fs.writeFileSync(filePath, code, 'utf-8');

    const findings = TypesRefactorEngine.discoverInFile(filePath);
    const returns = findings.filter((f) => f.kind === 'missing-return-type');

    expect(returns.find((f) => f.identifier === 'isValid')?.suggestedReplacement).toBe('boolean');
    expect(returns.find((f) => f.identifier === 'computeTotal')?.suggestedReplacement).toBe(
      'number'
    );
    expect(returns.find((f) => f.identifier === 'formatLabel')?.suggestedReplacement).toBe(
      'string'
    );

    const plan = TypesRefactorEngine.buildTypeAssertionPlan('plan-primitives', findings);
    TypesRefactorEngine.applyPlan(tempDir, plan);

    const updated = fs.readFileSync(filePath, 'utf-8');
    expect(updated).toContain('export function isValid(name: string): boolean {');
    expect(updated).toContain('export function computeTotal(a: number, b: number): number {');
    expect(updated).toContain('export function formatLabel(id: string): string {');
  });

  it('infers concise arrow function return types and injects annotation before =>', () => {
    const filePath = path.join(tempDir, 'arrows.ts');
    const code = `
export const isReady = (state: string) => state === 'ready';
export const getCount = () => 42;
`;
    fs.writeFileSync(filePath, code, 'utf-8');

    const findings = TypesRefactorEngine.discoverInFile(filePath);
    const returns = findings.filter((f) => f.kind === 'missing-return-type');

    expect(returns.find((f) => f.identifier === 'isReady')?.suggestedReplacement).toBe('boolean');
    expect(returns.find((f) => f.identifier === 'getCount')?.suggestedReplacement).toBe('number');

    const plan = TypesRefactorEngine.buildTypeAssertionPlan('plan-arrows', findings);
    TypesRefactorEngine.applyPlan(tempDir, plan);

    const updated = fs.readFileSync(filePath, 'utf-8');
    expect(updated).toContain(
      "export const isReady = (state: string): boolean => state === 'ready';"
    );
    expect(updated).toContain('export const getCount = (): number => 42;');
  });

  it('infers homogeneous object return shapes', () => {
    const filePath = path.join(tempDir, 'state.ts');
    const code = `
export function getStatus(active: boolean) {
  if (active) {
    return { ok: true, reason: 'active' };
  }
  return { ok: false, reason: 'inactive' };
}
`;
    fs.writeFileSync(filePath, code, 'utf-8');

    const findings = TypesRefactorEngine.discoverInFile(filePath);
    const statusFinding = findings.find((f) => f.identifier === 'getStatus');

    expect(statusFinding).toBeDefined();
    expect(statusFinding?.suggestedReplacement).toBe('{ ok: boolean; reason: string }');

    const plan = TypesRefactorEngine.buildTypeAssertionPlan('plan-obj', findings);
    TypesRefactorEngine.applyPlan(tempDir, plan);

    const updated = fs.readFileSync(filePath, 'utf-8');
    expect(updated).toContain(
      'export function getStatus(active: boolean): { ok: boolean; reason: string } {'
    );
  });
});
