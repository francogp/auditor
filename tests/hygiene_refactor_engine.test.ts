import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { HygieneRefactorEngine } from '../src/core/refactor/hygieneRefactorEngine.ts';

describe('HygieneRefactorEngine', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-hygiene-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('member accessibility', () => {
    it('discovers missing public modifier on methods, properties, and constructors', () => {
      const filePath = path.join(tempDir, 'UserCard.ts');
      const code = `
export class UserCard {
  title: string = 'Profile';
  #privateField: number = 10;
  constructor(public id: string) {}
  render() {
    return this.title;
  }
  get summary() {
    return this.title;
  }
}
`;
      fs.writeFileSync(filePath, code, 'utf-8');

      const findings = HygieneRefactorEngine.discoverInFile(filePath);
      const accessFindings = findings.filter((f) => f.kind === 'member-accessibility');

      // title, constructor, render, summary (4 items; #privateField must be skipped)
      expect(accessFindings.length).toBe(4);
      expect(accessFindings.some((f) => f.identifier === 'title')).toBe(true);
      expect(accessFindings.some((f) => f.identifier === 'constructor')).toBe(true);
      expect(accessFindings.some((f) => f.identifier === 'render')).toBe(true);
      expect(accessFindings.some((f) => f.identifier === 'summary')).toBe(true);
      expect(accessFindings.some((f) => f.identifier === '#privateField')).toBe(false);
    });

    it('applies accessibility injections cleanly to add public keyword', () => {
      const filePath = path.join(tempDir, 'Calculator.ts');
      const code = `
export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
}
`;
      fs.writeFileSync(filePath, code, 'utf-8');

      const findings = HygieneRefactorEngine.discoverInFile(filePath);
      const plan = HygieneRefactorEngine.buildHygienePlan('test-plan', findings);
      const result = HygieneRefactorEngine.applyPlan(tempDir, plan);

      expect(result.filesChanged).toBe(1);
      const updated = fs.readFileSync(filePath, 'utf-8');
      expect(updated).toContain('public add(a: number, b: number): number');
    });
  });

  describe('prefer globalThis', () => {
    it('discovers window and self identifiers while skipping properties and declarations', () => {
      const filePath = path.join(tempDir, 'Environment.ts');
      const code = `
export function checkBrowser(): boolean {
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
  const config = { window: true };
  const getWindow = (window: string) => window;
  return self !== undefined;
}
`;
      fs.writeFileSync(filePath, code, 'utf-8');

      const findings = HygieneRefactorEngine.discoverInFile(filePath);
      const globalFindings = findings.filter((f) => f.kind === 'prefer-global-this');

      // 1. typeof window, 2. window.location, 3. self !== undefined
      // config.window (prop) and param window must be skipped!
      expect(globalFindings.length).toBe(3);
    });

    it('applies globalThis replacements without breaking typeof or property accesses', () => {
      const filePath = path.join(tempDir, 'BrowserUtils.ts');
      const code = `
export function reload(): void {
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}
`;
      fs.writeFileSync(filePath, code, 'utf-8');

      const findings = HygieneRefactorEngine.discoverInFile(filePath);
      const plan = HygieneRefactorEngine.buildHygienePlan('test-global-plan', findings);
      HygieneRefactorEngine.applyPlan(tempDir, plan);

      const updated = fs.readFileSync(filePath, 'utf-8');
      expect(updated).toContain("typeof globalThis.window !== 'undefined'");
      expect(updated).toContain('globalThis.location.reload()');
    });
  });

  describe('no-void operator', () => {
    it('discovers and refactors void expressions in arrow functions and statements', () => {
      const filePath = path.join(tempDir, 'Actions.ts');
      const code = `
export const logout = () => void auth.signOut();
export function init(): void {
  void trackAnalytics();
}
`;
      fs.writeFileSync(filePath, code, 'utf-8');

      const findings = HygieneRefactorEngine.discoverInFile(filePath);
      const voidFindings = findings.filter((f) => f.kind === 'no-void');

      expect(voidFindings.length).toBe(2);

      const plan = HygieneRefactorEngine.buildHygienePlan('test-void-plan', findings);
      HygieneRefactorEngine.applyPlan(tempDir, plan);

      const updated = fs.readFileSync(filePath, 'utf-8');
      expect(updated).toContain('auth.signOut();');
      expect(updated).not.toContain('void auth.signOut()');
      expect(updated).toContain('trackAnalytics();');
      expect(updated).not.toContain('void trackAnalytics()');
    });
  });
});
