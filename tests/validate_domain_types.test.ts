/**
 * packages/auditor/tests/validate_domain_types.test.ts
 *
 * Dedicated unit test suite for DomainTypesAuditor:
 * - Loose runtime collections for finite domains (new Set, new Map)
 * - String literal arrays missing as const
 * - Broad string unions ending with | string
 * - Prohibited any / unknown typecasts
 * - Honors escape hatches (domain-ok)
 * - Verifies clean execution (0 errors, passed status)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DomainTypesAuditor,
  DOMAIN_TYPES_RULES,
  auditFile
} from '../src/suites/domain_data/validate_domain_types.ts';

describe('DomainTypesAuditor', () => {
  const scratchDir = path.resolve(process.cwd(), 'scratch/test_domain_types_' + crypto.randomUUID());

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    fs.mkdirSync(scratchDir, { recursive: true });
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    if (fs.existsSync(scratchDir)) {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  describe('Metadata & Configuration', () => {
    it('declares all expected canonical rules', () => {
      expect(DOMAIN_TYPES_RULES).toContain('domain-type-violation');
    });

    it('initializes with correct id and family', () => {
      const auditor = new DomainTypesAuditor();
      expect(auditor.id).toBe('validate_domain_types');
      expect(auditor.family).toBe('domain_data');
      expect(auditor.ruleIds).toContain('domain-type-violation');
    });
  });

  describe('Violation Detection', () => {
    it('detects new Set with string literals for finite domains (domain-type-violation)', async () => {
      const filePath = path.join(scratchDir, 'domainSet.ts');
      fs.writeFileSync(filePath, "const validCodes = new Set(['ALPHA', 'BETA']);\n", 'utf-8');
      const findings = await auditFile(filePath);
      const violation = findings.find(f => f.pattern.includes('Set used as finite-domain'));
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('ERROR');
    });

    it('detects new Map with string literals (domain-type-violation)', async () => {
      const filePath = path.join(scratchDir, 'domainMap.ts');
      fs.writeFileSync(filePath, "const mapping = new Map([['first', 1], ['second', 2]]);\n", 'utf-8');
      const findings = await auditFile(filePath);
      const violation = findings.find(f => f.pattern.includes('Map with string/domain keys'));
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('ERROR');
    });

    it('detects string union with wildcard | string (domain-type-violation)', async () => {
      const filePath = path.join(scratchDir, 'looseUnion.ts');
      fs.writeFileSync(filePath, "type TariffCode = 'T1_R' | 'T2_C' | string;\n", 'utf-8');
      const findings = await auditFile(filePath);
      const violation = findings.find(f => f.pattern.includes('union ends with `| string`'));
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('ERROR');
    });

    it('detects prohibited as any and as unknown as casts (domain-type-violation)', async () => {
      const filePath = path.join(scratchDir, 'looseCasts.ts');
      fs.writeFileSync(filePath, "const a = val as any;\nconst b = val as unknown as string;\n", 'utf-8');
      const findings = await auditFile(filePath);
      expect(findings.length).toBeGreaterThanOrEqual(2);
      expect(findings.some(f => f.pattern.includes('Double type assertion'))).toBe(true);
      expect(findings.some(f => f.pattern.includes('Type assertion `as any`'))).toBe(true);
    });

    it('allows non-domain string payloads when annotated with // domain-ok', async () => {
      const filePath = path.join(scratchDir, 'escaped.ts');
      fs.writeFileSync(filePath, "const title = getTitle(); // domain-ok: Open dynamic text or non-domain string payload\n", 'utf-8');
      const findings = await auditFile(filePath);
      expect(findings).toHaveLength(0);
    });
  });

  describe('Clean Execution', () => {
    it('passes cleanly on strict domain contracts without violations', async () => {
      const filePath = path.join(scratchDir, 'strictContract.ts');
      const code = `
        export const VOLTAGE_CATEGORIES = ['BT', 'MT', 'AT'] as const;
        export type VoltageCategory = (typeof VOLTAGE_CATEGORIES)[number];
        export const VOLTAGE_FACTORS: Readonly<Record<VoltageCategory, number>> = {
          BT: 1.0,
          MT: 1.05,
          AT: 1.10
        };
      `;
      fs.writeFileSync(filePath, code, 'utf-8');
      const findings = await auditFile(filePath);
      const violations = findings.filter(f => f.severity === 'ERROR');
      expect(violations).toHaveLength(0);
      expect(violations.length).toBe(0);
    });
  });
});
