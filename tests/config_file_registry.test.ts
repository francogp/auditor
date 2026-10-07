/**
 * tests/config_file_registry.test.ts
 *
 * Unit tests for Unified Configuration File Registry & BaseAuditor Integration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ConfigFileRegistry } from '../src/core/configFileRegistry.ts';
import { BaseAuditor } from '../src/core/auditorBase.ts';
import { defineAuditorExtension } from '../src/plugin/defineAuditorExtension.ts';
import type { AuditorConfigFileRequirement } from '../src/core/auditContract.ts';

describe('ConfigFileRegistry & Unified Config Protocol', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    ConfigFileRegistry.reset();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-file-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    ConfigFileRegistry.reset();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('registers and retrieves requirements idempotently', () => {
    const req1: AuditorConfigFileRequirement = {
      id: 'test-tool-config',
      file: 'tool.config.json',
      description: 'Configuración para herramienta de pruebas',
      generateDefaultContent: () => '{\n  "enabled": true\n}\n'
    };

    const req2: AuditorConfigFileRequirement = {
      id: 'another-tool-config',
      file: 'another.config.ts',
      description: 'Configuración secundaria',
      generateDefaultContent: () => 'export default {};\n'
    };

    ConfigFileRegistry.register(req1);
    expect(ConfigFileRegistry.get('test-tool-config')).toEqual(req1);
    expect(ConfigFileRegistry.get('unknown')).toBeUndefined();

    ConfigFileRegistry.registerMany([req2]);
    const all = ConfigFileRegistry.getAll();
    expect(all.length).toBe(2);
    expect(all.map(r => r.id)).toContain('test-tool-config');
    expect(all.map(r => r.id)).toContain('another-tool-config');

    // Re-registration overwrites cleanly
    const updatedReq1: AuditorConfigFileRequirement = {
      ...req1,
      description: 'Descripción actualizada'
    };
    ConfigFileRegistry.register(updatedReq1);
    expect(ConfigFileRegistry.get('test-tool-config')?.description).toBe('Descripción actualizada');
    expect(ConfigFileRegistry.getAll().length).toBe(2);

    ConfigFileRegistry.reset();
    expect(ConfigFileRegistry.getAll().length).toBe(0);
  });

  type CustomRuleId = 'custom-config-missing' | 'custom-content-valid';

  class CustomToolAuditor extends BaseAuditor<CustomRuleId> {
    constructor(options: { projectRoot?: string; fix?: boolean; candidate?: boolean } = {}) {
      const requirement: AuditorConfigFileRequirement<CustomRuleId> = {
        id: 'custom-tool-config',
        file: 'custom.config.json',
        candidateFiles: options.candidate ? ['custom.config.json', 'custom.config.js'] : undefined,
        description: 'Archivo de configuración de custom tool',
        ruleId: 'custom-config-missing',
        customMissingMessage: (_ctx, file) => `Falta configuración requerida en ${file}.`,
        generateDefaultContent: (ctx) => `{\n  "name": "${ctx.packageName}",\n  "ok": true\n}\n`
      };

      super({
        id: 'validate_custom_tool',
        name: 'Custom Tool Config Validator',
        description: 'Valida presencia y formato de custom.config.json',
        family: 'architecture',
        packageName: 'CustomTool',
        icon: '🔧',
        configKey: 'paths',
        defaultConfig: {},
        ruleIds: ['custom-config-missing', 'custom-content-valid'],
        ruleDescriptions: {
          'custom-config-missing': 'Configuración ausente',
          'custom-content-valid': 'Contenido válido'
        },
        configFiles: [requirement],
        fix: options.fix,
        coverage: {
          include: ['custom.config.json', 'custom.config.js']
        },
        projectRoot: options.projectRoot ?? process.cwd()
      });
    }

    public override async runAudit(): Promise<void> {
      const requirement = this.configFiles[0];
      if (!requirement) return;

      const ensured = await this.ensureConfigFile(requirement);
      if (!ensured) {
        return;
      }

      this.markRuleEvaluated('custom-content-valid');
      this.recordScanned(path.relative(this.projectRoot, ensured.resolvedPath).replace(/\\/g, '/'));
    }
  }

  it('reports an error when config file is missing in check mode', async () => {
    const auditor = new CustomToolAuditor({ projectRoot: tempDir, fix: false });
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    expect(result.summary.errors).toBe(1);
    const finding = result.findings.find(f => f.ruleId === 'custom-config-missing');
    expect(finding).toBeDefined();
    expect(finding?.message).toContain('Falta configuración requerida en custom.config.json.');
    expect(finding?.context).toBe('custom.config.json');
  });

  it('scaffolds default config file when missing in fix mode and completes clean path', async () => {
    const configPath = path.join(tempDir, 'custom.config.json');
    expect(await fs.access(configPath).then(() => true).catch(() => false)).toBe(false);

    const auditor = new CustomToolAuditor({ projectRoot: tempDir, fix: true });
    const result = await auditor.execute();

    // Clean path verification
    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');

    // Verifies physical creation and content
    expect(await fs.access(configPath).then(() => true).catch(() => false)).toBe(true);
    const createdContent = await fs.readFile(configPath, 'utf-8');
    expect(createdContent).toContain('"ok": true');
    expect(createdContent).toContain('"name": "CustomTool"');
  });

  it('resolves existing candidate file and executes clean path', async () => {
    const candidatePath = path.join(tempDir, 'custom.config.js');
    await fs.writeFile(candidatePath, 'module.exports = { ok: true };\n', 'utf-8');

    const auditor = new CustomToolAuditor({ projectRoot: tempDir, fix: false, candidate: true });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
    expect(result.findings.length).toBe(0);
  });

  it('skips non-applicable config files gracefully without emitting violations', async () => {
    type NonAppRule = 'optional-config-missing';
    class OptionalConfigAuditor extends BaseAuditor<NonAppRule> {
      constructor(projectRoot: string) {
        const optionalReq: AuditorConfigFileRequirement<NonAppRule> = {
          id: 'optional-config',
          file: 'optional.config.json',
          description: 'Configuración opcional condicional',
          ruleId: 'optional-config-missing',
          isApplicable: () => false,
          generateDefaultContent: () => '{}'
        };

        super({
          id: 'validate_optional_config',
          name: 'Optional Config Validator',
          description: 'Validador con configuración condicional',
          family: 'architecture',
          packageName: 'OptConfig',
          icon: '⚙️',
          configKey: 'paths',
          defaultConfig: {},
          ruleDescriptions: {
            'optional-config-missing': 'Configuración condicional ausente'
          },
          configFiles: [optionalReq],
          coverage: {
            include: ['optional.config.json']
          },
          projectRoot
        });
      }

      public override async runAudit(): Promise<void> {
        await this.verifyAndFixConfigFiles();
      }
    }

    const auditor = new OptionalConfigAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('integrates with defineAuditorExtension and registers config requirements', async () => {
    const extRequirement: AuditorConfigFileRequirement = {
      id: 'ext-custom-config',
      file: 'ext.config.json',
      description: 'Configuración de extensión personalizada',
      generateDefaultContent: () => '{\n  "version": 1\n}\n'
    };

    const extension = defineAuditorExtension({
      id: 'validate_ext_config',
      name: 'Extension Config Validator',
      family: 'architecture',
      auditorClass: CustomToolAuditor,
      configFiles: [extRequirement]
    });

    expect(extension.configFiles).toBeDefined();
    expect(extension.configFiles?.length).toBe(1);
    expect(extension.configFiles?.[0]?.id).toBe('ext-custom-config');

    // Create file so the auditor runs cleanly
    const configPath = path.join(tempDir, 'custom.config.json');
    await fs.writeFile(configPath, '{\n  "ok": true\n}\n', 'utf-8');

    const extAuditor = new CustomToolAuditor({ projectRoot: tempDir, fix: false });
    const result = await extAuditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });
});
