import { describe, it, expect } from 'vite-plus/test';

import type { AuditorManifestDTO } from '../src/core/auditContract.ts';
import { BaseAuditor } from '../src/core/auditorBase.ts';
import { ValidateAuditConfigAuditor } from '../src/suites/architecture/validate_audit_config.ts';

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

    expect(manifest.capabilities.fix).toBe('priority');
    expect(manifest.capabilities.speed).toBe('light');
    expect(manifest.capabilities.phase).toBe('setup');

    expect(manifest.configKey).toBe('paths');

    expect(manifest.rules['audit-config-missing-path']).toBe('Ruta configurada no existe');
    expect(manifest.rules['audit-config-missing-section']).toBe('Falta sección en audit.config');
    expect(manifest.rules['audit-config-missing-file']).toBe('Archivo configurado no existe');
    expect(manifest.rules['audit-config-invalid-extension']).toBe(
      'Extensión configurada no existe'
    );
    expect(manifest.rules['audit-config-missing-gitignore-entry']).toBe(
      'Falta entrada en .gitignore'
    );
    expect(manifest.rules['audit-config-unknown-field']).toBe('Campo no reconocido en config');
    expect(manifest.rules['audit-config-critical-violation']).toBe(
      'Violación a configuración crítica'
    );
    expect(manifest.rules['audit-config-unacknowledged-degradation']).toBe(
      'Degradación de cobertura no documentada'
    );
    expect(Object.keys(manifest.rules).length).toBe(8);
  });

  it('rejects descriptions exceeding 60 characters or containing newlines in BaseAuditor', () => {
    class InvalidDescAuditor extends BaseAuditor<'test-rule'> {
      constructor() {
        super({
          id: 'validate_invalid_desc',
          name: 'Invalid Description Auditor',
          description:
            'Esta es una descripción deliberadamente larguísima que excede los sesenta caracteres reglamentarios',
          icon: '⚠️',
          family: 'architecture',
          ruleIds: ['test-rule'],
          packageName: 'Test',
          ruleCapabilities: {
            'test-rule': {
              speed: 'light',
              phase: 'normal',
              fix: 'none',
              md: false,
              ast: false,
              changedOnly: false,
              critical: false
            }
          },
          configKey: 'paths',
          defaultConfig: {},
          criticalConfig: {},
          usesThirdPartyTool: false,
          ruleDescriptions: {
            'test-rule': 'Regla de prueba'
          },
          ruleRemediations: {
            'test-rule': 'Remediacion para test-rule'
          }
        });
      }
      public override async runAudit(): Promise<void> {}
    }

    expect(() => new InvalidDescAuditor()).toThrowError(/exceeds 60 characters/i);
  });
});
