import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { resetAuditConfig } from '../src/core/auditConfig.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import {
  ValidateQueryPerformanceAuditor,
  QUERY_PERFORMANCE_RULES
} from '../src/suites/performance/validate_query_performance.ts';

describe('ValidateQueryPerformanceAuditor Conformance & Rule Detection', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'query-perf-test-'));
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* non-fatal test cleanup */
    }
  });

  describe('Point 1: Construction & Metadata Conformance', () => {
    it('initializes with correct auditor metadata and rule descriptions', () => {
      const auditor = new ValidateQueryPerformanceAuditor({ projectRoot: tempDir });
      expect(auditor.id).toBe('validate_query_performance');
      expect(auditor.name).toBe('Database Query & Index Performance Validator');
      expect(auditor.family).toBe('performance');
      expect(auditor.packageName).toBe('DBQuery');
      expect(auditor.icon).toBe('⚡');
      expect(auditor.ruleIds).toEqual([...QUERY_PERFORMANCE_RULES]);
      expect(auditor.ruleDescriptions['unindexed-foreign-keys']).toBe(
        'Foreign key without secondary index'
      );
      expect(auditor.ruleDescriptions['select-star-in-queries']).toBe(
        'SELECT * in repository or service'
      );
      expect(auditor.ruleDescriptions['unpaginated-queries']).toBe(
        'Query without LIMIT or pagination'
      );
      expect(auditor.ruleDescriptions['n-plus-one-patterns']).toBe('Database query inside loop');
      expect(auditor.ruleDescriptions['heavy-count-queries']).toBe(
        'SELECT COUNT(*) without filter'
      );
      expect(auditor.ruleDescriptions['unindexed-order-by']).toBe('Pagination with high OFFSET');

      const constructionErrors = validateAuditorConstruction(auditor);
      expect(constructionErrors).toHaveLength(0);
    });
  });

  describe('Point 2: Clean Path Verification', () => {
    it('passes cleanly reporting zero errors on indexed queries and cursor pagination', async () => {
      const auditor = new ValidateQueryPerformanceAuditor({ projectRoot: tempDir });
      const cleanSql = [
        'CREATE TABLE orders (',
        '  id uuid PRIMARY KEY,',
        '  customer_id uuid REFERENCES customers(id)',
        ');',
        'CREATE INDEX idx_orders_customer_id ON orders(customer_id);'
      ].join('\n');

      auditor.testScanFile('migrations/001_orders.sql', cleanSql);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
      expect(result.findings).toHaveLength(0);
    });

    it('ignores SELECT * in immutable migration files to prevent false positives', async () => {
      const auditor = new ValidateQueryPerformanceAuditor({ projectRoot: tempDir });
      const migrationSql = [
        '-- Data migration backfill',
        'DO $$',
        'BEGIN',
        '  FOR r IN SELECT * FROM legacy_players LOOP',
        '    INSERT INTO players (id) VALUES (r.id);',
        '  END LOOP;',
        'END $$;'
      ].join('\n');

      auditor.testScanFile('supabase/migrations/20260101_backfill.sql', migrationSql);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Point 3: Violation Detection Path for All 6 Rules', () => {
    it('detects unindexed-foreign-keys when foreign key lacks secondary index', async () => {
      const auditor = new ValidateQueryPerformanceAuditor({ projectRoot: tempDir });
      const snippet = 'CREATE TABLE orders ( id uuid, customer_id uuid REFERENCES customers(id) );';

      auditor.testScanFile('migrations/002_missing_index.sql', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'unindexed-foreign-keys');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects select-star-in-queries when SELECT * is used in repository', async () => {
      const auditor = new ValidateQueryPerformanceAuditor({ projectRoot: tempDir });
      const snippet = 'const users = await db.' + 'from("users").' + 'select("*");';

      auditor.testScanFile('src/services/userService.ts', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'select-star-in-queries');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects unpaginated-queries when collection query omits limit or range', async () => {
      const auditor = new ValidateQueryPerformanceAuditor({ projectRoot: tempDir });
      const snippet =
        'const logs = await supabase.' + 'from("audit_logs").' + 'select("id, action");';

      auditor.testScanFile('src/services/logService.ts', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'unpaginated-queries');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects n-plus-one-patterns when queries execute inside loops', async () => {
      const auditor = new ValidateQueryPerformanceAuditor({ projectRoot: tempDir });
      const snippet = [
        'for (const id of userIds) {',
        '  const user = ' + 'await db.from("users").select("id").eq("id", id).single();',
        '}'
      ].join('\n');

      auditor.testScanFile('src/services/batchService.ts', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'n-plus-one-patterns');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects heavy-count-queries when COUNT(*) is unbounded without filter', async () => {
      const auditor = new ValidateQueryPerformanceAuditor({ projectRoot: tempDir });
      const snippet = 'SELECT' + ' COUNT(*) FROM large_table;';

      auditor.testScanFile('src/queries/count.sql', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'heavy-count-queries');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects unindexed-order-by when high OFFSET is used instead of cursor', async () => {
      const auditor = new ValidateQueryPerformanceAuditor({ projectRoot: tempDir });
      const snippet = 'SELECT id FROM transactions ORDER BY created_at ' + 'OFFSET 500 LIMIT 20;';

      auditor.testScanFile('src/queries/paginate.sql', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'unindexed-order-by');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });
  });

  describe('Point 4 & 5: Duration Invariants & 100% Rule Coverage', () => {
    it('measures real empirical durations for 100% of declared rules', () => {
      const auditor = new ValidateQueryPerformanceAuditor({ projectRoot: tempDir });
      auditor.testScanFile('src/clean.sql', '-- clean query');

      for (const rule of QUERY_PERFORMANCE_RULES) {
        const duration = auditor.getRuleDuration(rule);
        expect(duration).toBeDefined();
        expect(duration!).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
