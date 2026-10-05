import { describe, it, expect } from 'vitest';
import { ValidateAuditConfigAuditor } from '../src/suites/architecture/validate_audit_config.ts';
import { BaseAuditor } from '../src/core/auditorBase.ts';
import type { AuditorManifestDTO } from '../src/core/auditContract.ts';

// test-fragmentation-ok: Isolated manifest DTO test suite below 60 line threshold
describe('Auditor Manifest & Introspection Registry', () => {
  it('generates a compliant AuditorManifestDTO via toManifest()', () => {
    const auditor = new ValidateAuditConfigAuditor();
    const manifest: AuditorManifestDTO = auditor.toManifest();

    expect(manifest.id).toBe('validate_audit_config');
    expect(manifest.name).toBe('Audit Configuration Integrity Validator');
    expect(manifest.family).toBe('architecture');
    expect(manifest.icon).toBe('⚙️');
    expect(manifest.description).toBe('Valida configuración del auditor en .auditor/');
    expect(manifest.description.length).toBeLessThanOrEqual(60);
    expect(manifest.description).not.toContain('\n');

    expect(manifest.capabilities.fix).toBe(true);
    expect(manifest.capabilities.lint).toBe(true);

    expect(manifest.configKey).toBe('paths');

    expect(manifest.rules['audit-config-missing-path']).toBe('Ruta configurada no existe');
    expect(Object.keys(manifest.rules).length).toBe(9);
  });

  it('rejects descriptions exceeding 60 characters or containing newlines in BaseAuditor', () => {
    class InvalidDescAuditor extends BaseAuditor<'test-rule'> {
      constructor() {
        super({
          id: 'validate_invalid_desc',
          name: 'Invalid Description Auditor',
          description: 'Esta es una descripción deliberadamente larguísima que excede los sesenta caracteres reglamentarios',
          icon: '⚠️',
          family: 'architecture',
          ruleIds: ['test-rule'],
          packageName: 'Test',
          ruleDescriptions: {
            'test-rule': 'Regla de prueba'
          }
        });
      }
      public override async runAudit(): Promise<void> {}
    }

    expect(() => new InvalidDescAuditor()).toThrowError(/exceeds 60 characters/i);
  });
});
