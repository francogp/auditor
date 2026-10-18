/**
 * tests/core/refactor/o1RefactorEngine.test.ts
 *
 * Unit tests for O1RefactorEngine (O(1) Data Structures & Linear Search).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { O1RefactorEngine } from '../../../src/core/refactor/o1RefactorEngine.ts';

describe('O1RefactorEngine', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'o1-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('discoverInFile', () => {
    it('discovers JSON.parse(JSON.stringify()) anti-pattern', () => {
      const tsFile = path.join(tmpDir, 'cloneTest.ts');
      fs.writeFileSync(
        tsFile,
        `
export function cloneState(state: any): any {
  return JSON.parse(JSON.stringify(state));
}
        `.trim()
      );

      const findings = O1RefactorEngine.discoverInFile(tsFile);
      expect(findings.length).toBe(1);
      expect(findings[0]?.kind).toBe('json-clone');
      expect(findings[0]?.suggestedReplacement).toBe('structuredClone(state)');
    });

    it('discovers redundant spread return', () => {
      const tsFile = path.join(tmpDir, 'spreadTest.ts');
      fs.writeFileSync(
        tsFile,
        `
export function getItems(arr: string[]): readonly string[] {
  return [...arr];
}
        `.trim()
      );

      const findings = O1RefactorEngine.discoverInFile(tsFile);
      expect(findings.length).toBe(1);
      expect(findings[0]?.kind).toBe('redundant-spread');
      expect(findings[0]?.suggestedReplacement).toBe('return arr;');
    });

    it('discovers linear array includes on constant arrays', () => {
      const tsFile = path.join(tmpDir, 'membershipTest.ts');
      fs.writeFileSync(
        tsFile,
        `
export const ALLOWED_ROLES_LIST = ['admin', 'moderator', 'user'] as const;

export function isAllowed(role: string): boolean {
  return ALLOWED_ROLES_LIST.includes(role);
}
        `.trim()
      );

      const findings = O1RefactorEngine.discoverInFile(tsFile);
      expect(findings.length).toBe(1);
      expect(findings[0]?.kind).toBe('linear-membership');
      expect(findings[0]?.identifier).toBe('ALLOWED_ROLES_LIST');
      expect(findings[0]?.suggestedReplacement).toBe('ALLOWED_ROLES_LIST_SET.has(role)');
    });

    it('honors // o1-ok: escape hatch', () => {
      const tsFile = path.join(tmpDir, 'escapeTest.ts');
      fs.writeFileSync(
        tsFile,
        `
export function clone(obj: any): any {
  return JSON.parse(JSON.stringify(obj)); // o1-ok: legacy fallback
}
        `.trim()
      );

      const findings = O1RefactorEngine.discoverInFile(tsFile);
      expect(findings.length).toBe(0);
    });
  });

  describe('createPlan & applyPlan', () => {
    it('creates and applies plan deterministically', () => {
      const tsFile = path.join(tmpDir, 'app.ts');
      fs.writeFileSync(
        tsFile,
        `
export const BANNED_USERS_LIST = ['alice', 'bob'] as const;

export function checkUser(user: string): boolean {
  return BANNED_USERS_LIST.includes(user);
}

export function duplicate(data: any): any {
  return JSON.parse(JSON.stringify(data));
}
        `.trim()
      );

      const findings = O1RefactorEngine.discoverInFile(tsFile);
      expect(findings.length).toBe(2);

      const plan = O1RefactorEngine.createPlan('test-o1-plan', findings);
      expect(plan.membershipHoists?.length).toBe(1);
      expect(plan.jsonCloneReplacements?.length).toBe(1);

      const result = O1RefactorEngine.applyPlan(tmpDir, plan);
      expect(result.filesChanged).toBe(1);

      const updated = fs.readFileSync(tsFile, 'utf8');
      expect(updated).toContain('BANNED_USERS_LIST_SET.has(user)');
      expect(updated).toContain('const BANNED_USERS_LIST_SET');
      expect(updated).toContain('structuredClone(data)');
      expect(updated).not.toContain('JSON.parse(JSON.stringify(data))');
    });
  });
});
