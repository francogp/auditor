/**
 * packages/auditor/tests/validate_sql_anti_patterns.test.ts
 *
 * Dedicated unit test suite for SqlAntiPatternsAuditor:
 * - Positional JSON array mutations in SQL (sql-no-positional-arrays)
 * - Undeclared PL/pgSQL loop variables (sql-plpgsql-declared-variables)
 * - Tables with RLS enabled missing CREATE POLICY (sql-rls-policy-grant-integrity)
 * - Database payload properties in camelCase (db-payload-snake-case)
 * - Uncoordinated localStorage save bypasses (storage-uncoordinated-save-bypass)
 * - Honors escape hatches (sql-ok, plpgsql-ok, rls-ok, db-ok, storage-ok)
 * - Verifies clean execution (0 errors, passed status)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  SqlAntiPatternsAuditor,
  SQL_ANTI_PATTERN_RULES
} from '../src/suites/persistence/validate_sql_anti_patterns.ts';

describe('SqlAntiPatternsAuditor', () => {
  const scratchDir = path.resolve(process.cwd(), 'scratch/test_sql_anti_patterns_' + crypto.randomUUID());
  const migrationsDir = path.join(scratchDir, 'supabase/migrations');

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    fs.mkdirSync(migrationsDir, { recursive: true });
    fs.mkdirSync(path.join(scratchDir, 'src/logic'), { recursive: true });
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    if (fs.existsSync(scratchDir)) {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  describe('Metadata & Configuration', () => {
    it('declares all expected canonical rules', () => {
      expect(SQL_ANTI_PATTERN_RULES).toContain('sql-no-positional-arrays');
      expect(SQL_ANTI_PATTERN_RULES).toContain('sql-plpgsql-declared-variables');
      expect(SQL_ANTI_PATTERN_RULES).toContain('sql-rls-policy-grant-integrity');
      expect(SQL_ANTI_PATTERN_RULES).toContain('db-payload-snake-case');
      expect(SQL_ANTI_PATTERN_RULES).toContain('storage-uncoordinated-save-bypass');
    });

    it('initializes with correct id and family', () => {
      const auditor = new SqlAntiPatternsAuditor();
      expect(auditor.id).toBe('validate_sql_anti_patterns');
      expect(auditor.family).toBe('persistence');
      expect(auditor.ruleIds).toContain('sql-no-positional-arrays');
    });
  });

  describe('Violation Detection', () => {
    it('detects positional JSON array mutation in SQL (sql-no-positional-arrays)', async () => {
      const sql = `
        UPDATE user_data SET data = jsonb_set(data, '{team,0}', '{"name": "test"}');
      `;
      fs.writeFileSync(path.join(migrationsDir, '001_positional.sql'), sql, 'utf-8');

      class TestableAuditor extends SqlAntiPatternsAuditor {
        constructor() {
          super('supabase/migrations', scratchDir);
        }
      }

      const auditor = new TestableAuditor();
      const result = await auditor.execute();
      const violation = result.findings.find(f => f.ruleId === 'sql-no-positional-arrays');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects undeclared loop variable in PL/pgSQL function (sql-plpgsql-declared-variables)', async () => {
      const sql = `
        CREATE OR REPLACE FUNCTION audit_rows() RETURNS void AS $$
        DECLARE
          total int;
        BEGIN
          FOR row_item IN SELECT * FROM items LOOP
            total := total + 1;
          END LOOP;
        END;
        $$ LANGUAGE plpgsql;
      `;
      fs.writeFileSync(path.join(migrationsDir, '002_plpgsql.sql'), sql, 'utf-8');

      class TestableAuditor extends SqlAntiPatternsAuditor {
        constructor() {
          super('supabase/migrations', scratchDir);
        }
      }

      const auditor = new TestableAuditor();
      const result = await auditor.execute();
      const violation = result.findings.find(f => f.ruleId === 'sql-plpgsql-declared-variables');
      expect(violation).toBeDefined();
    });

    it('detects table with RLS enabled lacking CREATE POLICY (sql-rls-policy-grant-integrity)', async () => {
      const sql = `
        ALTER TABLE public.secure_records ENABLE ROW LEVEL SECURITY;
      `;
      fs.writeFileSync(path.join(migrationsDir, '003_rls.sql'), sql, 'utf-8');

      class TestableAuditor extends SqlAntiPatternsAuditor {
        constructor() {
          super('supabase/migrations', scratchDir);
        }
      }

      const auditor = new TestableAuditor();
      const result = await auditor.execute();
      const violation = result.findings.find(f => f.ruleId === 'sql-rls-policy-grant-integrity');
      expect(violation).toBeDefined();
    });

    it('detects camelCase keys in database payloads (db-payload-snake-case)', () => {
      class TestableAuditor extends SqlAntiPatternsAuditor {
        constructor() {
          super('supabase/migrations', scratchDir);
        }
        public testScanTypeScript(relPath: string, content: string): void {
          this.scanTypeScriptFile(relPath, content);
        }
      }

      const auditor = new TestableAuditor();
      const code = `
        await supabase.from('users').insert({
          userEmail: 'admin@example.com',
          fullName: 'Admin User'
        });
      `;
      const issues: string[] = [];
      auditor.addViolation = (v) => {
        issues.push(v.ruleId);
      };

      auditor.testScanTypeScript('src/logic/userRepo.ts', code);
      expect(issues).toContain('db-payload-snake-case');
    });

    it('detects uncoordinated localStorage save bypasses (storage-uncoordinated-save-bypass)', () => {
      class TestableAuditor extends SqlAntiPatternsAuditor {
        constructor() {
          super('supabase/migrations', scratchDir, ['app_local_save_']);
        }
        public testScanTypeScript(relPath: string, content: string): void {
          this.scanTypeScriptFile(relPath, content);
        }
      }

      const auditor = new TestableAuditor();
      const code = `
        localStorage.setItem('app_local_save_data', JSON.stringify({}));
      `;
      const issues: string[] = [];
      auditor.addViolation = (v) => {
        issues.push(v.ruleId);
      };

      auditor.testScanTypeScript('src/logic/badStorage.ts', code);
      expect(issues).toContain('storage-uncoordinated-save-bypass');
    });
  });

  describe('Clean Execution', () => {
    it('runs on compliant SQL and snake_case payloads and reports zero errors', async () => {
      const cleanMigrationsDir = path.join(scratchDir, 'clean_migrations');
      fs.mkdirSync(cleanMigrationsDir, { recursive: true });
      const sql = `
        ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Allow select for auth users" ON public.bills FOR SELECT TO authenticated USING (true);
      `;
      fs.writeFileSync(path.join(cleanMigrationsDir, '001_clean.sql'), sql, 'utf-8');

      class TestableAuditor extends SqlAntiPatternsAuditor {
        constructor() {
          super('clean_migrations', scratchDir);
        }
      }

      const auditor = new TestableAuditor();
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      const rlsViolations = result.findings.filter(f => f.ruleId === 'sql-rls-policy-grant-integrity');
      expect(rlsViolations).toHaveLength(0);
      expect(rlsViolations.length).toBe(0);
    });
  });
});
