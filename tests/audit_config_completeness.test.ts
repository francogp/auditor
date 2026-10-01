/**
 * packages/auditor/tests/audit_config_completeness.test.ts
 *
 * Unit tests for Mandatory Explicit Configuration & Zero Silent Skips Mandate.
 * Validates assertAuditConfigComplete enforces all subsystems are declared.
 */

import { describe, it, expect } from 'vitest';
import {
  defineAuditConfig,
  assertAuditConfigComplete
} from '../src/core/auditConfig.ts';

describe('Audit Configuration Completeness & Mandato de Configuración Explícita', () => {
  it('succeeds when all subsystems are explicitly declared as active', () => {
    const config = defineAuditConfig({
      name: 'Full Active Project',
      persistence: {
        engine: 'supabase',
        schemaQualified: true
      },
      bundle: {
        enabled: true,
        distDir: 'dist/assets'
      },
      styles: {
        zLayersEnabled: true,
        zLayersScssFile: 'src/styles/_base.scss'
      },
      templates: {
        requireInputIds: true
      },
      agentPlugin: {
        enabled: true
      }
    });

    expect(() => assertAuditConfigComplete(config)).not.toThrow();
  });

  it('succeeds when all subsystems are explicitly declared as disabled or none', () => {
    const config = defineAuditConfig({
      name: 'CLI Tool Project (Subsystems Disabled)',
      persistence: {
        engine: 'none'
      },
      bundle: {
        enabled: false
      },
      styles: {
        zLayersEnabled: false
      },
      templates: {
        requireInputIds: false
      },
      agentPlugin: {
        enabled: false
      }
    });

    expect(() => assertAuditConfigComplete(config)).not.toThrow();
  });

  it('throws an informative error when persistence subsystem is omitted', () => {
    const config = defineAuditConfig({
      name: 'Missing Persistence Project',
      bundle: { enabled: false },
      styles: { zLayersEnabled: false },
      templates: { requireInputIds: false },
      agentPlugin: { enabled: false }
    });

    expect(() => assertAuditConfigComplete(config)).toThrowError(/persistence/i);
  });

  it('throws an informative error when bundle subsystem is omitted', () => {
    const config = defineAuditConfig({
      name: 'Missing Bundle Project',
      persistence: { engine: 'sqlite' },
      styles: { zLayersEnabled: false },
      templates: { requireInputIds: false },
      agentPlugin: { enabled: false }
    });

    expect(() => assertAuditConfigComplete(config)).toThrowError(/bundle/i);
  });

  it('throws an informative error when styles subsystem is omitted', () => {
    const config = defineAuditConfig({
      name: 'Missing Styles Project',
      persistence: { engine: 'sqlite' },
      bundle: { enabled: false },
      templates: { requireInputIds: false },
      agentPlugin: { enabled: false }
    });

    expect(() => assertAuditConfigComplete(config)).toThrowError(/styles/i);
  });

  it('throws an informative error when templates subsystem is omitted', () => {
    const config = defineAuditConfig({
      name: 'Missing Templates Project',
      persistence: { engine: 'sqlite' },
      bundle: { enabled: false },
      styles: { zLayersEnabled: false },
      agentPlugin: { enabled: false }
    });

    expect(() => assertAuditConfigComplete(config)).toThrowError(/templates/i);
  });

  it('throws an informative error when agentPlugin subsystem is omitted', () => {
    const config = defineAuditConfig({
      name: 'Missing Agent Plugin Project',
      persistence: { engine: 'sqlite' },
      bundle: { enabled: false },
      styles: { zLayersEnabled: false },
      templates: { requireInputIds: false }
    });

    expect(() => assertAuditConfigComplete(config)).toThrowError(/agentPlugin/i);
  });

  it('aggregates all missing subsystems into a single comprehensive diagnostic message', () => {
    const config = defineAuditConfig({
      name: 'Empty Config Project'
    });

    try {
      assertAuditConfigComplete(config);
      expect.unreachable('Should have thrown an error');
    } catch (err: unknown) {
      const msg = (err as Error).message;
      expect(msg).toContain('persistence');
      expect(msg).toContain('bundle');
      expect(msg).toContain('styles');
      expect(msg).toContain('templates');
      expect(msg).toContain('agentPlugin');
      expect(msg).toContain('Mandato de Configuración Explícita');
    }
  });
});
