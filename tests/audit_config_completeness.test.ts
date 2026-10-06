/**
 * packages/auditor/tests/audit_config_completeness.test.ts
 *
 * Unit tests for Active by Default Subsystem Mandate & Zero Silent Skips.
 * Validates that all subsystems default to active and omitting declarations is valid.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  defineAuditConfig,
  assertAuditConfigComplete,
  DEFAULT_MAX_AUDIT_STALENESS_MINUTES,
  serializeAuditConfigToEnv,
  getAuditConfig,
  setAuditConfig,
  resetAuditConfig
} from '../src/core/auditConfig.ts';

describe('Audit Configuration Completeness & Mandato de Configuración Activa por Defecto', () => {
  it('succeeds and activates all subsystems by default when an empty config is provided ("si no dice nada")', () => {
    const config = defineAuditConfig({
      name: 'Empty Config Project'
    });

    expect(() => assertAuditConfigComplete(config)).not.toThrow();
    expect(config.persistence.engine).toBe('supabase');
    expect(config.bundle?.enabled).toBe(true);
    expect(config.styles?.zLayersEnabled).toBe(true);
    expect(config.templates?.requireInputIds).toBe(true);
    expect(config.agentPlugin?.enabled).toBe(true);
    expect(config.packageHygiene?.enabled).toBe(true);
    expect(config.packageDistribution?.enabled).toBe(false);
    expect(config.packageScripts?.enabled).toBe(true);
    expect(config.accessibility?.enabled).toBe(true);
    expect(config.typeCoverage?.enabled).toBe(true);
    expect(config.gitIgnore?.enabled).toBe(true);
    expect(config.domain.enabled).toBe(true);
    expect(config.fallow?.enabled).toBe(true);
    expect(config.fallow?.security?.enabled).toBe(true);
    expect(config.fallow?.enforceTargets).toBe(true);
    expect(config.fallow?.maxTargetPriority).toBe('critical');
    expect(config.fallow?.similarCode?.enabled).toBe(true);
    expect(config.fallow?.flags?.enabled).toBe(true);
    expect(config.fallow?.flags?.trackRetirement).toBe(true);
    expect(config.fallow?.coverage?.enabled).toBe(true);
    expect(config.eslint?.enabled).toBe(true);
    expect(config.stylelint?.enabled).toBe(true);
    expect(config.version?.enabled).toBe(true);
    expect(config.version?.autoSyncPublicVersionJson).toBe(true);
  });

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
      },
      packageDistribution: {
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
      packageDistribution: {
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

  it('throws an informative error when persistence engine is invalid', () => {
    const config = defineAuditConfig({
      name: 'Invalid Persistence Project',
      persistence: { engine: 'invalid-db' as any }
    });

    expect(() => assertAuditConfigComplete(config)).toThrowError(/persistence/i);
  });

  it('throws an informative error when bundle.enabled is not a boolean', () => {
    const config = defineAuditConfig({
      name: 'Invalid Bundle Project',
      bundle: { enabled: 'not-a-bool' as any }
    });

    expect(() => assertAuditConfigComplete(config)).toThrowError(/bundle/i);
  });

  it('throws an informative error when packageDistribution.level is invalid', () => {
    const config = defineAuditConfig({
      name: 'Invalid Package Distribution Project',
      packageDistribution: { enabled: true, level: 'super-critical' as any }
    });

    expect(() => assertAuditConfigComplete(config)).toThrowError(/packageDistribution/i);
  });

  it('throws an informative error when styles.zLayersEnabled is not a boolean', () => {
    const config = defineAuditConfig({
      name: 'Invalid Styles Project',
      styles: { zLayersEnabled: 'not-a-bool' as any }
    });

    expect(() => assertAuditConfigComplete(config)).toThrowError(/styles/i);
  });

  it('throws an informative error when templates.requireInputIds is not a boolean', () => {
    const config = defineAuditConfig({
      name: 'Invalid Templates Project',
      templates: { requireInputIds: 'not-a-bool' as any }
    });

    expect(() => assertAuditConfigComplete(config)).toThrowError(/templates/i);
  });

  it('throws an informative error when agentPlugin.enabled is not a boolean', () => {
    const config = defineAuditConfig({
      name: 'Invalid Agent Plugin Project',
      agentPlugin: { enabled: 'not-a-bool' as any }
    });

    expect(() => assertAuditConfigComplete(config)).toThrowError(/agentPlugin/i);
  });

  it('aggregates multiple invalid subsystem configurations into a single diagnostic message', () => {
    const config = defineAuditConfig({
      name: 'Multiple Invalid Project',
      persistence: { engine: 'invalid-db' as any },
      bundle: { enabled: 'not-a-bool' as any },
      packageDistribution: { enabled: true, level: 'invalid-level' as any },
      styles: { zLayersEnabled: 'not-a-bool' as any },
      templates: { requireInputIds: 'not-a-bool' as any },
      agentPlugin: { enabled: 'not-a-bool' as any }
    });

    try {
      assertAuditConfigComplete(config);
      expect.unreachable('Should have thrown an error');
    } catch (err: unknown) {
      const msg = (err as Error).message;
      expect(msg).toContain('persistence');
      expect(msg).toContain('bundle');
      expect(msg).toContain('packageDistribution');
      expect(msg).toContain('styles');
      expect(msg).toContain('templates');
      expect(msg).toContain('agentPlugin');
      expect(msg).toContain('Mandato de Configuración Activa por Defecto');
    }
  });

  it('properly preserves and merges new de-hardcoded configuration options', () => {
    const config = defineAuditConfig({
      name: 'Advanced Custom Config Project',
      paths: {
        testFragmentationWhitelist: ['src/large-feature.ts'],
        cliRoots: ['src/cli', 'src/tools']
      },
      templates: {
        requireInputIds: true,
        safeTemplateFunctions: ['formatMoney', 'customTranslate']
      },
      styles: {
        zLayersEnabled: true,
        baseScssFile: 'src/custom-styles/_base.scss'
      },
      bundle: {
        enabled: true,
        forbiddenUiImports: [{ module: 'heavy-lib', reason: 'Too heavy for frontend' }]
      },
      animation: {
        customTimerFunctions: ['scheduleFrame', 'rafWait']
      },
      constants: {
        ignoredNames: ['MY_MAGIC_FLAG'],
        exemptMagicNumbers: [42, 100]
      },
      documentation: {
        knownValidAbstractPaths: ['@docs/special-path']
      },
      pinia: {
        authorizedMutationFiles: ['src/stores/specialStore.ts']
      },
      persistence: {
        engine: 'sqlite'
      },
      agentPlugin: {
        enabled: false
      },
      fallow: {
        enabled: true,
        enforceTargets: true,
        maxTargetPriority: 'high',
        similarCode: {
          enabled: true,
          threshold: 0.92,
          ignoreSameFile: true,
          minLines: 5
        }
      }
    });

    expect(config.paths.testFragmentationWhitelist).toEqual(['src/large-feature.ts']);
    expect(config.paths.cliRoots).toEqual(['src/cli', 'src/tools']);
    expect(config.templates?.safeTemplateFunctions).toEqual(['formatMoney', 'customTranslate']);
    expect(config.styles?.baseScssFile).toBe('src/custom-styles/_base.scss');
    expect(config.bundle?.forbiddenUiImports).toEqual([{ module: 'heavy-lib', reason: 'Too heavy for frontend' }]);
    expect(config.animation?.customTimerFunctions).toEqual(['scheduleFrame', 'rafWait']);
    expect(config.constants?.ignoredNames).toEqual(['MY_MAGIC_FLAG']);
    expect(config.constants?.exemptMagicNumbers).toEqual([42, 100]);
    expect(config.documentation?.knownValidAbstractPaths).toEqual(['@docs/special-path']);
    expect(config.pinia?.authorizedMutationFiles).toEqual(['src/stores/specialStore.ts']);
    expect(config.fallow?.enforceTargets).toBe(true);
    expect(config.fallow?.maxTargetPriority).toBe('high');
    expect(config.fallow?.similarCode?.threshold).toBe(0.92);
    expect(config.fallow?.similarCode?.minLines).toBe(5);
  });

  it('correctly maps runner.maxStalenessMinutes with fallback to DEFAULT_MAX_AUDIT_STALENESS_MINUTES', () => {
    const defaultConfig = defineAuditConfig({
      name: 'Default Runner Config'
    });
    expect(defaultConfig.runner?.maxStalenessMinutes).toBe(DEFAULT_MAX_AUDIT_STALENESS_MINUTES);

    const customStalenessMinutes = 15;
    const customConfig = defineAuditConfig({
      name: 'Custom Runner Config',
      runner: {
        maxStalenessMinutes: customStalenessMinutes
      }
    });
    expect(customConfig.runner?.maxStalenessMinutes).toBe(customStalenessMinutes);
  });

  describe('Parent-to-Worker Configuration Inheritance', () => {
    it('serializes custom configuration to environment variables and restores it in child process context', () => {
      // Clean starting state
      resetAuditConfig();

      const customConfig = defineAuditConfig({
        name: 'Worker Inheritance Project',
        templates: {
          requireInputIds: false
        },
        packageHygiene: {
          enabled: true,
          ignoreDependencies: ['custom-transitive-dep']
        },
        paths: {
          ignoreGlobs: ['custom/glob/**']
        }
      });

      // Orchestrator serializes active config
      serializeAuditConfigToEnv(customConfig);

      // Verify serialization populated environment variables
      expect(process.env.AUDIT_CONFIG_DATA || process.env.AUDIT_ACTIVE_CONFIG_FILE).toBeDefined();

      // Reset in-memory cache to simulate fresh child worker process
      // We manually clear cached in-memory reference while preserving process.env
      const envData = process.env.AUDIT_CONFIG_DATA;
      const envFile = process.env.AUDIT_ACTIVE_CONFIG_FILE;
      const envRoot = process.env.AUDIT_ACTIVE_CONFIG_ROOT;
      resetAuditConfig();
      if (envData) process.env.AUDIT_CONFIG_DATA = envData;
      if (envRoot) process.env.AUDIT_ACTIVE_CONFIG_ROOT = envRoot;
      if (envData && envFile) {
        fs.writeFileSync(envFile, envData, 'utf-8');
        process.env.AUDIT_ACTIVE_CONFIG_FILE = envFile;
      }

      // Child worker calls getAuditConfig()
      const restored = getAuditConfig();

      expect(restored.name).toBe('Worker Inheritance Project');
      expect(restored.templates?.requireInputIds).toBe(false);
      expect(restored.packageHygiene?.ignoreDependencies).toContain('custom-transitive-dep');
      expect(restored.paths.ignoreGlobs).toContain('custom/glob/**');

      // Clean up after test
      resetAuditConfig();
    });

    it('resetAuditConfig completely purges in-memory cache and environment variables', () => {
      setAuditConfig(defineAuditConfig({ name: 'Temp Env Project' }));
      expect(process.env.AUDIT_CONFIG_DATA || process.env.AUDIT_ACTIVE_CONFIG_FILE).toBeDefined();

      resetAuditConfig();
      expect(process.env.AUDIT_CONFIG_DATA).toBeUndefined();
      expect(process.env.AUDIT_ACTIVE_CONFIG_FILE).toBeUndefined();
    });
  });
});

