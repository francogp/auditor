/**
 * tests/validate_canonical_domains.test.ts
 *
 * Conformance unit tests for ValidateCanonicalDomainsAuditor:
 * - 5-Point BaseAuditor Contract
 * - Canonical domain collision detection
 * - Repeated string union detection across files
 * - Local duplicate of library domain type detection
 * - Canonical domain duplicate and sub-collection detection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  ValidateCanonicalDomainsAuditor,
  CANONICAL_DOMAIN_RULES,
  detectRepeatedStringUnions,
  detectLibraryDomainTypeDuplicates,
  extractProjectCanonicalDomains,
  detectProjectDomainDuplicatesAndSubsets,
  extractLibraryDomainTypes
} from '../src/suites/domain_data/validate_canonical_domains.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import { resetAuditConfig } from '../src/core/auditConfig.ts';

describe('ValidateCanonicalDomainsAuditor', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    resetAuditConfig();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'canonical-domains-test-'));
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, '.auditor/audit.config.json'),
      JSON.stringify({
        name: 'test-project',
        paths: { srcRoots: ['src'] },
        domain: { enabled: true }
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
    const auditor = new ValidateCanonicalDomainsAuditor(tempDir);
    expect(auditor.id).toBe('validate_canonical_domains');
    expect(auditor.family).toBe('domain_data');
    expect(auditor.packageName).toBe('Catálogos');
    expect(auditor.ruleIds).toEqual(CANONICAL_DOMAIN_RULES);
    validateAuditorConstruction(auditor);
  });

  it('fulfills point 2: clean path execution with zero findings', async () => {
    const canonicalA = [
      'export const ACCOUNT_TIERS = ["free", "pro", "enterprise"] as const;',
      'export type AccountTier = (typeof ACCOUNT_TIERS)[number];'
    ].join('\n');

    const canonicalB = [
      'import type { AccountTier } from "./accountTiers.ts";',
      'export interface Account { readonly tier: AccountTier; }'
    ].join('\n');

    await fs.writeFile(path.join(tempDir, 'src/accountTiers.ts'), canonicalA, 'utf-8');
    await fs.writeFile(path.join(tempDir, 'src/account.ts'), canonicalB, 'utf-8');

    const auditor = new ValidateCanonicalDomainsAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBe(0);
    expect(result.status).toBe('passed');
    expect(result.findings).toHaveLength(0);
  });

  it('fulfills point 3 & 5: detects canonical-domain-collision across files', async () => {
    const fileA = 'export const ROLES = ["admin", "editor", "viewer"] as const;';
    const fileB = 'export const USER_ROLES = ["admin", "editor", "viewer"] as const;';

    await fs.writeFile(path.join(tempDir, 'src/rolesA.ts'), fileA, 'utf-8');
    await fs.writeFile(path.join(tempDir, 'src/rolesB.ts'), fileB, 'utf-8');

    const auditor = new ValidateCanonicalDomainsAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const collisions = result.findings.filter(f => f.ruleId === 'canonical-domain-collision');
    expect(collisions.length).toBeGreaterThanOrEqual(1);
    expect(collisions[0]?.severity).toBe('error');
    expect(collisions[0]?.message).toContain('Canonical domain collision');
  });

  it('fulfills point 3 & 5: detects canonical-domain-repeated-union across files', async () => {
    const fileA = 'export function setMode(mode: "sync" | "async" | "lazy") {}';
    const fileB = 'export function getMode(): "sync" | "async" | "lazy" { return "sync"; }';

    await fs.writeFile(path.join(tempDir, 'src/modeA.ts'), fileA, 'utf-8');
    await fs.writeFile(path.join(tempDir, 'src/modeB.ts'), fileB, 'utf-8');

    const auditor = new ValidateCanonicalDomainsAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const repeated = result.findings.filter(f => f.ruleId === 'canonical-domain-repeated-union');
    expect(repeated.length).toBeGreaterThanOrEqual(2);
    expect(repeated[0]?.severity).toBe('error');
    expect(repeated[0]?.message).toContain('Repeated ad-hoc string literal union');
  });

  it('fulfills point 3 & 5: detects canonical-domain-subset-mismatch', async () => {
    const canonical = 'export const HTTP_METHODS = ["DELETE", "GET", "PATCH", "POST", "PUT"] as const;';
    const consumer = 'export const SAFE_METHODS = ["GET", "PATCH", "POST"];';

    await fs.writeFile(path.join(tempDir, 'src/http.ts'), canonical, 'utf-8');
    await fs.writeFile(path.join(tempDir, 'src/safe.ts'), consumer, 'utf-8');

    const auditor = new ValidateCanonicalDomainsAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const subsets = result.findings.filter(f => f.ruleId === 'canonical-domain-subset-mismatch');
    expect(subsets.length).toBeGreaterThanOrEqual(1);
    expect(subsets[0]?.severity).toBe('error');
    expect(subsets[0]?.message).toContain('Sub-collection of canonical domain');
  });

  it('fulfills point 3 & 5: detects canonical-domain-library-duplicate', async () => {
    const libraryTypes = new Map([
      ['alpha|beta|gamma', { typeName: 'GreekLevel', pkgName: '@vendor/greek', signature: 'alpha|beta|gamma' }]
    ]);

    const files = [
      { file: 'src/types.ts', content: 'export type Level = "alpha" | "beta" | "gamma";' }
    ];

    const duplicates = detectLibraryDomainTypeDuplicates(files, libraryTypes);
    expect(duplicates.length).toBe(1);
    expect(duplicates[0]?.ruleId).toBe('canonical-domain-library-duplicate');
    expect(duplicates[0]?.message).toContain('Duplicate of library domain type');
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

    const auditor = new ValidateCanonicalDomainsAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('skipped');
  });
});
