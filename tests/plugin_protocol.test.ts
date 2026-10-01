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
});
