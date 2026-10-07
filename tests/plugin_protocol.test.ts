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
          capabilities: {
            fix: false,
            ast: false,
            changedSince: false,
            heavy: false,
            requiresBuild: false
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
});

