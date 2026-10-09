/**
 * tests/validate_type_assertion_hygiene.test.ts
 *
 * Conformance unit tests for ValidateTypeAssertionHygieneAuditor:
 * - 5-Point BaseAuditor Contract
 * - Zero any / any[] assertion detection
 * - Double typecast (as unknown as) detection
 * - Boolean literal type annotation detection
 * - Floating async promise detection
 * - Broad array cast detection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  ValidateTypeAssertionHygieneAuditor,
  TYPE_ASSERTION_RULES
} from '../src/suites/architecture/validate_type_assertion_hygiene.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import { resetAuditConfig } from '../src/core/auditConfig.ts';

describe('ValidateTypeAssertionHygieneAuditor', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    resetAuditConfig();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'type-hygiene-test-'));
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, '.auditor/audit.config.json'),
      JSON.stringify({
        name: 'test-project',
        paths: { srcRoots: ['src'] }
      }),
      'utf-8'
    );
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('fulfills point 1: metadata and BaseAuditor contract verification', () => {
    const auditor = new ValidateTypeAssertionHygieneAuditor(tempDir);
    expect(auditor.id).toBe('validate_type_assertion_hygiene');
    expect(auditor.family).toBe('architecture');
    expect(auditor.packageName).toBe('Tipos');
    expect(auditor.ruleIds).toEqual(TYPE_ASSERTION_RULES);
    validateAuditorConstruction(auditor);
  });

  it('fulfills point 2: clean path execution with zero findings', async () => {
    const cleanCode = [
      'export interface User {',
      '  readonly id: string;',
      '  readonly active: boolean;',
      '}',
      'export async function fetchUser(): Promise<User> {',
      '  const res = await Promise.resolve({ id: "1", active: true });',
      '  return res;',
      '}'
    ].join('\n');

    await fs.writeFile(path.join(tempDir, 'src/clean.ts'), cleanCode, 'utf-8');

    const auditor = new ValidateTypeAssertionHygieneAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBe(0);
    expect(result.status).toBe('passed');
    expect(result.findings).toHaveLength(0);
  });

  it('fulfills point 3 & 5: detects type-assertion-zero-any violations', async () => {
    const code = [
      'const a = val ' + 'as any' + ';',
      'const b = list ' + 'as any[]' + ';'
    ].join('\n');

    await fs.writeFile(path.join(tempDir, 'src/anyViolation.ts'), code, 'utf-8');

    const auditor = new ValidateTypeAssertionHygieneAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    expect(result.summary.errors).toBeGreaterThanOrEqual(2);
    const findings = result.findings.filter(f => f.ruleId === 'type-assertion-zero-any');
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings[0]?.severity).toBe('error');
  });

  it('fulfills point 3 & 5: detects type-assertion-double-cast violations', async () => {
    const code = [
      'const a = val ' + 'as unknown ' + 'as string;',
      'const b = id ' + 'as any ' + 'as AccountId;'
    ].join('\n');

    await fs.writeFile(path.join(tempDir, 'src/doubleCast.ts'), code, 'utf-8');

    const auditor = new ValidateTypeAssertionHygieneAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const findings = result.findings.filter(f => f.ruleId === 'type-assertion-double-cast');
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings[0]?.severity).toBe('error');
  });

  it('fulfills point 3 & 5: detects type-assertion-boolean-literal violations', async () => {
    const code = [
      'export const isEnabled: true = true;',
      'export type ModeFlag = false;'
    ].join('\n');

    await fs.writeFile(path.join(tempDir, 'src/boolLiteral.ts'), code, 'utf-8');

    const auditor = new ValidateTypeAssertionHygieneAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const findings = result.findings.filter(f => f.ruleId === 'type-assertion-boolean-literal');
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.severity).toBe('error');
  });

  it('fulfills point 3 & 5: detects type-assertion-floating-promise violations', async () => {
    const code = [
      'export function sync(): void {',
      '  saveDataAsync();',
      '}'
    ].join('\n');

    await fs.writeFile(path.join(tempDir, 'src/floatingPromise.ts'), code, 'utf-8');

    const auditor = new ValidateTypeAssertionHygieneAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const findings = result.findings.filter(f => f.ruleId === 'type-assertion-floating-promise');
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.severity).toBe('error');
  });

  it('fulfills point 3 & 5: detects type-assertion-loose-array violations', async () => {
    const code = [
      'export const items = raw ' + 'as string[];'
    ].join('\n');

    await fs.writeFile(path.join(tempDir, 'src/looseArray.ts'), code, 'utf-8');

    const auditor = new ValidateTypeAssertionHygieneAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const findings = result.findings.filter(f => f.ruleId === 'type-assertion-loose-array');
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.severity).toBe('error');
  });

  it('honors inline escape hatches (any-ok, double-cast-ok, void-ok, array-ok, no-domain, open-record, type-ok)', async () => {
    const code = [
      'const a = val ' + 'as any; // any-ok: third party integration',
      'const b = val ' + 'as unknown ' + 'as string; // double-cast-ok: dynamic untyped buffer',
      'syncDataAsync(); // void-ok: fire and forget background task',
      'const c = raw ' + 'as string[]; // array-ok: external array parser',
      'const d = raw ' + 'as string[]; // no-domain: Non-domain utility collection',
      'const e = raw ' + 'as unknown[]; // open-record: Generic key-value dictionary'
    ].join('\n');

    await fs.writeFile(path.join(tempDir, 'src/escaped.ts'), code, 'utf-8');

    const auditor = new ValidateTypeAssertionHygieneAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });
});
