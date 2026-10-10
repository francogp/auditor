/**
 * packages/auditor/tests/plugin_protocol.test.ts
 *
 * Unit tests for Auditor Extension & Plugin Protocol.
 */

import { describe, it, expect } from 'vitest';
import { defineAuditConfig, DEFAULT_AUDIT_CONFIG } from '../src/core/auditConfig.ts';
import { defineAuditorExtension } from '../src/plugin/defineAuditorExtension.ts';
import { BaseAuditor } from '../src/core/auditorBase.ts';

describe('Auditor Plugin Protocol', () => {
  it('defines and merges audit configuration with defaults', () => {
    const config = defineAuditConfig({
      name: 'Custom Project',
      paths: {
        migrationsDir: 'custom/migrations',
      },
      persistence: {
        engine: 'sqlite',
        schemaQualified: false,
      },
      extensions: ['./custom/extension.ts']
    });

    expect(config.name).toBe('Custom Project');
    expect(config.paths.migrationsDir).toBe('custom/migrations');
    expect(config.paths.srcRoots).toEqual(DEFAULT_AUDIT_CONFIG.paths.srcRoots);
    expect(config.persistence.engine).toBe('sqlite');
    expect(config.persistence.schemaQualified).toBe(false);
    expect(config.extensions).toContain('./custom/extension.ts');
  });

  it('defines an auditor extension conforming to definition contract', () => {
    class DummyAuditor extends BaseAuditor<'dummy-rule'> {
      constructor() {
        super({
          id: 'validate_dummy',
          name: 'Dummy Validator',
          description: 'Validador de prueba para extensiones',
          family: 'domain_data',
          packageName: 'Dummy',
          icon: '🧩',
          configKey: 'domain.enabled',
          defaultConfig: { enabled: true },
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
          ruleIds: ['dummy-rule'],
          ruleDescriptions: {
            'dummy-rule': 'Regla de prueba de extensión'
          }
        });
      }

      public override async runAudit(): Promise<void> {
        this.context.setMetric('Dummy', 1);
      }
    }

    const extension = defineAuditorExtension({
      id: 'validate_dummy',
      name: 'Dummy Validator',
      family: 'domain_data',
      auditorClass: DummyAuditor,
      fast: true
    });

    expect(extension.id).toBe('validate_dummy');
    expect(extension.family).toBe('domain_data');
    expect(extension.fast).toBe(true);
    expect(extension.auditorClass).toBe(DummyAuditor);
  });

  it('fails loudly when an extension attempts to emit an unregistered rule', () => {
    class DummyAuditor extends BaseAuditor<'registered-rule'> {
      constructor() {
        super({
          id: 'validate_dummy_guard',
          name: 'Dummy Guard Validator',
          description: 'Valida guard de reglas no registradas',
          family: 'domain_data',
          packageName: 'Dummy',
          icon: '🛡️',
          configKey: 'domain.enabled',
          defaultConfig: { enabled: true },
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
          ruleIds: ['registered-rule'],
          coverage: {
            include: ['src/**/*.ts']
          },
          ruleDescriptions: {
            'registered-rule': 'Regla registrada oficial'
          }
        });
      }
      public override async runAudit(): Promise<void> {}
    }

    const auditor = new DummyAuditor();
    expect(() => {
      auditor.addViolation({
        ruleId: 'unregistered-rule' as unknown as 'registered-rule',
        message: 'Violación no declarada',
        severity: 'error'
      });
    }).toThrow(/is NOT registered in 'ruleDescriptions'/);
  });

  it('supports extension with custom sub-auditors and executes cleanly', async () => {
    type MultiRule = 'step-one' | 'step-two';
    class CompositeExtAuditor extends BaseAuditor<MultiRule> {
      constructor() {
        super({
          id: 'validate_composite_ext',
          name: 'Composite Extension Validator',
          description: 'Extensión compuesta con sub-auditores',
          family: 'domain_data',
          packageName: 'ExtComp',
          icon: '📦',
          configKey: 'domain.enabled',
          defaultConfig: { enabled: true },
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
          ruleIds: ['step-one', 'step-two'],
          coverage: {
            include: ['src/**/*.ts']
          },
          ruleDescriptions: {
            'step-one': 'Sub-auditor paso 1',
            'step-two': 'Sub-auditor paso 2'
          }
        });
      }

      public override async runAudit(): Promise<void> {
        this.markRuleEvaluated('step-one');
        this.markRuleEvaluated('step-two');
      }
    }

    const auditor = new CompositeExtAuditor();
    const result = await auditor.execute();

    expect(result.status).toBe('passed');
    expect(result.summary.errors).toBe(0);
    expect(result.subAuditors?.length).toBe(2);
    expect(result.subAuditors?.[0]?.name).toBe('ExtComp: Sub-auditor paso 1');
    expect(result.subAuditors?.[1]?.name).toBe('ExtComp: Sub-auditor paso 2');
  });

  it('throws an error if auditor extension does not define an id', () => {
    expect(() => {
      defineAuditorExtension({
        id: '',
        name: 'No Id',
        family: 'domain_data'
      } as unknown as Parameters<typeof defineAuditorExtension>[0]);
    }).toThrow('Auditor extension must define an id');
  });

  it('throws an error if auditor extension has neither auditorClass, factory nor scripts', () => {
    expect(() => {
      defineAuditorExtension({
        id: 'no_execution_contract',
        name: 'No Execution Contract',
        family: 'domain_data'
      });
    }).toThrow(/must define a mandatory 'scripts' contract/);
  });

  it('registers package scripts when extension defines scripts contract', () => {
    const extWithScripts = defineAuditorExtension({
      id: 'ext_with_scripts',
      name: 'Ext With Scripts',
      family: 'architecture',
      scripts: [
        {
          name: 'auditor:ext-custom',
          command: 'node --experimental-strip-types scripts/custom.ts',
          description: 'Custom extension runner',
          category: 'other'
        }
      ]
    });

    expect(extWithScripts.scripts).toHaveLength(1);
    expect(extWithScripts.scripts?.[0]?.name).toBe('auditor:ext-custom');
  });

  it('accepts extension with factory function without scripts', () => {
    const extWithFactory = defineAuditorExtension({
      id: 'ext_with_factory',
      name: 'Ext With Factory',
      family: 'persistence',
      factory: () => ({} as unknown as BaseAuditor<string>)
    });

    expect(extWithFactory.id).toBe('ext_with_factory');
    expect(typeof extWithFactory.factory).toBe('function');
  });
});

