/**
 * tests/validate_critical_config.test.ts
 *
 * Exhaustive unit tests for AuditorCriticalConfig contract across BaseAuditor,
 * constructor validation, manifest extraction, ValidateAuditConfigAuditor enforcement,
 * and host extensions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { BaseAuditor, type AuditorOptions } from '../src/core/auditorBase.ts';
import { ValidateAuditConfigAuditor } from '../src/suites/architecture/validate_audit_config.ts';
import { ValidateStylelintConfigAuditor, REQUIRED_STRICT_PROPERTIES } from '../src/suites/architecture/validate_stylelint_config.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import { resetAuditConfig } from '../src/core/auditConfig.ts';
import type { AuditTaskDefinition } from '../src/core/auditContract.ts';
import type { AuditEngineConfig } from '../src/core/auditConfigTypes.ts';

type SampleRuleId = 'sample-rule';

class ValidCriticalAuditor extends BaseAuditor<SampleRuleId> {
  constructor(projectRoot = process.cwd()) {
    super({
      id: 'validate_sample_critical',
      name: 'Sample Critical Suite',
      description: 'Valida invariantes críticas de prueba',
      family: 'architecture',
      packageName: 'Sample',
      icon: '🛡️',
      configKey: 'sample',
      defaultConfig: {
        enabled: true,
        strictList: ['alpha', 'beta']
      },
      criticalConfig: {
        rationale: 'Las constantes alpha y beta son invariantes de seguridad.',
        requiredMinimums: {
          strictList: ['alpha', 'beta']
        },
        forbiddenOverrides: {
          enabled: [false]
        }
      },
      ruleIds: ['sample-rule'],
      ruleDescriptions: {
        'sample-rule': 'Regla de muestra para validación'
      },
      capabilities: {
        fix: true,
        fixPriority: false,
        lint: true,
        md: false,
        ast: false,
        changedSince: false,
        heavy: false,
        requiresBuild: false,
        postRun: false
      },
      coverage: {
        include: ['src/**']
      },
      fixableRuleIds: ['sample-rule'],
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    this.markRuleEvaluated('sample-rule');
  }
}

class TestProbeAuditor extends BaseAuditor<SampleRuleId> {
  constructor(options: Record<string, unknown>, projectRoot = process.cwd()) {
    super({
      id: 'validate_sample_probe',
      name: 'Sample Probe Suite',
      description: 'Valida invariantes de prueba',
      family: 'architecture',
      packageName: 'Sample',
      icon: '🛡️',
      configKey: 'sample',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      ruleIds: ['sample-rule'],
      ruleDescriptions: {
        'sample-rule': 'Regla de muestra para validación'
      },
      capabilities: {
        fix: false,
        fixPriority: false,
        lint: true,
        md: false,
        ast: false,
        changedSince: false,
        heavy: false,
        requiresBuild: false,
        postRun: false
      },
      coverage: {
        include: ['src/**']
      },
      projectRoot,
      ...options
    } as AuditorOptions<SampleRuleId>);
  }

  public override async runAudit(): Promise<void> {
    this.markRuleEvaluated('sample-rule');
  }
}

class TestableAuditConfigAuditor extends ValidateAuditConfigAuditor {
  public async testVerifyCritical(config: unknown, tasks: readonly AuditTaskDefinition[]): Promise<void> {
    return this.verifyCriticalConfigurations(config as AuditEngineConfig, tasks);
  }
}

describe('Auditor Critical Configuration Contract', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-critical-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Constructor Contract & Conformance', () => {
    it('properly constructs and validates an auditor declaring criticalConfig', () => {
      const auditor = new ValidCriticalAuditor(tempDir);
      const errors = validateAuditorConstruction(auditor);
      expect(errors).toEqual([]);
      expect(auditor.criticalConfig).toBeDefined();
      expect(auditor.criticalConfig?.rationale).toBe('Las constantes alpha y beta son invariantes de seguridad.');
      expect(auditor.criticalConfig?.requiredMinimums?.strictList).toEqual(['alpha', 'beta']);

      const manifest = auditor.toManifest();
      expect(manifest.criticalConfig).toBeDefined();
      expect(manifest.criticalConfig?.rationale).toBe('Las constantes alpha y beta son invariantes de seguridad.');
      expect(manifest.criticalConfig?.requiredMinimums?.strictList).toEqual(['alpha', 'beta']);
      expect(manifest.criticalConfig?.forbiddenOverrides?.enabled).toEqual([false]);
    });

    it('rejects criticalConfig with empty rationale', () => {
      expect(() => {
        new TestProbeAuditor({
          criticalConfig: {
            rationale: '   ',
            requiredMinimums: { items: ['min1'] }
          }
        }, tempDir);
      }).toThrow(/must define a non-empty 'rationale' in 'criticalConfig'/);
    });

    it('rejects auditor when criticalConfig is undefined or omitted', () => {
      expect(() => {
        new TestProbeAuditor({
          criticalConfig: undefined
        }, tempDir);
      }).toThrow(/must define mandatory 'criticalConfig' in its constructor/);
    });

    it('allows empty criticalConfig: {} when no constraints are required', () => {
      const auditor = new TestProbeAuditor({ criticalConfig: {} }, tempDir);
      expect(auditor.criticalConfig).toEqual({});
      const manifest = auditor.toManifest();
      expect(manifest.criticalConfig).toEqual({});
    });

    it('rejects criticalConfig with non-array requiredMinimums', () => {
      expect(() => {
        new TestProbeAuditor({
          criticalConfig: {
            rationale: 'Mínimos inválidos',
            requiredMinimums: {
              items: 'not-an-array'
            }
          }
        }, tempDir);
      }).toThrow(/must be a non-empty array/);
    });
  });

  describe('ValidateAuditConfigAuditor Critical Enforcement', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(path.join(tempDir, '.gitignore'), 'scratch/\n', 'utf-8');
    });

    it('detects missing required minimums and fails with audit-config-critical-violation', async () => {
      const configContent = `import { defineAuditConfig } from '@francogp/auditor';
export default defineAuditConfig({
  name: 'TestProject',
  paths: { srcRoots: ['src'] },
  sample: {
    enabled: true,
    strictList: ['alpha'] // Missing 'beta'
  }
});
`;
      await fs.writeFile(path.join(tempDir, '.auditor/audit.config.ts'), configContent, 'utf-8');

      const auditor = new TestableAuditConfigAuditor({ projectRoot: tempDir });
      const sampleTask: AuditTaskDefinition = {
        id: 'validate_sample_critical',
        name: 'Sample Critical Suite',
        family: 'architecture',
        scriptPath: 'scripts/sample.ts',
        command: 'node',
        args: [],
        configKey: 'sample',
        criticalConfig: {
          rationale: 'Las constantes alpha y beta son obligatorias.',
          requiredMinimums: {
            strictList: ['alpha', 'beta']
          }
        }
      };

      // Mock discovery inside auditor by passing discovered tasks
      await auditor.testVerifyCritical(
        { _rawConfig: { sample: { enabled: true, strictList: ['alpha'] } } },
        [sampleTask]
      );

      const findings = auditor.getFindings();
      const criticalViolation = findings.find(f => f.ruleId === 'audit-config-critical-violation');
      expect(criticalViolation).toBeDefined();
      expect(criticalViolation?.severity).toBe('error');
      expect(criticalViolation?.message).toContain('missing required minimum values for "strictList": [beta]');
      expect(criticalViolation?.message).toContain('Las constantes alpha y beta son obligatorias.');
    });

    it('detects forbidden overrides and reports error', async () => {
      const auditor = new TestableAuditConfigAuditor({ projectRoot: tempDir });
      const sampleTask: AuditTaskDefinition = {
        id: 'validate_sample_critical',
        name: 'Sample Critical Suite',
        family: 'architecture',
        scriptPath: 'scripts/sample.ts',
        command: 'node',
        args: [],
        configKey: 'sample',
        criticalConfig: {
          rationale: 'Esta auditoría no puede desactivarse.',
          forbiddenOverrides: {
            enabled: [false]
          }
        }
      };

      await auditor.testVerifyCritical(
        { _rawConfig: { sample: { enabled: false } } },
        [sampleTask]
      );

      const findings = auditor.getFindings();
      const criticalViolation = findings.find(f => f.ruleId === 'audit-config-critical-violation');
      expect(criticalViolation).toBeDefined();
      expect(criticalViolation?.severity).toBe('error');
      expect(criticalViolation?.message).toContain('field "enabled" is set to disallowed value "false"');
    });

    it('executes custom validate predicate and reports error if invalid', async () => {
      const auditor = new TestableAuditConfigAuditor({ projectRoot: tempDir });
      const sampleTask: AuditTaskDefinition = {
        id: 'validate_sample_critical',
        name: 'Sample Critical Suite',
        family: 'architecture',
        scriptPath: 'scripts/sample.ts',
        command: 'node',
        args: [],
        configKey: 'sample',
        criticalConfig: {
          rationale: 'El límite debe ser mayor o igual a 10.',
          validate: (cfg: unknown) => {
            const typed = cfg as { limit?: number };
            if (typed.limit !== undefined && typed.limit < 10) {
              return `el límite configurado (${typed.limit}) es menor que el mínimo permitido (10)`;
            }
            return undefined;
          }
        }
      };

      await auditor.testVerifyCritical(
        { _rawConfig: { sample: { limit: 4 } } },
        [sampleTask]
      );

      const findings = auditor.getFindings();
      const criticalViolation = findings.find(f => f.ruleId === 'audit-config-critical-violation');
      expect(criticalViolation).toBeDefined();
      expect(criticalViolation?.severity).toBe('error');
      expect(criticalViolation?.message).toContain('el límite configurado (4) es menor que el mínimo permitido (10)');
    });
  });

  describe('Core Suite Integration: ValidateStylelintConfigAuditor', () => {
    it('declares criticalConfig with REQUIRED_STRICT_PROPERTIES', () => {
      const auditor = new ValidateStylelintConfigAuditor({ projectRoot: tempDir });
      expect(auditor.criticalConfig).toBeDefined();
      expect(auditor.criticalConfig?.rationale).toContain('Exigir variables SCSS ($var) o CSS');
      expect(auditor.criticalConfig?.requiredMinimums?.['strictValues.properties']).toEqual(
        expect.arrayContaining([...REQUIRED_STRICT_PROPERTIES])
      );
      const errors = validateAuditorConstruction(auditor);
      expect(errors).toEqual([]);
    });
  });
});
