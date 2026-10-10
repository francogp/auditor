/**
 * tests/auditor_contract_enforcement.test.ts
 *
 * RIGOROUS PROOF OF THE ARCHITECTURAL CONTRACT:
 * Verifies that it is IMPOSSIBLE to create, implement, or instantiate any BaseAuditor,
 * FileScanAuditor, sub-auditor, or host extension without providing all mandatory metadata:
 *   - configKey (string)
 *   - defaultConfig (object with explicit enabled: boolean for subsystem suites)
 *   - id, name, description, family, packageName, icon, ruleDescriptions
 *
 * Also verifies dynamic configuration generation (auditor fix) and dynamic gating.
 */

import { describe, it, expect } from 'vitest';
import { BaseAuditor, FileScanAuditor, type AuditorOptions } from '../src/core/auditorBase.ts';
import { createDefaultAuditConfigContent } from '../src/suites/architecture/validate_audit_config.ts';
import { evaluateSuiteStatus } from '../src/core/suiteGating.ts';
import type { AuditTaskDefinition } from '../src/core/auditContract.ts';
import type { AuditConfig } from '../src/core/auditConfigTypes.ts';

type SampleRuleId = 'sample-rule-a' | 'sample-rule-b';

class TestSubAuditor extends BaseAuditor<SampleRuleId> {
  constructor(options: Partial<AuditorOptions<SampleRuleId>> = {}) {
    super(options as AuditorOptions<SampleRuleId>);
  }
  public override async runAudit(): Promise<void> {}
}

class TestFileScanSubAuditor extends FileScanAuditor<SampleRuleId> {
  constructor(options: Partial<AuditorOptions<SampleRuleId>> = {}) {
    super(options as AuditorOptions<SampleRuleId>);
  }
  protected override scanFile(): void {}
}

const CANONICAL_VALID_OPTIONS: AuditorOptions<SampleRuleId> = {
  id: 'validate_contract_probe',
  name: 'Contract Probe Auditor',
  description: 'Valida cumplimiento estricto del contrato arquitectónico',
  family: 'architecture',
  packageName: 'Contract',
  icon: '🛡️',
  configKey: 'contractProbe.enabled',
  defaultConfig: { enabled: true, mode: 'strict' },
  criticalConfig: {},
  ruleIds: ['sample-rule-a', 'sample-rule-b'],
  ruleDescriptions: {
    'sample-rule-a': 'Primera regla obligatoria',
    'sample-rule-b': 'Segunda regla obligatoria'
  },
  coverage: {
    include: ['src/**/*.ts']
  },
  capabilities: {
    fix: false,
    fixPriority: false,
    lint: false,
    md: false,
    ast: false,
    changedSince: false,
    heavy: false,
    requiresBuild: false,
    postRun: false
  }
};

describe('Auditor Mandatory Constructor Contract & Zero-Bypass Enforcer', () => {
  describe('Impossibility to instantiate BaseAuditor without mandatory metadata', () => {
    it('THROWS if configKey is omitted or empty', () => {
      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          configKey: undefined as unknown as string
        });
      }).toThrow(/must define a mandatory 'configKey'/);

      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          configKey: ''
        });
      }).toThrow(/must define a mandatory 'configKey'/);

      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          configKey: '   '
        });
      }).toThrow(/must define a mandatory 'configKey'/);
    });

    it('THROWS if defaultConfig is omitted or not an object', () => {
      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          defaultConfig: undefined as unknown as Record<string, unknown>
        });
      }).toThrow(/must define a mandatory 'defaultConfig'/);

      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          defaultConfig: null as unknown as Record<string, unknown>
        });
      }).toThrow(/must define a mandatory 'defaultConfig'/);

      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          defaultConfig: 'invalid' as unknown as Record<string, unknown>
        });
      }).toThrow(/must define a mandatory 'defaultConfig'/);
    });

    it('THROWS if criticalConfig is omitted or undefined', () => {
      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          criticalConfig: undefined as unknown as Record<string, unknown>
        });
      }).toThrow(/must define mandatory 'criticalConfig' in its constructor/);

      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          criticalConfig: null as unknown as Record<string, unknown>
        });
      }).toThrow(/'criticalConfig' must be an object/);
    });

    it('THROWS if a subsystem suite does NOT explicitly define defaultConfig.enabled as a boolean', () => {
      // Missing enabled property
      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          configKey: 'customSubsystem.enabled',
          defaultConfig: { mode: 'fast' }
        });
      }).toThrow(/must explicitly define 'defaultConfig.enabled' as a boolean/);

      // Non-boolean enabled property (string 'true')
      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          configKey: 'customSubsystem.enabled',
          defaultConfig: { enabled: 'true' as unknown as boolean }
        });
      }).toThrow(/must explicitly define 'defaultConfig.enabled' as a boolean/);

      // Explicit boolean true succeeds
      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          configKey: 'customSubsystem.enabled',
          defaultConfig: { enabled: true }
        });
      }).not.toThrow();

      // Explicit boolean false succeeds
      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          configKey: 'customSubsystem.enabled',
          defaultConfig: { enabled: false }
        });
      }).not.toThrow();
    });

    it('allows empty defaultConfig for core hygiene suites with configKey: paths or core', () => {
      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          configKey: 'paths',
          defaultConfig: {}
        });
      }).not.toThrow();

      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          configKey: 'core',
          defaultConfig: {}
        });
      }).not.toThrow();
    });

    it('THROWS if thematic icon is omitted or empty', () => {
      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          icon: ''
        });
      }).toThrow(/must define a mandatory thematic icon\/emoji/);

      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          icon: undefined as unknown as string
        });
      }).toThrow(/must define a mandatory thematic icon\/emoji/);
    });

    it('THROWS if description is missing or exceeds limits', () => {
      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          description: ''
        });
      }).toThrow(/must define a human-friendly description/);

      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          description: 'Esta descripción supera ampliamente los sesenta caracteres máximos permitidos por el framework para mantener una salida limpia'
        });
      }).toThrow(/description exceeds 60 characters/);
    });

    it('THROWS if packageName is missing', () => {
      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          packageName: ''
        });
      }).toThrow(/must define a packageName/);
    });

    it('THROWS if ruleDescriptions is missing or does not cover declared rules', () => {
      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          ruleDescriptions: {} as unknown as Record<SampleRuleId, string>
        });
      }).toThrow(/must define mandatory 'ruleDescriptions'/);

      expect(() => {
        new TestSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          ruleDescriptions: {
            'sample-rule-a': 'Solo la primera'
          } as unknown as Record<SampleRuleId, string>
        });
      }).toThrow(/missing a rule description.*'sample-rule-b'/);
    });
  });

  describe('FileScanAuditor contract enforcement', () => {
    it('enforces the exact same mandatory metadata in FileScanAuditor subclasses', () => {
      expect(() => {
        new TestFileScanSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          configKey: ''
        });
      }).toThrow(/must define a mandatory 'configKey'/);

      expect(() => {
        new TestFileScanSubAuditor({
          ...CANONICAL_VALID_OPTIONS,
          defaultConfig: undefined as unknown as Record<string, unknown>
        });
      }).toThrow(/must define a mandatory 'defaultConfig'/);
    });
  });

  describe('Auditor Manifest Introspection & DTO Contract', () => {
    it('exposes configKey and defaultConfig cleanly in toManifest()', () => {
      const auditor = new TestSubAuditor(CANONICAL_VALID_OPTIONS);
      const manifest = auditor.toManifest();

      expect(manifest.id).toBe('validate_contract_probe');
      expect(manifest.configKey).toBe('contractProbe.enabled');
      expect(manifest.defaultConfig).toEqual({ enabled: true, mode: 'strict' });
      expect(manifest.rules['sample-rule-a']).toBe('Primera regla obligatoria');
    });
  });

  describe('Dynamic Configuration Generation (auditor fix)', () => {
    it('dynamically collects defaultConfig from discovered tasks with zero hardcoding', () => {
      const mockTasks: AuditTaskDefinition[] = [
        {
          id: 'validate_secret_leaks',
          name: 'Secret Leaks',
          family: 'architecture',
          scriptPath: 'src/suites/architecture/validate_secret_leaks.ts',
          command: 'node',
          args: [],
          configKey: 'secretLeaks.enabled',
          defaultConfig: { enabled: true, maskSecrets: true }
        },
        {
          id: 'validate_custom_user_extension',
          name: 'Custom User Extension',
          family: 'domain_data',
          scriptPath: 'scripts/auditors/validate_custom.ts',
          command: 'node',
          args: [],
          configKey: 'customExtension.enabled',
          defaultConfig: { enabled: true, maxRetries: 5 }
        }
      ];

      const configContent = createDefaultAuditConfigContent('TestApp', mockTasks);

      // Verifies that both built-in and user extension configs are dynamically embedded
      expect(configContent).toContain("name: 'TestApp'");
      expect(configContent).toContain('secretLeaks: {\n    "enabled": true,\n    "maskSecrets": true\n  }');
      expect(configContent).toContain('customExtension: {\n    "enabled": true,\n    "maxRetries": 5\n  }');
    });
  });

  describe('Universal Dynamic Gating (suiteGating)', () => {
    it('dynamically gates any suite from its configKey without requiring manual registry entries', () => {
      const config = {
        name: 'test',
        paths: { srcRoots: ['src'], testRoots: ['tests'] }
      } as unknown as AuditConfig;

      // Unconfigured or default: enabled
      const statusActive = evaluateSuiteStatus('validate_unregistered_extension', config, 'unregisteredSubsystem.enabled');
      expect(statusActive.enabled).toBe(true);

      // Explicitly disabled in config
      const configDisabled = {
        ...config,
        unregisteredSubsystem: { enabled: false }
      } as unknown as AuditConfig;

      const statusDisabled = evaluateSuiteStatus('validate_unregistered_extension', configDisabled, 'unregisteredSubsystem.enabled');
      expect(statusDisabled.enabled).toBe(false);
      expect(statusDisabled.reason).toContain('unregisteredSubsystem.enabled = false');
      expect(statusDisabled.configKey).toBe('unregisteredSubsystem.enabled');
    });
  });
});
