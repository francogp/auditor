/**
 * packages/auditor/tests/validate_o1_data_structures.test.ts
 *
 * Dedicated unit test suite for O1DataStructuresAuditor:
 * - Linear scan on static catalogs (o1-catalog-lookup)
 * - Array includes on static lists (o1-linear-membership)
 * - Object.keys / values linear scan (o1-object-scan)
 * - JSON.parse(JSON.stringify) anti-pattern (o1-json-clone)
 * - Redundant array spread return (o1-redundant-spread-return)
 * - Honors escape hatches (o1-ok, linear-search-ok)
 * - Verifies clean execution (0 errors, passed status)
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { resetAuditConfig } from '../src/core/auditConfig.ts';
import type { ViolationInput } from '../src/core/auditorBase.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import {
  O1DataStructuresAuditor,
  O1_RULES,
  scanFileForO1Issues,
  getResolvedO1CatalogPatterns
} from '../src/suites/domain_data/validate_o1_data_structures.ts';
import type { O1RuleId } from '../src/suites/domain_data/validate_o1_data_structures.ts';

class TestableO1DataStructuresAuditor extends O1DataStructuresAuditor {
  public readonly collectedViolations: ViolationInput<O1RuleId>[] = [];

  public override addViolation(v: ViolationInput<O1RuleId>): void {
    this.collectedViolations.push(v);
    super.addViolation(v);
  }

  public override testScanFile(relPath: string, content: string): void {
    this.scanFile(relPath, content);
  }
}

describe('O1DataStructuresAuditor', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    resetAuditConfig();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'o1-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Metadata & Configuration', () => {
    it('declares all expected canonical rules', () => {
      expect(O1_RULES).toContain('o1-catalog-lookup');
      expect(O1_RULES).toContain('o1-linear-membership');
      expect(O1_RULES).toContain('o1-object-scan');
      expect(O1_RULES).toContain('o1-json-clone');
      expect(O1_RULES).toContain('o1-redundant-spread-return');
    });

    it('initializes with correct id and family and fulfills BaseAuditor contract', () => {
      const auditor = new O1DataStructuresAuditor();
      expect(auditor.id).toBe('validate_o1_data_structures');
      expect(auditor.family).toBe('domain_data');
      expect(auditor.ruleIds).toContain('o1-catalog-lookup');
      validateAuditorConstruction(auditor);
    });

    it('resolves catalog patterns from config correctly with strings and RegExps', async () => {
      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.auditor/audit.config.json'),
        JSON.stringify({
          name: 'o1-project',
          domain: {
            o1CatalogPatterns: [
              {
                name: 'SERVERS',
                pattern: '\\bSERVERS\\.(find|filter)',
                alternative: 'SERVERS_BY_ID[id]',
                definingFile: 'src/servers.ts'
              }
            ]
          }
        }),
        'utf-8'
      );

      // Force config reload
      resetAuditConfig();
      const origCwd = process.cwd();
      try {
        process.chdir(tempDir);
        const resolved = getResolvedO1CatalogPatterns();
        expect(resolved.length).toBe(1);
        expect(resolved[0]?.pattern instanceof RegExp).toBe(true);
        expect(resolved[0]?.name).toBe('SERVERS');
      } finally {
        process.chdir(origCwd);
        resetAuditConfig();
      }
    });
  });

  describe('Violation Detection', () => {
    it('detects linear search on static catalogs (o1-catalog-lookup)', () => {
      const code = `
        const server = OFFICIAL_SERVERS.find(s => s.id === 'dev');
      `;
      const catalogPatterns = [
        {
          name: 'OFFICIAL_SERVERS',
          pattern: /\bOFFICIAL_SERVERS\.(?:find|filter|some|findLast)\s*\(/g,
          alternative: 'OFFICIAL_SERVERS_BY_ID[serverId]',
          definingFile: 'src/data/system/official_servers.ts'
        }
      ];
      const issues = scanFileForO1Issues('src/logic/serverFinder.ts', code, catalogPatterns);
      const issue = issues.find((i) => i.ruleId === 'o1-catalog-lookup');
      expect(issue).toBeDefined();
      expect(issue?.isWarning).toBe(false);

      // Defining file should be ignored
      const definingIssues = scanFileForO1Issues(
        'src/data/system/official_servers.ts',
        code,
        catalogPatterns
      );
      expect(definingIssues.filter((i) => i.ruleId === 'o1-catalog-lookup')).toHaveLength(0);
    });

    it('detects .includes() on constant array (o1-linear-membership)', () => {
      const code = `
        if (TARIFF_IDS.includes(id)) {
          return true;
        }
      `;
      const issues = scanFileForO1Issues('src/logic/tariffValidator.ts', code);
      const issue = issues.find((i) => i.ruleId === 'o1-linear-membership');
      expect(issue).toBeDefined();
    });

    it('detects Object.values / Object.keys .find() lookup (o1-object-scan)', () => {
      const code = `
        const found = Object.values(records).find(r => r.active);
      `;
      const issues = scanFileForO1Issues('src/logic/recordScanner.ts', code);
      const issue = issues.find((i) => i.ruleId === 'o1-object-scan');
      expect(issue).toBeDefined();
    });

    it('detects JSON.parse(JSON.stringify(...)) anti-pattern (o1-json-clone)', () => {
      const code = `
        const copy = JSON.parse(JSON.stringify(original));
      `;
      const issues = scanFileForO1Issues('src/logic/cloneHelper.ts', code);
      const issue = issues.find((i) => i.ruleId === 'o1-json-clone');
      expect(issue).toBeDefined();
    });

    it('detects redundant array spread return (o1-redundant-spread-return)', () => {
      const code = `
        export function getItems() {
          return [...allItems];
        }
      `;
      const issues = scanFileForO1Issues('src/logic/items.ts', code);
      const issue = issues.find((i) => i.ruleId === 'o1-redundant-spread-return');
      expect(issue).toBeDefined();
    });

    it('flags violations regardless of o1-ok or linear-search-ok comments (Zero-Ignore Mandate)', () => {
      const code = `
        const copy = JSON.parse(JSON.stringify(original)); // o1-ok: Benchmarking deep clone
        const hasId = TARIFF_IDS.includes(id); // linear-search-ok: Small array of 2 elements
      `;
      const issues = scanFileForO1Issues('src/logic/exempt.ts', code);
      expect(issues.length).toBeGreaterThanOrEqual(2);
    });

    it('triggers all class-level scanning methods and skips ignored files and comments', async () => {
      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.auditor/audit.config.json'),
        JSON.stringify({
          name: 'o1-scan-test',
          paths: { includeTestsInCodeAudit: false },
          domain: {
            o1CatalogPatterns: [
              {
                name: 'TEST_CATALOG',
                pattern: '\\bTEST_CATALOG\\.(find|filter)',
                alternative: 'TEST_CATALOG_BY_ID[id]',
                definingFile: 'src/catalog.ts'
              }
            ]
          }
        }),
        'utf-8'
      );

      const auditor = new TestableO1DataStructuresAuditor({ projectRoot: tempDir });

      // Comments and formatting
      const commentedCode = [
        '// TARIFF_IDS.includes(id)',
        '/* Object.keys(records).find(...) */',
        '* return [...allItems];'
      ].join('\n');
      auditor.testScanFile('src/comments.ts', commentedCode);
      expect(auditor.collectedViolations).toHaveLength(0);

      // Self file ignored
      auditor.testScanFile(
        'src/suites/domain_data/validate_o1_data_structures.ts',
        'TARIFF_IDS.includes(id)'
      );
      expect(auditor.collectedViolations).toHaveLength(0);

      // Test file ignored when includeTestsInCodeAudit is false
      auditor.testScanFile('src/logic/helper.test.ts', 'TARIFF_IDS.includes(id)');
      expect(auditor.collectedViolations).toHaveLength(0);

      // Defining catalog file ignored
      auditor.testScanFile('src/catalog.ts', 'TEST_CATALOG.find(x => x.id === 1)');
      expect(auditor.collectedViolations).toHaveLength(0);

      // Violations triggered across all rules
      const violationSnippet = [
        'TEST_CATALOG.find(x => x.id === 1);',
        'const hasId = USER_TYPES_IDS.includes(x);',
        'const obj = Object.entries(map).find(([k, v]) => v.ready);',
        'const cloned = JSON.parse(JSON.stringify(orig));',
        'return [...itemsList];'
      ].join('\n');
      auditor.testScanFile('src/violations.ts', violationSnippet);

      expect(auditor.collectedViolations.length).toBe(5);
      expect(auditor.collectedViolations.some((v) => v.ruleId === 'o1-catalog-lookup')).toBe(true);
      expect(auditor.collectedViolations.some((v) => v.ruleId === 'o1-linear-membership')).toBe(
        true
      );
      expect(auditor.collectedViolations.some((v) => v.ruleId === 'o1-object-scan')).toBe(true);
      expect(auditor.collectedViolations.some((v) => v.ruleId === 'o1-json-clone')).toBe(true);
      expect(
        auditor.collectedViolations.some((v) => v.ruleId === 'o1-redundant-spread-return')
      ).toBe(true);
    });

    it('detects violations and fails with status failed and severity error', async () => {
      const auditor = new TestableO1DataStructuresAuditor();
      const code = `
        const copy = JSON.parse(JSON.stringify(original));
      `;
      auditor.testScanFile('src/logic/cloneHelper.ts', code);
      const result = await auditor.finishAudit();
      expect(result.status).toBe('failed');
      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.findings.some((f) => f.severity === 'error')).toBe(true);
    });
  });

  describe('Clean Execution & Full Audit', () => {
    it('runs on compliant O(1) structures and reports zero errors', async () => {
      const auditor = new TestableO1DataStructuresAuditor();
      const code = `
        const server = OFFICIAL_SERVERS_BY_ID[id];
        const hasItem = TARIFF_ID_SET.has(id);
        const copy = structuredClone(original);
        return allItems;
      `;
      auditor.testScanFile('src/logic/cleanLogic.ts', code);
      expect(auditor.collectedViolations).toHaveLength(0);

      const result = await auditor.finishAudit();
      expect(result.id).toBe('validate_o1_data_structures');
      expect(result.summary).toBeDefined();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('executes full audit pass on a sandbox directory and marks o1-catalog-lookup not applicable when unconfigured', async () => {
      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.auditor/audit.config.json'),
        JSON.stringify({
          name: 'clean-o1-project',
          paths: { codeRoots: ['src'] }
        }),
        'utf-8'
      );

      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'src/clean.ts'),
        'export const value = 42;\nexport const set = new Set([1, 2]);\n',
        'utf-8'
      );

      const auditor = new O1DataStructuresAuditor({ roots: ['src'], projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });

  describe('3-Tier Canary Verification (AST Parity)', () => {
    it('flags multiline JSON.parse(JSON.stringify) regardless of comment on closing line', async () => {
      const code = `
export const copy = JSON.parse(
  JSON.stringify(payload)
); // o1-ok: Specialized JSON clone bridge
      `.trim();

      const issues = scanFileForO1Issues('src/logic/canaryClosing.ts', code);
      expect(issues.length).toBeGreaterThanOrEqual(1);
    });

    it('flags multiline return [...items] regardless of comment on preceding line', async () => {
      const code = `
// o1-ok: Defensive array cloning
return [
  ...items
];
      `.trim();

      const issues = scanFileForO1Issues('src/logic/canaryPreceding.ts', code);
      expect(issues.length).toBeGreaterThanOrEqual(1);
    });

    it('Active Canary: flags multiline return [...items] when no escape hatch is present', async () => {
      const code = `
return [
  ...items
];
      `.trim();

      const issues = scanFileForO1Issues('src/logic/canaryActive.ts', code);
      expect(issues).toHaveLength(1);
      expect(issues[0]?.ruleId).toBe('o1-redundant-spread-return');
    });
  });
});
