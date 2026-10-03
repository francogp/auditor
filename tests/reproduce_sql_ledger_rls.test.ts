/**
 * tests/reproduce_sql_ledger_rls.test.ts
 *
 * REPRODUCTION TEST: Migration ledger tables (_migrations, schema_migrations, supabase_migrations)
 * intentionally use PostgreSQL default-deny RLS (ENABLE ROW LEVEL SECURITY with 0 policies)
 * to block unauthorized client API access while letting superuser/service_role execute migrations.
 *
 * Current behavior: validate_sql_anti_patterns reports sql-rls-policy-grant-integrity on _migrations.
 * Desired behavior: canonical ledger tables and persistence.exemptRlsTables must be exempt.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SqlAntiPatternsAuditor } from '../src/suites/persistence/validate_sql_anti_patterns.ts';
import { setAuditConfig, resetAuditConfig, DEFAULT_AUDIT_CONFIG } from '../src/core/auditConfig.ts';

describe('Reproduction: RLS Policy Check on Migration Ledger Tables', () => {
  const scratchDir = path.resolve(process.cwd(), 'scratch/test_rls_ledger_' + crypto.randomUUID());
  const migrationsDir = path.join(scratchDir, 'database/migrations');

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    fs.mkdirSync(migrationsDir, { recursive: true });
    fs.mkdirSync(path.join(scratchDir, 'src'), { recursive: true });
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    if (fs.existsSync(scratchDir)) {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it('exempts canonical _migrations table with ENABLE ROW LEVEL SECURITY from requiring CREATE POLICY', async () => {
    const migrationSql = `
      -- 20260518000000_harden_security_and_rls.sql
      ALTER TABLE public._migrations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.supabase_migrations ENABLE ROW LEVEL SECURITY;
    `;
    fs.writeFileSync(path.join(migrationsDir, '20260518000000_harden_security_and_rls.sql'), migrationSql, 'utf-8');

    const auditor = new SqlAntiPatternsAuditor('database/migrations', scratchDir);
    const result = await auditor.execute();

    const rlsViolations = result.findings.filter(f => f.ruleId === 'sql-rls-policy-grant-integrity');
    expect(rlsViolations.length).toBe(0);
  });

  it('exempts custom tables declared in config.persistence.exemptRlsTables', async () => {
    const migrationSql = `
      ALTER TABLE public.custom_system_ledger ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.unprotected_user_table ENABLE ROW LEVEL SECURITY;
    `;
    fs.writeFileSync(path.join(migrationsDir, '20260519000000_custom_system.sql'), migrationSql, 'utf-8');

    setAuditConfig({
      ...DEFAULT_AUDIT_CONFIG,
      paths: { ...DEFAULT_AUDIT_CONFIG.paths, migrationsDir: 'database/migrations', srcRoots: ['src'] },
      persistence: {
        ...DEFAULT_AUDIT_CONFIG.persistence,
        exemptRlsTables: ['custom_system_ledger']
      }
    }, scratchDir);

    const auditor = new SqlAntiPatternsAuditor('database/migrations', scratchDir);
    const result = await auditor.execute();

    const rlsViolations = result.findings.filter(f => f.ruleId === 'sql-rls-policy-grant-integrity');
    expect(rlsViolations.length).toBe(1);
    expect(rlsViolations[0]?.message).toContain('unprotected_user_table');
  });
});
