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

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { resetAuditConfig } from '../src/core/auditConfig.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import {
  ValidateCanonicalDomainsAuditor,
  CANONICAL_DOMAIN_RULES,
  detectLibraryDomainTypeDuplicates,
  extractProjectCanonicalDomains,
  extractLibraryDomainTypes,
  extractSortedLiterals,
  extractSortedLiteralsSignature,
  detectProjectDomainDuplicatesAndSubsets
} from '../src/suites/domain_data/validate_canonical_domains.ts';

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
    expect(auditor.packageName).toBe('Catalogs');
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
    const collisions = result.findings.filter((f) => f.ruleId === 'canonical-domain-collision');
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
    const repeated = result.findings.filter((f) => f.ruleId === 'canonical-domain-repeated-union');
    expect(repeated.length).toBeGreaterThanOrEqual(2);
    expect(repeated[0]?.severity).toBe('error');
    expect(repeated[0]?.message).toContain('Repeated ad-hoc string literal union');
  });

  it('fulfills point 3 & 5: detects canonical-domain-subset-mismatch', async () => {
    const canonical =
      'export const HTTP_METHODS = ["DELETE", "GET", "PATCH", "POST", "PUT"] as const;';
    const consumer = 'export const SAFE_METHODS = ["GET", "PATCH", "POST"];';

    await fs.writeFile(path.join(tempDir, 'src/http.ts'), canonical, 'utf-8');
    await fs.writeFile(path.join(tempDir, 'src/safe.ts'), consumer, 'utf-8');

    const auditor = new ValidateCanonicalDomainsAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const subsets = result.findings.filter((f) => f.ruleId === 'canonical-domain-subset-mismatch');
    expect(subsets.length).toBeGreaterThanOrEqual(1);
    expect(subsets[0]?.severity).toBe('error');
    expect(subsets[0]?.message).toContain('Sub-collection of canonical domain');
  });

  it('fulfills point 3 & 5: detects canonical-domain-library-duplicate', async () => {
    const libraryTypes = new Map([
      [
        'alpha|beta|gamma',
        { typeName: 'GreekLevel', pkgName: '@vendor/greek', signature: 'alpha|beta|gamma' }
      ]
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

  it('marks rules not applicable when no candidate code files are found', async () => {
    const emptySubDir = path.join(tempDir, 'empty');
    await fs.mkdir(emptySubDir, { recursive: true });

    const auditor = new ValidateCanonicalDomainsAuditor({
      projectRoot: tempDir,
      roots: [emptySubDir]
    });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('extracts project canonical domains and library domain types correctly', () => {
    const files = [
      {
        file: 'src/types.ts',
        content: `
          export const STATUSES = ['active', 'inactive', 'pending'] as const;
          export type Status = (typeof STATUSES)[number];
        `
      }
    ];

    const { bySignature, list, collisions } = extractProjectCanonicalDomains(files, tempDir);
    expect(collisions).toHaveLength(0);
    expect(bySignature.size).toBe(1);
    expect(list.length).toBe(1);

    const libMap = extractLibraryDomainTypes(tempDir);
    expect(libMap).toBeDefined();
  });

  it('handles extractSortedLiterals edge cases and invalid tokens', () => {
    expect(extractSortedLiterals('no literals here')).toBeNull();
    expect(extractSortedLiterals('const a = ["onlyone"];')).toBeNull();
    expect(extractSortedLiterals('["one", "two"]')).toEqual(['one', 'two']);
    expect(extractSortedLiteralsSignature('["z", "a"]')).toBe('a|z');
  });

  it('flags violations regardless of inline comments across all rules (Zero-Ignore Mandate)', async () => {
    const fileA = [
      '// This is a comment: export const ROLES = ["admin", "editor"] as const;',
      'export const APP_ROLES = ["admin", "editor"] as const; // collision-ok: intentionally duplicated',
      'export function setMode(mode: "sync" | "async") {} // domain-ok: internal only',
      'export interface Props { role: "admin" | "editor"; } // lib-duplicate-ok: local override'
    ].join('\n');

    const fileB = [
      'export function getMode(): "sync" | "async" { return "sync"; } // domain-ok: internal only',
      'const SUB_ROLES = ["admin", "editor"]; // domain-ok: allowed duplicate'
    ].join('\n');

    await fs.writeFile(path.join(tempDir, 'src/exemptA.ts'), fileA, 'utf-8');
    await fs.writeFile(path.join(tempDir, 'src/exemptB.ts'), fileB, 'utf-8');

    const auditor = new ValidateCanonicalDomainsAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBeGreaterThanOrEqual(1);
    expect(result.status).toBe('failed');
  });

  it('discovers library domain types from package.json and node_modules .d.ts files', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        dependencies: {
          'vendor-ui': '^1.0.0',
          'non-existent-pkg': '^2.0.0'
        }
      }),
      'utf-8'
    );

    const dtsDir = path.join(tempDir, 'node_modules/vendor-ui');
    await fs.mkdir(dtsDir, { recursive: true });
    const dtsContent = [
      'export type WidgetStatus = "active" | "archived" | "draft";',
      'export type SortOrder = "asc" | "desc";', // in universal blacklist
      'export type SingleValue = "only";'
    ].join('\n');
    await fs.writeFile(path.join(dtsDir, 'index.d.ts'), dtsContent, 'utf-8');

    const libMap = await extractLibraryDomainTypes(tempDir);
    expect(libMap.has('active|archived|draft')).toBe(true);
    expect(libMap.get('active|archived|draft')?.typeName).toBe('WidgetStatus');
    expect(libMap.has('asc|desc')).toBe(false);

    // Verify detection of all duplicate styles: array, prop, and type
    const scanned = [
      {
        file: 'src/widgets.ts',
        content: [
          'export const WIDGET_LIST = ["active", "archived", "draft"];',
          'export interface Widget { status: "active" | "archived" | "draft"; }',
          'export type MyStatus = "active" | "archived" | "draft";',
          'export type WidgetKeys = keyof ("active" | "archived" | "draft");'
        ].join('\n')
      }
    ];

    const findings = detectLibraryDomainTypeDuplicates(scanned, libMap);
    expect(findings.length).toBe(3); // array, prop, type (keyof is skipped)
    expect(findings.some((f) => f.message.includes("WIDGET_LIST' duplicates 'WidgetStatus"))).toBe(
      true
    );
    expect(findings.some((f) => f.message.includes("status' duplicates 'WidgetStatus"))).toBe(true);
    expect(findings.some((f) => f.message.includes("MyStatus' duplicates 'WidgetStatus"))).toBe(
      true
    );
  });

  it('does not flag immutable runtime as const arrays as duplicates of type-only library definitions', () => {
    const libMap = new Map([
      [
        'atk|def|hp|spa|spd|spe',
        { typeName: 'StatID', pkgName: '@pkmn/types', signature: 'atk|def|hp|spa|spd|spe' }
      ]
    ]);

    const scanned = [
      {
        file: 'src/battleConstants.ts',
        content: `export const POKEMON_STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;`
      }
    ];

    const findings = detectLibraryDomainTypeDuplicates(scanned, libMap);
    expect(findings).toHaveLength(0);
  });

  it('handles missing package.json gracefully in extractLibraryDomainTypes', async () => {
    const emptyDir = path.join(tempDir, 'no-pkg');
    await fs.mkdir(emptyDir, { recursive: true });
    const libMap = await extractLibraryDomainTypes(emptyDir);
    expect(libMap.size).toBe(0);
  });

  it('scores files according to architectural roots and ignores reserved collection names', async () => {
    await fs.mkdir(path.join(tempDir, 'src/types'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'src/data'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'src/logic'), { recursive: true });

    // Canonical array in types root (score 3)
    await fs.writeFile(
      path.join(tempDir, 'src/types/account.ts'),
      'export const TIERS = ["basic", "enterprise", "premium"] as const;\n' +
        'export const ROUTES = ["home", "settings"] as const;\n', // Ignored name
      'utf-8'
    );

    // Canonical type in data root (score 2)
    await fs.writeFile(
      path.join(tempDir, 'src/data/priority.ts'),
      'export type Priority = "high" | "low" | "medium";\n',
      'utf-8'
    );

    // Duplicate type in logic root (score 1)
    await fs.writeFile(
      path.join(tempDir, 'src/logic/consumer.ts'),
      'type LocalPriority = "high" | "low" | "medium";\n',
      'utf-8'
    );

    // D.ts file should be ignored
    await fs.writeFile(
      path.join(tempDir, 'src/types/ignored.d.ts'),
      'export const TIERS = ["basic", "enterprise", "premium"] as const;\n',
      'utf-8'
    );

    // Test file should be skipped during code audit
    await fs.writeFile(
      path.join(tempDir, 'src/types/account.test.ts'),
      'export const TIERS = ["basic", "enterprise", "premium"] as const;\n',
      'utf-8'
    );

    const auditor = new ValidateCanonicalDomainsAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const typeDup = result.findings.find((f) => f.message.includes('Duplicate domain type union'));
    expect(typeDup).toBeDefined();
    expect(typeDup?.message).toContain('LocalPriority');
    expect(typeDup?.message).toContain('Priority');

    // ROUTES should not have been registered or collided
    const routeCollisions = result.findings.filter((f) => f.message.includes('ROUTES'));
    expect(routeCollisions).toHaveLength(0);
  });

  it('tests detectProjectDomainDuplicatesAndSubsets edge cases', () => {
    const domains = {
      bySignature: new Map(),
      list: [
        {
          name: 'BIG_CATALOG',
          file: 'src/big.ts',
          line: 1,
          col: 1,
          signature: Array.from({ length: 42 }, (_, i) => `item${i}`).join('|'),
          elements: new Set(Array.from({ length: 42 }, (_, i) => `item${i}`)),
          literals: Array.from({ length: 42 }, (_, i) => `item${i}`),
          isContract: true
        },
        {
          name: 'SMALL_CATALOG',
          file: 'src/small.ts',
          line: 1,
          col: 1,
          signature: 'a|b|c|d',
          elements: new Set(['a', 'b', 'c', 'd']),
          literals: ['a', 'b', 'c', 'd'],
          isContract: true
        }
      ]
    };

    const files = [
      {
        file: 'src/consumerA.ts',
        content: `
          // non-matching subset (not subset of either)
          const UNRELATED = ["x", "y", "z"];
          // valid subset of BIG_CATALOG (ratio >= 0.5)
          const BIG_SUBSET = [${Array.from({ length: 25 }, (_, i) => `"item${i}"`).join(', ')}];
          // subset of SMALL_CATALOG (ratio >= 0.5, length >= 3)
          const SMALL_SUBSET = ["a", "b", "c"];
        `
      }
    ];

    const findings = detectProjectDomainDuplicatesAndSubsets(files, domains);
    expect(findings.length).toBe(2);
    expect(findings[0]?.message).toContain('BIG_SUBSET');
    expect(findings[1]?.message).toContain('SMALL_SUBSET');
  });
});
