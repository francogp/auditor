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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  DomainTypesAuditor,
  DOMAIN_TYPES_RULES,
  auditFile
} from '../src/suites/domain_data/validate_domain_types.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import { resetAuditConfig } from '../src/core/auditConfig.ts';

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
    const auditor = new DomainTypesAuditor(['src'], tempDir);
    expect(auditor.id).toBe('validate_domain_types');
    expect(auditor.family).toBe('domain_data');
    expect(auditor.packageName).toBe('Dominio');
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

    const auditor = new DomainTypesAuditor(['src'], tempDir);
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

    const auditor = new DomainTypesAuditor(['src'], tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const findings = result.findings.filter(f => f.ruleId === 'domain-untyped-collection');
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

    const auditor = new DomainTypesAuditor(['src'], tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const findings = result.findings.filter(f => f.ruleId === 'domain-naked-string-primitive');
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings[0]?.severity).toBe('error');
  });

  it('fulfills point 3 & 5: detects domain-ambiguous-union violations', async () => {
    const code = [
      'export type InputStatus = "" | null;'
    ].join('\n');

    await fs.writeFile(path.join(tempDir, 'src/ambiguous.ts'), code, 'utf-8');

    const auditor = new DomainTypesAuditor(['src'], tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const findings = result.findings.filter(f => f.ruleId === 'domain-ambiguous-union');
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.severity).toBe('error');
  });

  it('fulfills point 3 & 5: detects domain-unbranded-id violations', async () => {
    const code = [
      'export type AccountId = string;'
    ].join('\n');

    await fs.writeFile(path.join(tempDir, 'src/unbranded.ts'), code, 'utf-8');

    const auditor = new DomainTypesAuditor(['src'], tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const findings = result.findings.filter(f => f.ruleId === 'domain-unbranded-id');
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.severity).toBe('error');
  });

  it('honors open-record, runtime-set, and string-ok escape hatches', async () => {
    const filePath = path.join(tempDir, 'src/annotatedEscapes.ts');
    const code = [
      'const data: Record<string, string> = {}; // open-record: Open dynamic dictionary',
      'const dynamicSet = new Set(["temp"]); // runtime-set: Fast O(1) membership lookup set',
      'const title = "hello"; // string-ok: UI text display'
    ].join('\n');

    await fs.writeFile(filePath, code, 'utf-8');
    const findings = await auditFile(filePath);
    expect(findings).toHaveLength(0);
  });

  it('discriminates function parameters from interface properties and allows nullable props / infra IDs', async () => {
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
    const nullableParamFindings = findings.filter(f => f.pattern.includes('Domain ID parameter is nullable'));
    expect(nullableParamFindings).toHaveLength(1);
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

    const auditor = new DomainTypesAuditor(['src'], tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('skipped');
  });
});
