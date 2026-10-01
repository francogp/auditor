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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  O1DataStructuresAuditor,
  O1_RULES,
  scanFileForO1Issues
} from '../src/suites/domain_data/validate_o1_data_structures.ts';
import type { ViolationInput } from '../src/core/auditorBase.ts';
import type { O1RuleId } from '../src/suites/domain_data/validate_o1_data_structures.ts';

class TestableO1DataStructuresAuditor extends O1DataStructuresAuditor {
  public readonly collectedViolations: ViolationInput<O1RuleId>[] = [];

  public override addViolation(v: ViolationInput<O1RuleId>): void {
    this.collectedViolations.push(v);
    super.addViolation(v);
  }

  public testScanFile(relPath: string, content: string): void {
    this.scanFile(relPath, content);
  }
}

describe('O1DataStructuresAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('declares all expected canonical rules', () => {
      expect(O1_RULES).toContain('o1-catalog-lookup');
      expect(O1_RULES).toContain('o1-linear-membership');
      expect(O1_RULES).toContain('o1-object-scan');
      expect(O1_RULES).toContain('o1-json-clone');
      expect(O1_RULES).toContain('o1-redundant-spread-return');
    });

    it('initializes with correct id and family', () => {
      const auditor = new O1DataStructuresAuditor();
      expect(auditor.id).toBe('validate_o1_data_structures');
      expect(auditor.family).toBe('domain_data');
      expect(auditor.ruleIds).toContain('o1-catalog-lookup');
    });
  });

  describe('Violation Detection', () => {
    it('detects linear search on static catalogs (o1-catalog-lookup)', () => {
      const code = `
        const server = OFFICIAL_SERVERS.find(s => s.id === 'dev');
      `;
      const issues = scanFileForO1Issues('src/logic/serverFinder.ts', code);
      const issue = issues.find(i => i.ruleId === 'o1-catalog-lookup');
      expect(issue).toBeDefined();
      expect(issue?.isWarning).toBe(false);
    });

    it('detects .includes() on constant array (o1-linear-membership)', () => {
      const code = `
        if (TARIFF_IDS.includes(id)) {
          return true;
        }
      `;
      const issues = scanFileForO1Issues('src/logic/tariffValidator.ts', code);
      const issue = issues.find(i => i.ruleId === 'o1-linear-membership');
      expect(issue).toBeDefined();
    });

    it('detects Object.values / Object.keys .find() lookup (o1-object-scan)', () => {
      const code = `
        const found = Object.values(records).find(r => r.active);
      `;
      const issues = scanFileForO1Issues('src/logic/recordScanner.ts', code);
      const issue = issues.find(i => i.ruleId === 'o1-object-scan');
      expect(issue).toBeDefined();
    });

    it('detects JSON.parse(JSON.stringify(...)) anti-pattern (o1-json-clone)', () => {
      const code = `
        const copy = JSON.parse(JSON.stringify(original));
      `;
      const issues = scanFileForO1Issues('src/logic/cloneHelper.ts', code);
      const issue = issues.find(i => i.ruleId === 'o1-json-clone');
      expect(issue).toBeDefined();
    });

    it('detects redundant array spread return (o1-redundant-spread-return)', () => {
      const code = `
        export function getItems() {
          return [...allItems];
        }
      `;
      const issues = scanFileForO1Issues('src/logic/items.ts', code);
      const issue = issues.find(i => i.ruleId === 'o1-redundant-spread-return');
      expect(issue).toBeDefined();
    });

    it('allows exceptions with // o1-ok or // linear-search-ok', () => {
      const code = `
        const copy = JSON.parse(JSON.stringify(original)); // o1-ok: Benchmarking deep clone
        const hasId = TARIFF_IDS.includes(id); // linear-search-ok: Small array of 2 elements
      `;
      const issues = scanFileForO1Issues('src/logic/exempt.ts', code);
      expect(issues).toHaveLength(0);
    });
  });

  describe('Clean Execution', () => {
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
  });
});
