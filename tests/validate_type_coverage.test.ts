import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  ValidateTypeCoverageAuditor,
  parseTypeCoverageReport,
  type TypeCoverageReport
} from '../src/suites/architecture/validate_type_coverage.ts';
import { setAuditConfig, resetAuditConfig, defineAuditConfig } from '../src/core/auditConfig.ts';

describe('ValidateTypeCoverageAuditor & parseTypeCoverageReport', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-typecov-test-'));
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok: cleanup temporary test directory
    }
  });

  describe('parseTypeCoverageReport parser', () => {
    it('returns zero findings when coverage equals or exceeds threshold', () => {
      const report: TypeCoverageReport = {
        correctCount: 99,
        totalCount: 100,
        percent: 99.0,
        percentString: '99.00',
        anys: []
      };

      const findings = parseTypeCoverageReport(report, 98, tempDir);
      expect(findings).toEqual([]);
    });

    it('returns below-threshold and untyped-identifier findings when coverage is lower than threshold', () => {
      const report: TypeCoverageReport = {
        correctCount: 80,
        totalCount: 100,
        percent: 80.0,
        percentString: '80.00',
        atLeastFailed: true,
        anys: [
          {
            filePath: path.join(tempDir, 'src/api.ts'),
            line: 14,
            character: 5,
            text: 'untypedPayload'
          }
        ]
      };

      const findings = parseTypeCoverageReport(report, 95, tempDir);
      expect(findings.length).toBeGreaterThanOrEqual(2);

      const thresholdFinding = findings.find(f => f.ruleId === 'type-coverage-below-threshold');
      expect(thresholdFinding).toBeDefined();
      expect(thresholdFinding?.message).toContain('80.00%');
      expect(thresholdFinding?.message).toContain('95%');

      const anyFinding = findings.find(f => f.ruleId === 'type-coverage-untyped-identifier');
      expect(anyFinding).toBeDefined();
      expect(anyFinding?.file).toBe('src/api.ts');
      expect(anyFinding?.context).toBe('untypedPayload');
    });
  });

  describe('Clean Path Verification (StandardAuditResult)', () => {
    it('executes cleanly with zero errors when typeCoverage is disabled', async () => {
      setAuditConfig(
        defineAuditConfig({
          name: 'Type Coverage Disabled Project',
          typeCoverage: { enabled: false },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          packageDistribution: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidateTypeCoverageAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('skipped');
    });

    it('executes runAudit and imports findings when coverage is below threshold', async () => {
      const cliUtils = await import('../src/cli/cliUtils.ts');
      const { vi } = await import('vitest');
      vi.spyOn(cliUtils, 'executeCliAndReadJson').mockReturnValue({
        correctCount: 75,
        totalCount: 100,
        percent: 75.0,
        percentString: '75.00',
        atLeastFailed: true,
        anys: []
      });

      setAuditConfig(
        defineAuditConfig({
          name: 'Type Coverage Enabled Project',
          typeCoverage: { enabled: true, atLeast: 80 },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          packageDistribution: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidateTypeCoverageAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(1);
      expect(result.findings[0]!.ruleId).toBe('type-coverage-below-threshold');
    });
  });
});

