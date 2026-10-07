import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  ValidateDependencyVulnerabilitiesAuditor,
  DEPENDENCY_VULNERABILITIES_RULES,
  parseNpmAuditReport,
  type NpmAuditReport
} from '../src/suites/architecture/validate_dependency_vulnerabilities.ts';
import { setAuditConfig, resetAuditConfig, defineAuditConfig } from '../src/core/auditConfig.ts';

describe('ValidateDependencyVulnerabilitiesAuditor & parseNpmAuditReport', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-dep-vuln-test-'));
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

  describe('Rule Declarations & Metadata', () => {
    it('declares all expected rules in DEPENDENCY_VULNERABILITIES_RULES', () => {
      expect(DEPENDENCY_VULNERABILITIES_RULES).toContain('dependency-cve-critical');
      expect(DEPENDENCY_VULNERABILITIES_RULES).toContain('dependency-cve-high');
      expect(DEPENDENCY_VULNERABILITIES_RULES).toContain('dependency-cve-moderate');
    });

    it('initializes with correct auditor metadata and Spanish rule descriptions', () => {
      const auditor = new ValidateDependencyVulnerabilitiesAuditor({ projectRoot: tempDir });
      expect(auditor.id).toBe('validate_dependency_vulnerabilities');
      expect(auditor.family).toBe('architecture');
      expect(auditor.packageName).toBe('Dependencias');
      expect(auditor.ruleDescriptions['dependency-cve-critical']).toBe('Vulnerabilidad crítica en paquete');
      expect(auditor.ruleDescriptions['dependency-cve-high']).toBe('Vulnerabilidad de severidad alta');
      expect(auditor.ruleDescriptions['dependency-cve-moderate']).toBe('Vulnerabilidad moderada detectada');
    });
  });

  describe('parseNpmAuditReport', () => {
    it('returns empty findings for empty vulnerabilities', () => {
      const report: NpmAuditReport = { vulnerabilities: {} };
      const findings = parseNpmAuditReport(report, new Set(), 'critical');
      expect(findings).toEqual([]);
    });

    it('maps critical, high, and moderate vulnerabilities to corresponding rules', () => {
      const report: NpmAuditReport = {
        vulnerabilities: {
          'critical-pkg': {
            name: 'critical-pkg',
            severity: 'critical',
            isDirect: true,
            via: [{ title: 'Critical RCE in critical-pkg', url: 'https://example.com/cve-1' }],
            range: '<1.0.0',
            effects: []
          },
          'high-pkg': {
            name: 'high-pkg',
            severity: 'high',
            isDirect: false,
            via: [{ title: 'High ReDoS in high-pkg' }],
            range: '<2.0.0',
            effects: []
          },
          'moderate-pkg': {
            name: 'moderate-pkg',
            severity: 'moderate',
            isDirect: false,
            via: ['transitive-dep'],
            range: '<3.0.0',
            effects: []
          }
        }
      };

      const findings = parseNpmAuditReport(report, new Set(), 'critical');
      expect(findings).toHaveLength(3);

      const criticalFinding = findings.find(f => f.ruleId === 'dependency-cve-critical');
      expect(criticalFinding).toBeDefined();
      expect(criticalFinding?.severity).toBe('error');
      expect(criticalFinding?.message).toContain('Critical RCE');

      const highFinding = findings.find(f => f.ruleId === 'dependency-cve-high');
      expect(highFinding).toBeDefined();
      expect(highFinding?.severity).toBe('warning');

      const moderateFinding = findings.find(f => f.ruleId === 'dependency-cve-moderate');
      expect(moderateFinding).toBeDefined();
      expect(moderateFinding?.severity).toBe('warning');
    });

    it('filters out packages present in allowList', () => {
      const report: NpmAuditReport = {
        vulnerabilities: {
          braces: {
            name: 'braces',
            severity: 'high',
            isDirect: false,
            via: [{ title: 'braces stack exhaustion' }],
            range: '<=3.0.3',
            effects: []
          }
        }
      };

      const findings = parseNpmAuditReport(report, new Set(['braces']), 'critical');
      expect(findings).toHaveLength(0);
    });

    it('adjusts finding severity based on failOn configuration', () => {
      const report: NpmAuditReport = {
        vulnerabilities: {
          'high-pkg': {
            name: 'high-pkg',
            severity: 'high',
            isDirect: false,
            via: [{ title: 'High advisory' }],
            range: '<2.0.0',
            effects: []
          }
        }
      };

      const highFailFindings = parseNpmAuditReport(report, new Set(), 'high');
      expect(highFailFindings[0]?.severity).toBe('error');

      const criticalFailFindings = parseNpmAuditReport(report, new Set(), 'critical');
      expect(criticalFailFindings[0]?.severity).toBe('warning');
    });
  });

  describe('Clean Path Verification (StandardAuditResult)', () => {
    it('executes cleanly with status skipped when dependencyVulnerabilities is disabled in config', async () => {
      setAuditConfig(
        defineAuditConfig({
          name: 'Disabled Dependency Vulnerabilities Project',
          dependencyVulnerabilities: { enabled: false },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          packageDistribution: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidateDependencyVulnerabilitiesAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('skipped');
    });

    it('executes on valid clean package and reports zero errors when no high/critical vulnerabilities exist', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'clean-project', version: '1.0.0', dependencies: {} }, null, 2)
      );

      setAuditConfig(
        defineAuditConfig({
          name: 'Clean Dependencies Project',
          dependencyVulnerabilities: { enabled: true, failOn: 'critical' },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          packageDistribution: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidateDependencyVulnerabilitiesAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});
