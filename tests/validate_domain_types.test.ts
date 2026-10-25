/**
 * packages/auditor/tests/validate_domain_types.test.ts
 *
 * Dedicated unit test suite for DomainTypesAuditor conforming to 5-point contract:
 * - Loose runtime collections for finite domains (new Set, new Map)
 * - String literal arrays missing as const
 * - Broad string unions ending with | string
 * - Ambiguous empty-string with null/undefined unions
 * - Unbranded domain ID aliases
 * - Honors escape hatches (domain-ok)
 * - Verifies clean execution (0 errors, passed status)
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { resetAuditConfig } from '../src/core/auditConfig.ts';
import { type Brand, type DisplayText, type AssetUri } from '../src/core/auditContract.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import {
  DomainTypesAuditor,
  DOMAIN_TYPES_RULES,
  auditFile
} from '../src/suites/domain_data/validate_domain_types.ts';

describe('DomainTypesAuditor', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    resetAuditConfig();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'domain-types-test-'));
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, '.auditor/audit.config.json'),
      JSON.stringify({
        name: 'test-project',
        paths: { srcRoots: ['src'], typesRoots: ['src/types'] },
        domain: { enabled: true }
      }),
      'utf-8'
    );
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'src/types'), { recursive: true });
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('fulfills point 1: metadata and BaseAuditor contract verification', () => {
    const auditor = new DomainTypesAuditor({ roots: ['src'], projectRoot: tempDir });
    expect(auditor.id).toBe('validate_domain_types');
    expect(auditor.family).toBe('domain_data');
    expect(auditor.packageName).toBe('Domain');
    expect(auditor.ruleIds).toEqual(DOMAIN_TYPES_RULES);
    validateAuditorConstruction(auditor);
  });

  it('fulfills point 2: clean path execution with zero findings', async () => {
    const strictCode = [
      'export const STATUSES = ["ACTIVE", "INACTIVE"] as const;',
      'export type Status = (typeof STATUSES)[number];',
      'export interface User {',
      '  readonly status: Status;',
      '}'
    ].join('\n');

    await fs.writeFile(path.join(tempDir, 'src/types/user.ts'), strictCode, 'utf-8');

    const auditor = new DomainTypesAuditor({ roots: ['src'], projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBe(0);
    expect(result.status).toBe('passed');
    expect(result.findings).toHaveLength(0);
  });

  it('fulfills point 3 & 5: detects domain-untyped-collection violations', async () => {
    const code = [
      'export const roles = ["admin", "user"];',
      'export const activeSet = new Set(["ALPHA", "BETA"]);',
      'export const map = new Map([["key", 1]]);'
    ].join('\n');

    await fs.writeFile(path.join(tempDir, 'src/untyped.ts'), code, 'utf-8');

    const auditor = new DomainTypesAuditor({ roots: ['src'], projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const findings = result.findings.filter((f) => f.ruleId === 'domain-untyped-collection');
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings[0]?.severity).toBe('error');
  });

  it('fulfills point 3 & 5: detects domain-naked-string-primitive violations', async () => {
    const code = [
      'export type TariffCode = "T1_R" | "T2_C" | string;',
      'export type Category = string;',
      'export interface Contract { readonly rawKey: string; }'
    ].join('\n');

    await fs.writeFile(path.join(tempDir, 'src/types/contract.ts'), code, 'utf-8');

    const auditor = new DomainTypesAuditor({ roots: ['src'], projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const findings = result.findings.filter((f) => f.ruleId === 'domain-naked-string-primitive');
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings[0]?.severity).toBe('error');
  });

  it('fulfills point 3 & 5: detects domain-ambiguous-union violations', async () => {
    const code = ['export type InputStatus = "" | null;'].join('\n');

    await fs.writeFile(path.join(tempDir, 'src/ambiguous.ts'), code, 'utf-8');

    const auditor = new DomainTypesAuditor({ roots: ['src'], projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const findings = result.findings.filter((f) => f.ruleId === 'domain-ambiguous-union');
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.severity).toBe('error');
  });

  it('fulfills point 3 & 5: detects domain-unbranded-id violations', async () => {
    const code = ['export type AccountId = string;'].join('\n');

    await fs.writeFile(path.join(tempDir, 'src/unbranded.ts'), code, 'utf-8');

    const auditor = new DomainTypesAuditor({ roots: ['src'], projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const findings = result.findings.filter((f) => f.ruleId === 'domain-unbranded-id');
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.severity).toBe('error');
  });

  it('detects phase: string finite domain violation outside contract roots', async () => {
    const code = [
      'export interface Breakdown {',
      '  phase: string;',
      '  errors: number;',
      '}'
    ].join('\n');

    const targetFile = path.join(tempDir, 'src/core/theme.ts');
    await fs.mkdir(path.dirname(targetFile), { recursive: true });
    await fs.writeFile(targetFile, code, 'utf-8');

    const auditor = new DomainTypesAuditor({ roots: ['src'], projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const findings = result.findings.filter((f) => f.ruleId === 'domain-naked-string-primitive');
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.severity).toBe('error');
  });

  it('flags violations regardless of open-record, runtime-set, and string-ok comments (Zero-Ignore Mandate)', async () => {
    const filePath = path.join(tempDir, 'src/annotatedEscapes.ts');
    const code = [
      'const data: Record<string, string> = {}; // open-record: Open dynamic dictionary',
      'const dynamicSet = new Set(["temp"]); // runtime-set: Fast O(1) membership lookup set',
      'const title = "hello"; // string-ok: UI text display'
    ].join('\n');

    await fs.writeFile(filePath, code, 'utf-8');
    const findings = await auditFile(filePath);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it('flags function parameters mixing domain types with loose | string (e.g. relaxationCode: RelaxationCode | string)', async () => {
    const filePath = path.join(tempDir, 'src/dilutedParams.ts');
    const code = [
      'export function verifyAuth(relaxationCode: RelaxationCode | string): boolean { return true; }',
      'export function setStatus(status: UserStatus | string): void {}'
    ].join('\n');

    await fs.writeFile(filePath, code, 'utf-8');
    const findings = await auditFile(filePath);
    const paramFindings = findings.filter((f) =>
      f.pattern.includes('Function parameter mixes domain type with loose `| string`')
    );
    expect(paramFindings).toHaveLength(2);
  });

  it('discriminates function parameters from interface properties and flags nullable domain ID parameters', async () => {
    const filePath = path.join(tempDir, 'src/nullableIdTests.ts');
    const code = [
      'export interface ActiveBattleSerialized {',
      '  gymId: GymId | null;',
      '  locationId: MapRouteId | null;',
      '}',
      'export class PvPTimerManager {',
      '  private backgroundTickerId: WallClockTimerId | null = null;',
      '}',
      'export function clearWallClockInterval(timerId: WallClockTimerId | null): void {}',
      'export function findUser(userId: UserId | null): void {} // Should violate',
      'export function findUserEscaped(userId: UserId | null): void {} // nullable-ok: Optional user search'
    ].join('\n');

    await fs.writeFile(filePath, code, 'utf-8');
    const findings = await auditFile(filePath);
    const nullableParamFindings = findings.filter((f) =>
      f.pattern.includes('Domain ID parameter is nullable')
    );
    expect(nullableParamFindings).toHaveLength(2);
    expect(nullableParamFindings[0]?.line).toBe(9);
  });

  it('bypasses suite when config.domain.enabled is false', async () => {
    await fs.writeFile(
      path.join(tempDir, '.auditor/audit.config.json'),
      JSON.stringify({
        name: 'test-project',
        paths: { srcRoots: ['src'] },
        domain: { enabled: false }
      }),
      'utf-8'
    );

    const auditor = new DomainTypesAuditor({ roots: ['src'], projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('skipped');
  });

  describe('Multiline Zero-Ignore Canaries (PokeBorrador Reproduction & Safety)', () => {
    it('flags multiline new Set regardless of comment on closing line', async () => {
      const filePath = path.join(tempDir, 'src/multilineTrailingEscape.ts');
      const code = `
export const VALID_STATUSES = new Set([
  'active',
  'inactive',
  'pending'
]); // runtime-set: Fast O(1) dynamic membership validation
      `.trim();

      await fs.writeFile(filePath, code, 'utf-8');
      const findings = await auditFile(filePath);
      expect(findings.length).toBeGreaterThanOrEqual(1);
    });

    it('flags multiline new Set regardless of comment on preceding line', async () => {
      const filePath = path.join(tempDir, 'src/multilinePrecedingEscape.ts');
      const code = `
// runtime-set: Fast O(1) dynamic membership validation
export const VALID_STATUSES = new Set([
  'active',
  'inactive',
  'pending'
]);
      `.trim();

      await fs.writeFile(filePath, code, 'utf-8');
      const findings = await auditFile(filePath);
      expect(findings.length).toBeGreaterThanOrEqual(1);
    });

    it('Active Canary: flags multiline new Set when no escape hatch is present', async () => {
      const filePath = path.join(tempDir, 'src/multilineNoEscape.ts');
      const code = `
export const VALID_STATUSES = new Set([
  'active',
  'inactive',
  'pending'
]);
      `.trim();

      await fs.writeFile(filePath, code, 'utf-8');
      const findings = await auditFile(filePath);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]?.ruleId).toBe('domain-untyped-collection');
    });
  });

  describe('domain-chained-literal-comparison', () => {
    it('detects chained literal comparisons with >= 3 distinct literals for the same variable', async () => {
      const filePath = path.join(tempDir, 'src/chainedLiteral.ts');
      const code = `
export function checkPhase(phase: string): boolean {
  if (phase === 'setup' || phase === 'prune' || phase === 'dedup') {
    return true;
  }
  return false;
}
      `.trim();

      await fs.writeFile(filePath, code, 'utf-8');
      const findings = await auditFile(filePath);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]?.ruleId).toBe('domain-chained-literal-comparison');
      expect(findings[0]?.pattern).toContain('Chained literal comparison on "phase"');
    });

    it('ignores comparisons with only 2 literals', async () => {
      const filePath = path.join(tempDir, 'src/binaryLiteral.ts');
      const code = `
export function checkMode(mode: string): boolean {
  if (mode === 'easy' || mode === 'hard') {
    return true;
  }
  return false;
}
      `.trim();

      await fs.writeFile(filePath, code, 'utf-8');
      const findings = await auditFile(filePath);
      const chained = findings.filter((f) => f.ruleId === 'domain-chained-literal-comparison');
      expect(chained).toHaveLength(0);
    });

    it('ignores chained comparisons across different variables', async () => {
      const filePath = path.join(tempDir, 'src/differentVars.ts');
      const code = `
export function checkDiverse(a: string, b: string, c: string): boolean {
  if (a === 'start' || b === 'middle' || c === 'end') {
    return true;
  }
  return false;
}
      `.trim();

      await fs.writeFile(filePath, code, 'utf-8');
      const findings = await auditFile(filePath);
      const chained = findings.filter((f) => f.ruleId === 'domain-chained-literal-comparison');
      expect(chained).toHaveLength(0);
    });

    it('flags chained comparisons regardless of // domain-ok: comment (Zero-Ignore Mandate)', async () => {
      const filePath = path.join(tempDir, 'src/exemptChained.ts');
      const code = `
export function checkAllowed(val: string): boolean {
  if (val === 'setup' || val === 'prune' || val === 'dedup') { // domain-ok: Ad-hoc parser
    return true;
  }
  return false;
}
      `.trim();

      await fs.writeFile(filePath, code, 'utf-8');
      const findings = await auditFile(filePath);
      const chained = findings.filter((f) => f.ruleId === 'domain-chained-literal-comparison');
      expect(chained.length).toBeGreaterThanOrEqual(1);
    });

    it('exempts single-character lexical scanning chains', async () => {
      const filePath = path.join(tempDir, 'src/singleCharScanner.ts');
      const code = `
export function isQuote(ch: string): boolean {
  return ch === "'" || ch === '"' || ch === '\`';
}
      `.trim();

      await fs.writeFile(filePath, code, 'utf-8');
      const findings = await auditFile(filePath);
      const chained = findings.filter((f) => f.ruleId === 'domain-chained-literal-comparison');
      expect(chained).toHaveLength(0);
    });

    it('flags chained comparisons regardless of // string-ok: and // no-domain: comments (Zero-Ignore Mandate)', async () => {
      const filePathStringOk = path.join(tempDir, 'src/stringOkChained.ts');
      const codeStringOk = `
export function checkStringOk(val: string): boolean {
  if (val === 'alpha' || val === 'beta' || val === 'gamma') { // string-ok: Lexical token parser
    return true;
  }
  return false;
}
      `.trim();
      await fs.writeFile(filePathStringOk, codeStringOk, 'utf-8');
      const findingsStringOk = await auditFile(filePathStringOk);
      const chainedStringOk = findingsStringOk.filter(
        (f) => f.ruleId === 'domain-chained-literal-comparison'
      );
      expect(chainedStringOk.length).toBeGreaterThanOrEqual(1);

      const filePathNoDomain = path.join(tempDir, 'src/noDomainChained.ts');
      const codeNoDomain = `
export function checkNoDomain(val: string): boolean {
  if (val === 'alpha' || val === 'beta' || val === 'gamma') { // no-domain: External legacy input
    return true;
  }
  return false;
}
      `.trim();
      await fs.writeFile(filePathNoDomain, codeNoDomain, 'utf-8');
      const findingsNoDomain = await auditFile(filePathNoDomain);
      const chainedNoDomain = findingsNoDomain.filter(
        (f) => f.ruleId === 'domain-chained-literal-comparison'
      );
      expect(chainedNoDomain.length).toBeGreaterThanOrEqual(1);
    });

    it('accepts new Set<DomainType>() and new Map<DomainKey, V>() without escape hatches', async () => {
      const setTestFile = path.join(tempDir, 'src/domainSet.ts');
      const setCode = `
export type GameStatus = 'active' | 'paused' | 'stopped';
export const STATUS_SET: ReadonlySet<GameStatus> = new Set<GameStatus>(['active', 'paused']);
export const MAP_ITEMS = new Map<GameStatus, number>([['active', 1]]);
      `.trim();
      await fs.writeFile(setTestFile, setCode, 'utf-8');
      const findings = await auditFile(setTestFile);
      const untyped = findings.filter((f) => f.ruleId === 'domain-untyped-collection');
      expect(untyped).toHaveLength(0);
    });

    it('accepts DisplayText, HexColor, AssetUri, and JsonObject in contracts without // domain-ok:', async () => {
      const contractTestFile = path.join(tempDir, 'src/data/contract.ts');
      await fs.mkdir(path.dirname(contractTestFile), { recursive: true });
      const contractCode = `
import type { DisplayText, HexColor, AssetUri, JsonObject, DomElementId, UserUuid } from '@francogp/auditor';

export interface CardModel {
  title: DisplayText;
  themeColor: HexColor;
  iconUri: AssetUri;
  meta: JsonObject;
  targetDomId: DomElementId;
  authorId: UserUuid;
}
      `.trim();
      await fs.writeFile(contractTestFile, contractCode, 'utf-8');
      const findings = await auditFile(contractTestFile);
      const naked = findings.filter((f) => f.ruleId === 'domain-naked-string-primitive');
      expect(naked).toHaveLength(0);
    });

    it('accepts function-local empty array accumulators without // no-domain:', async () => {
      const accTestFile = path.join(tempDir, 'src/accumulator.ts');
      const accCode = `
import type { DisplayText } from '@francogp/auditor';

export function formatLines(): DisplayText[] {
  const lines: DisplayText[] = [];
  return lines;
}
      `.trim();
      await fs.writeFile(accTestFile, accCode, 'utf-8');
      const findings = await auditFile(accTestFile);
      const untyped = findings.filter((f) => f.ruleId === 'domain-untyped-collection');
      expect(untyped).toHaveLength(0);
    });

    it('exempts low-level single character scanning and lexing in chained comparisons', async () => {
      const lexerTestFile = path.join(tempDir, 'src/lexer.ts');
      const lexerCode = `
export function isQuoteOrDelimiter(char: string): boolean {
  return char === '"' || char === "'" || char === '\`';
}
      `.trim();
      await fs.writeFile(lexerTestFile, lexerCode, 'utf-8');
      const findings = await auditFile(lexerTestFile);
      const chained = findings.filter((f) => f.ruleId === 'domain-chained-literal-comparison');
      expect(chained).toHaveLength(0);
    });

    it('exports Brand flavored type with optional brand tag enabling ergonomic string assignability', () => {
      type CustomId = Brand<string, 'CustomId'>;
      const id: CustomId = 'valid-custom-id';
      const text: DisplayText = 'valid display text';
      const uri: AssetUri = '/assets/sprite.png';
      expect(typeof id).toBe('string');
      expect(typeof text).toBe('string');
      expect(typeof uri).toBe('string');
      expect(id).toBe('valid-custom-id');
      expect(text).toBe('valid display text');
      expect(uri).toBe('/assets/sprite.png');
    });
  });
});
