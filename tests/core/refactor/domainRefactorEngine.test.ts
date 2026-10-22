/**
 * tests/core/refactor/domainRefactorEngine.test.ts
 *
 * Unit tests for DomainRefactorEngine (Domain Types & Branded IDs).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { DomainRefactorEngine } from '../../../src/core/refactor/domainRefactorEngine.ts';

describe('DomainRefactorEngine', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('discoverInFile', () => {
    it('discovers unbranded ID type definition', () => {
      const tsFile = path.join(tmpDir, 'idSample.ts');
      fs.writeFileSync(
        tsFile,
        `
export type PlayerId = string;
        `.trim()
      );

      const findings = DomainRefactorEngine.discoverInFile(tsFile);
      expect(findings.length).toBe(1);
      expect(findings[0]?.kind).toBe('unbranded-id');
      expect(findings[0]?.identifier).toBe('PlayerId');
      expect(findings[0]?.suggestedReplacement).toBe(
        "export type PlayerId = Brand<string, 'PlayerId'>;"
      );
    });

    it('discovers unfrozen array and object catalogs', () => {
      const tsFile = path.join(tmpDir, 'catalogSample.ts');
      fs.writeFileSync(
        tsFile,
        `
export const ROLES = ['admin', 'user'];
export const STATUSES = { active: 'ACTIVE', pending: 'PENDING' };
        `.trim()
      );

      const findings = DomainRefactorEngine.discoverInFile(tsFile);
      const unfrozen = findings.filter((f) => f.kind === 'unfrozen-catalog');
      expect(unfrozen.length).toBe(2);
      expect(unfrozen[0]?.identifier).toBe('ROLES');
      expect(unfrozen[0]?.suggestedReplacement).toBe(
        "export const ROLES = ['admin', 'user'] as const;"
      );
      expect(unfrozen[1]?.identifier).toBe('STATUSES');
      expect(unfrozen[1]?.suggestedReplacement).toBe(
        "export const STATUSES = { active: 'ACTIVE', pending: 'PENDING' } as const;"
      );
    });

    it('discovers naked string parameters for domain entities', () => {
      const tsFile = path.join(tmpDir, 'paramSample.ts');
      fs.writeFileSync(
        tsFile,
        `
export function getHero(heroId: string, category: string): void {
  // logic
}
        `.trim()
      );

      const findings = DomainRefactorEngine.discoverInFile(tsFile);
      const naked = findings.filter((f) => f.kind === 'naked-string-parameter');
      expect(naked.length).toBe(2);
      expect(naked[0]?.identifier).toBe('heroId');
      expect(naked[0]?.suggestedReplacement).toBe('heroId: HeroId');
      expect(naked[1]?.identifier).toBe('category');
      expect(naked[1]?.suggestedReplacement).toBe('category: Category');
    });

    it('detects domain finding even when // domain-ok: is present (Zero-Ignore Mandate)', () => {
      const tsFile = path.join(tmpDir, 'escapeSample.ts');
      fs.writeFileSync(
        tsFile,
        `
export const THEMES = ['dark', 'light']; // domain-ok: external third-party themes
        `.trim()
      );

      const findings = DomainRefactorEngine.discoverInFile(tsFile);
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  describe('createPlan & applyPlan', () => {
    it('creates and applies plan deterministically', () => {
      const tsFile = path.join(tmpDir, 'domainData.ts');
      fs.writeFileSync(
        tsFile,
        `
export const MODES = ['easy', 'hard'];
        `.trim()
      );

      const findings = DomainRefactorEngine.discoverInFile(tsFile);
      expect(findings.length).toBe(1);

      const plan = DomainRefactorEngine.createPlan('test-domain-plan', findings);
      expect(plan.planId).toBe('test-domain-plan');
      expect(plan.constAssertions?.length).toBe(1);

      DomainRefactorEngine.applyPlan(tmpDir, plan);

      const updated = fs.readFileSync(tsFile, 'utf8');
      expect(updated).toBe("export const MODES = ['easy', 'hard'] as const;");
    });
  });
});
