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
    expect(manifest.description).toBe('Validates auditor configuration in .auditor/');
    expect(manifest.description.length).toBeLessThanOrEqual(60);
    expect(manifest.description).not.toContain('\n');

    expect(manifest.capabilities.fix).toBe('priority');
    expect(manifest.capabilities.speed).toBe('light');
    expect(manifest.capabilities.phase).toBe('setup');

    expect(manifest.configKey).toBe('paths');

    expect(manifest.rules['audit-config-missing-path']).toBe('Configured path does not exist');
    expect(manifest.rules['audit-config-missing-section']).toBe('Missing section in audit.config');
    expect(manifest.rules['audit-config-missing-file']).toBe('Configured file does not exist');
    expect(manifest.rules['audit-config-invalid-extension']).toBe(
      'Configured extension does not exist'
    );
    expect(manifest.rules['audit-config-missing-gitignore-entry']).toBe(
      'Missing entry in .gitignore'
    );
    expect(manifest.rules['audit-config-unknown-field']).toBe('Unrecognized field in config');
    expect(manifest.rules['audit-config-critical-violation']).toBe(
      'Critical configuration violation'
    );
    expect(manifest.rules['audit-config-unacknowledged-degradation']).toBe(
      'Undocumented coverage degradation'
    );
    expect(manifest.rules['audit-config-ratchet-relaxation']).toBe(
      'Unauthorized rule relaxation (ratchet)'
    );
    expect(Object.keys(manifest.rules).length).toBe(9);
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
          ruleFixers: {},
          ruleIds: ['test-rule'],
          packageName: 'Test',
          ruleCapabilities: {
            'test-rule': {
              speed: 'light',
              phase: 'normal',
              md: false,
              ast: false,
              changedOnly: false,
              critical: false
            }
          },
          configKey: 'paths',
          defaultConfig: {},
          requiredPermissions: [],
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
