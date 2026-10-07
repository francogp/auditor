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
  auditFile,
  detectRepeatedStringUnions,
  detectLibraryDomainTypeDuplicates,
  extractProjectCanonicalDomains,
  detectProjectDomainDuplicatesAndSubsets,
  extractLibraryDomainTypes
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

    it('detects string literal arrays missing as const', async () => {
      const filePath = path.join(scratchDir, 'missingAsConst.ts');
      fs.writeFileSync(filePath, "export const STATUSES = ['ACTIVE', 'PENDING', 'CANCELLED'];\n", 'utf-8');
      const findings = await auditFile(filePath);
      expect(findings.some(f => f.pattern.includes('String literal array without'))).toBe(true);
    });

    it('detects unbranded domain ID alias type XId = string', async () => {
      const filePath = path.join(scratchDir, 'unbrandedId.ts');
      fs.writeFileSync(filePath, "export type AccountId = string;\n", 'utf-8');
      const findings = await auditFile(filePath);
      expect(findings.some(f => f.pattern.includes('Unbranded domain ID alias'))).toBe(true);
    });

    it('detects ambiguous empty string with null/undefined unions', async () => {
      const filePath = path.join(scratchDir, 'ambiguousEmpty.ts');
      fs.writeFileSync(filePath, "export type InputStatus = '' | null;\n", 'utf-8');
      const findings = await auditFile(filePath);
      expect(findings.some(f => f.pattern.includes('Ambiguous type alias mixes empty-string sentinel'))).toBe(true);
    });

    it('detects Record<string, ...> without domain type or open-record annotation in types contract', async () => {
      const typeDir = path.join(scratchDir, 'src/types');
      fs.mkdirSync(typeDir, { recursive: true });
      const filePath = path.join(typeDir, 'looseRecord.ts');
      fs.writeFileSync(filePath, "export type CacheMap = Record<string, number>;\n", 'utf-8');
      const findings = await auditFile(filePath);
      expect(findings.some(f => f.pattern.includes('Record<string, ...> in type/data contract'))).toBe(true);
    });

    it('detects inline string literal union in property declaration (no ad-hoc unions)', async () => {
      const filePath = path.join(scratchDir, 'inlineUnionProp.ts');
      fs.writeFileSync(filePath, "export interface Config {\n  readonly maxPriority?: 'critical' | 'high' | 'all';\n}\n", 'utf-8');
      const findings = await auditFile(filePath);
      const violation = findings.find(f => f.pattern.includes('Inline string literal union in property'));
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('ERROR');
    });

    it('honors open-record, runtime-set, and string-ok escape hatches', async () => {
      const filePath = path.join(scratchDir, 'annotatedEscapes.ts');
      const code = `
        const data: Record<string, string> = {}; // open-record: Open dynamic dictionary
        const dynamicSet = new Set(['temp']); // runtime-set: Fast O(1) membership lookup set
        const title = 'hello'; // string-ok: UI text display
      `;
      fs.writeFileSync(filePath, code, 'utf-8');
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

    it('bypasses audit execution when config.domain.enabled is false', async () => {
      const auditorDir = path.join(scratchDir, '.auditor');
      fs.mkdirSync(auditorDir, { recursive: true });
      fs.writeFileSync(path.join(auditorDir, 'audit.config.json'), JSON.stringify({ name: 'test', domain: { enabled: false } }), 'utf-8');
      const auditor = new DomainTypesAuditor(['src'], scratchDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('skipped');
    });
  });

  describe('Cross-file Domain Analysis Helpers', () => {
    it('detects repeated ad-hoc string literal unions across multiple files', () => {
      const files = [
        { file: 'src/moduleA.ts', content: "const mode: 'sync' | 'async' = 'sync';" },
        { file: 'src/moduleB.ts', content: "function run(mode: 'sync' | 'async') {}" }
      ];
      const repeated = detectRepeatedStringUnions(files);
      expect(repeated.size).toBe(1);
      const occurrences = repeated.get('async|sync');
      expect(occurrences).toBeDefined();
      expect(occurrences!.length).toBe(2);
    });

    it('detects local declarations that duplicate library domain types', () => {
      const libraryTypes = new Map([
        ['active|inactive', { typeName: 'AccountStatus', pkgName: '@vendor/core', signature: 'active|inactive' }]
      ]);
      const files = [
        { file: 'src/types.ts', content: "export type Status = 'active' | 'inactive';" }
      ];
      const duplicates = detectLibraryDomainTypeDuplicates(files, libraryTypes);
      expect(duplicates.length).toBeGreaterThan(0);
      expect(duplicates[0]!.pattern).toContain("duplicates 'AccountStatus' from '@vendor/core'");
    });

    it('extracts canonical project domains and detects collisions across files', () => {
      const files = [
        { file: 'src/canonicalA.ts', content: "export const ROLES = ['admin', 'user'] as const;\nexport type Role = (typeof ROLES)[number];" },
        { file: 'src/canonicalB.ts', content: "export const USER_ROLES = ['admin', 'user'] as const;" }
      ];
      const { bySignature, collisions } = extractProjectCanonicalDomains(files);
      expect(bySignature.has('admin|user')).toBe(true);
      expect(collisions.length).toBe(1);
      expect(collisions[0]!.pattern).toContain('Canonical domain collision');
    });

    it('detects duplicate domain collections and sub-collections of canonical domains', () => {
      const files = [
        { file: 'src/canonical.ts', content: "export const HTTP_METHODS = ['DELETE', 'GET', 'PATCH', 'POST', 'PUT'] as const;" }
      ];
      const domains = extractProjectCanonicalDomains(files);
      const consumerFiles = [
        { file: 'src/service.ts', content: "const methods = ['DELETE', 'GET', 'PATCH', 'POST', 'PUT'];\nconst safeMethods = ['DELETE', 'GET', 'PATCH'];" }
      ];
      const findings = detectProjectDomainDuplicatesAndSubsets(consumerFiles, domains);
      expect(findings.some(f => f.pattern.includes('Duplicate domain collection'))).toBe(true);
      expect(findings.some(f => f.pattern.includes('Sub-collection of canonical domain'))).toBe(true);
    });

    it('ignores devDependencies when extracting library domain types', async () => {
      const mockRoot = path.join(scratchDir, 'mock_pkg');
      const mockNodeModules = path.join(mockRoot, 'node_modules/mock-linter');
      fs.mkdirSync(mockNodeModules, { recursive: true });
      fs.writeFileSync(
        path.join(mockRoot, 'package.json'),
        JSON.stringify({
          name: 'test-app',
          devDependencies: { 'mock-linter': '^1.0.0' }
        }),
        'utf-8'
      );
      fs.writeFileSync(
        path.join(mockNodeModules, 'index.d.ts'),
        "export type Severity = 'error' | 'warning';\n",
        'utf-8'
      );

      const libTypes = await extractLibraryDomainTypes(mockRoot);
      expect(libTypes.has('error|warning')).toBe(false);
      expect(libTypes.size).toBe(0);
    });

    it('does not flag allowedExtensions new Set in auditor suites or extension Sets', async () => {
      const suiteFile = path.join(scratchDir, 'validate_test.ts');
      fs.writeFileSync(
        suiteFile,
        `export class TestAuditor extends BaseAuditor {\n  constructor() {\n    super({\n      roots: ['src'],\n      allowedExtensions: new Set(['.md', '.ts']),\n    });\n  }\n}\n`,
        'utf-8'
      );
      const findings = await auditFile(suiteFile);
      const setViolation = findings.find(f => f.pattern.includes('Set used as finite-domain'));
      expect(setViolation).toBeUndefined();

      const extFile = path.join(scratchDir, 'extensions.ts');
      fs.writeFileSync(
        extFile,
        `const CODE_EXTENSIONS = new Set(['.ts', '.vue', '.js']);\n`,
        'utf-8'
      );
      const extFindings = await auditFile(extFile);
      const extViolation = extFindings.find(f => f.pattern.includes('Set used as finite-domain'));
      expect(extViolation).toBeUndefined();
    });

    it('does not flag filePath.toLowerCase() or SQL parser loopVar.toLowerCase() as domain normalization', async () => {
      const pathUtilFile = path.join(scratchDir, 'pathUtil.ts');
      fs.writeFileSync(
        pathUtilFile,
        `export function normalize(filePath: string) {\n  return filePath.toLowerCase();\n}\nif (context.declaredVars.has(loopVar.toLowerCase())) {}\n`,
        'utf-8'
      );
      const findings = await auditFile(pathUtilFile);
      const caseViolation = findings.find(f => f.pattern.includes('Runtime string case normalization'));
      expect(caseViolation).toBeUndefined();
    });

    it('does not flag generic type parameters or infraIdWhitelist IDs in type assertions', async () => {
      const typeAssertionFile = path.join(scratchDir, 'typeAssertions.ts');
      fs.writeFileSync(
        typeAssertionFile,
        `export function testFn<TRuleId extends string>(raw: string, descriptions: Record<string, string>) {
  const ruleId = raw as TRuleId;
  const keys = Object.keys(descriptions) as TRuleId[];
  const specific = raw as RuleId;
  return { ruleId, keys, specific };
}\n`,
        'utf-8'
      );
      const findings = await auditFile(typeAssertionFile);
      const domainIdViolations = findings.filter(f => f.pattern.includes('Inline type assertion `as DomainId`') || f.pattern.includes('Type assertion on `Object.keys(...)`'));
      expect(domainIdViolations).toHaveLength(0);
    });

    it('does not flag non-domain collections (res, candidates) or sets of words/skills', async () => {
      const collectionFile = path.join(scratchDir, 'collections.ts');
      fs.writeFileSync(
        collectionFile,
        `const res: string[] = [];
const candidates: string[] = ['src', 'tests'];
const BUILTIN_SKILLS = new Set(['a11y', 'testing']);
const IGNORED_SCRIPT_WORDS = new Set(['scripts', 'commands']);
export function getCandidates() { return { res, candidates, BUILTIN_SKILLS, IGNORED_SCRIPT_WORDS }; }
`,
        'utf-8'
      );
      const findings = await auditFile(collectionFile);
      const collectionViolations = findings.filter(f => f.pattern.includes('String literal array without') || f.pattern.includes('String array type annotation') || f.pattern.includes('Set used as finite-domain'));
      expect(collectionViolations).toHaveLength(0);
    });

    it('does not flag entry / seg case normalization in search/file operations', async () => {
      const segFile = path.join(scratchDir, 'segCompare.ts');
      fs.writeFileSync(
        segFile,
        `function findCaseInsensitiveEntry(entries: readonly string[], seg: string): string | undefined {
  const directMatch = entries.find(e => e.toLowerCase() === seg.toLowerCase());
  return directMatch;
}
export { findCaseInsensitiveEntry };
`,
        'utf-8'
      );
      const findings = await auditFile(segFile);
      const caseViolations = findings.filter(f => f.pattern.includes('Runtime string case normalization'));
      expect(caseViolations).toHaveLength(0);
    });
  });
});
