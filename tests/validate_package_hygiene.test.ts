import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  ValidatePackageHygieneAuditor,
  parseKnipIssues,
  type KnipReport
} from '../src/suites/architecture/validate_package_hygiene.ts';
import { setAuditConfig, resetAuditConfig, defineAuditConfig } from '../src/core/auditConfig.ts';

describe('ValidatePackageHygieneAuditor & parseKnipIssues', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-knip-test-'));
  });

  afterEach(() => {
    resetAuditConfig();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok: cleanup temporary test directory
    }
  });

  describe('parseKnipIssues parser', () => {
    it('returns empty findings for empty report', () => {
      const report: KnipReport = { issues: [] };
      const findings = parseKnipIssues(report, tempDir);
      expect(findings).toEqual([]);
    });

    it('correctly maps unused dependencies to canonical AuditFinding objects', () => {
      const report: KnipReport = {
        issues: [
          {
            file: path.join(tempDir, 'package.json'),
            dependencies: [{ name: 'unused-lib', line: 12, col: 4 }],
            devDependencies: [{ name: 'unused-dev-lib', line: 20, col: 4 }]
          }
        ]
      };

      const findings = parseKnipIssues(report, tempDir);
      expect(findings).toHaveLength(2);

      const f1 = findings[0]!;
      expect(f1.suiteId).toBe('validate_package_hygiene');
      expect(f1.ruleId).toBe('package-unused-dependency');
      expect(f1.file).toBe('package.json');
      expect(f1.line).toBe(12);
      expect(f1.col).toBe(4);
      expect(f1.context).toBe('unused-lib');
      expect(f1.message).toContain('unused-lib');

      const f2 = findings[1]!;
      expect(f2.ruleId).toBe('package-unused-dependency');
      expect(f2.context).toBe('unused-dev-lib');
    });

    it('correctly maps unlisted phantom dependencies', () => {
      const report: KnipReport = {
        issues: [
          {
            file: path.join(tempDir, 'src/service.ts'),
            unlisted: [{ name: 'phantom-pkg', line: 3, col: 8 }]
          }
        ]
      };

      const findings = parseKnipIssues(report, tempDir);
      expect(findings).toHaveLength(1);
      const f = findings[0]!;
      expect(f.ruleId).toBe('package-unlisted-dependency');
      expect(f.file).toBe('src/service.ts');
      expect(f.line).toBe(3);
      expect(f.col).toBe(8);
      expect(f.context).toBe('phantom-pkg');
      expect(f.message).toContain('phantom-pkg');
    });

    it('filters out unlisted dependencies in ignored paths via isPathIgnored', () => {
      const report: KnipReport = {
        issues: [
          {
            file: path.join(tempDir, 'external/vendored-lib/index.ts'),
            unlisted: [{ name: 'ignored-dep', line: 1, col: 1 }]
          },
          {
            file: path.join(tempDir, 'src/valid.ts'),
            unlisted: [{ name: 'legitimate-unlisted', line: 5, col: 2 }]
          }
        ]
      };

      const isPathIgnored = (rel: string) => rel.startsWith('external/');
      const findings = parseKnipIssues(report, tempDir, isPathIgnored);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.file).toBe('src/valid.ts');
      expect(findings[0]!.context).toBe('legitimate-unlisted');
    });

    it('correctly maps unused binaries', () => {
      const report: KnipReport = {
        issues: [
          {
            file: 'package.json',
            binaries: [{ name: 'orphan-bin', line: 1, col: 1 }]
          }
        ]
      };

      const findings = parseKnipIssues(report, tempDir);
      expect(findings).toHaveLength(1);
      const f = findings[0]!;
      expect(f.ruleId).toBe('package-unused-binary');
      expect(f.context).toBe('orphan-bin');
      expect(f.message).toContain('orphan-bin');
    });
  });

  describe('Clean Path Verification (StandardAuditResult)', () => {
    it('executes cleanly with zero errors when packageHygiene is disabled', async () => {
      setAuditConfig(
        defineAuditConfig({
          name: 'Knip Disabled Project',
          packageHygiene: { enabled: false },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          packageDistribution: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidatePackageHygieneAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});
