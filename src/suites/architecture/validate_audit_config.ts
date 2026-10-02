/**
 * packages/auditor/src/suites/architecture/validate_audit_config.ts
 *
 * AUDIT CONFIGURATION INTEGRITY VALIDATOR (Node.js 26+)
 *
 * Validates that 100% of files, paths, directories, modules, and extensions
 * declared in audit.config.ts physically exist on disk.
 * Emits severity: 'error' if any referenced path is missing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { loadAuditConfig, type AuditEngineConfig } from '../../core/auditConfig.ts';

enableCompileCache();

export type AuditConfigRuleId =
  | 'audit-config-missing-path'
  | 'audit-config-missing-file'
  | 'audit-config-invalid-extension';

export const AUDIT_CONFIG_RULES: readonly AuditConfigRuleId[] = [
  'audit-config-missing-path',
  'audit-config-missing-file',
  'audit-config-invalid-extension'
] as const;

export const PATH_ROOT_KEYS: readonly (keyof AuditEngineConfig['paths'])[] = [
  'srcRoots',
  'testRoots',
  'e2eRoots',
  'integrationRoots',
  'scriptsRoots',
  'codeRoots',
  'dataRoots',
  'constantsRoots',
  'componentsRoots',
  'viewsRoots',
  'storesRoots',
  'composablesRoots',
  'typesRoots',
  'stylesRoots',
  'logicRoots',
  'cliRoots'
];

export class ValidateAuditConfigAuditor extends BaseAuditor<AuditConfigRuleId> {
  constructor(targetPath?: string) {
    const projectRoot = targetPath || process.cwd();

    super({
      id: 'validate_audit_config',
      name: 'Audit Configuration Integrity Validator',
      description: 'Valida existencia física de rutas en audit.config.ts',
      family: 'architecture',
      ruleIds: AUDIT_CONFIG_RULES,
      packageName: 'Config',
      ruleDescriptions: {
        'audit-config-missing-path': 'Ruta o directorio en audit.config.ts no existe',
        'audit-config-missing-file': 'Archivo citado en audit.config.ts no existe',
        'audit-config-invalid-extension': 'Extensión citada en audit.config.ts no existe'
      },
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const configPath = path.resolve(this.projectRoot, 'audit.config.ts');
    if (!fs.existsSync(configPath)) {
      this.addViolation({
        ruleId: 'audit-config-missing-file',
        severity: 'error',
        file: 'audit.config.ts',
        line: 1,
        message: 'Configuration error: audit.config.ts does not exist in project root.',
        context: 'audit.config.ts'
      });
      return;
    }

    const config = await loadAuditConfig(this.projectRoot);

    this.context.logStep(1, 4, 'Verificando existencia física de directorios y raíces configuradas...');
    this.verifyPathRoots(config);

    this.context.logStep(2, 4, 'Verificando rutas de persistencia y migraciones...');
    this.verifyPersistencePaths(config);

    this.context.logStep(3, 4, 'Verificando archivos de estilos, capas y dominios...');
    this.verifyDomainAndStylePaths(config);

    this.context.logStep(4, 4, 'Verificando extensiones registradas...');
    this.verifyExtensionPaths(config);
  }

  private checkPathExists(relPath: string, ruleId: AuditConfigRuleId, description: string): boolean {
    const normalized = relPath.trim();
    if (!normalized) return true;

    const resolved = path.resolve(this.projectRoot, normalized);
    if (!fs.existsSync(resolved)) {
      this.addViolation({
        ruleId,
        severity: 'error',
        file: 'audit.config.ts',
        line: 1,
        message: `Configuration error in audit.config.ts: Referenced ${description} "${normalized}" does not exist on disk.`,
        context: normalized
      });
      return false;
    }
    return true;
  }

  private verifyPathRoots(config: AuditEngineConfig): void {
    const rawPaths = config._rawPaths ?? config.paths;
    if (!rawPaths) return;

    for (const key of PATH_ROOT_KEYS) {
      const val = (rawPaths as Record<string, unknown>)[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (typeof item === 'string') {
            this.checkPathExists(item, 'audit-config-missing-path', `directory in paths.${String(key)}`);
          }
        }
      }
    }
  }

  private verifyPersistencePaths(config: AuditEngineConfig): void {
    const rawPersistence = config._rawConfig?.persistence;
    if (config.paths?.migrationsDir && config.persistence?.engine !== 'none') {
      if (config._rawPaths?.migrationsDir) {
        this.checkPathExists(config.paths.migrationsDir, 'audit-config-missing-path', 'migrations directory');
      }
    }

    if (rawPersistence?.supabaseDir) {
      this.checkPathExists(rawPersistence.supabaseDir, 'audit-config-missing-path', 'supabase directory');
    }

    if (Array.isArray(rawPersistence?.allowedDatabaseDirs)) {
      for (const d of rawPersistence.allowedDatabaseDirs) {
        this.checkPathExists(d, 'audit-config-missing-path', 'database directory');
      }
    }

    if (Array.isArray(rawPersistence?.allowedDatabaseFiles)) {
      for (const f of rawPersistence.allowedDatabaseFiles) {
        this.checkPathExists(f, 'audit-config-missing-file', 'database file');
      }
    }

    if (Array.isArray(rawPersistence?.authorizedSaveFiles)) {
      for (const f of rawPersistence.authorizedSaveFiles) {
        this.checkPathExists(f, 'audit-config-missing-file', 'authorized save file');
      }
    }
  }

  private verifyDomainAndStylePaths(config: AuditEngineConfig): void {
    const rawDomain = config._rawConfig?.domain;
    if (rawDomain?.zLayersFile) {
      this.checkPathExists(rawDomain.zLayersFile, 'audit-config-missing-file', 'domain z-layers file');
    }
    if (rawDomain?.timezoneHelperModule) {
      this.checkPathExists(rawDomain.timezoneHelperModule, 'audit-config-missing-file', 'timezone helper module');
    }
    if (rawDomain?.loggerModule) {
      this.checkPathExists(rawDomain.loggerModule, 'audit-config-missing-file', 'logger module');
    }
    if (Array.isArray(rawDomain?.o1CatalogPatterns)) {
      for (const pattern of rawDomain.o1CatalogPatterns) {
        if (pattern.definingFile) {
          this.checkPathExists(pattern.definingFile, 'audit-config-missing-file', `O(1) pattern defining file for '${pattern.name}'`);
        }
      }
    }

    const rawStyles = config._rawConfig?.styles;
    if (config.styles?.zLayersEnabled !== false && rawStyles) {
      if (rawStyles.baseScssFile) {
        this.checkPathExists(rawStyles.baseScssFile, 'audit-config-missing-file', 'styles base SCSS file');
      }
      if (rawStyles.zLayersScssFile) {
        this.checkPathExists(rawStyles.zLayersScssFile, 'audit-config-missing-file', 'styles z-layers SCSS file');
      }
      if (rawStyles.zLayersTsFile) {
        this.checkPathExists(rawStyles.zLayersTsFile, 'audit-config-missing-file', 'styles z-layers TS file');
      }
    }

    if (rawStyles?.buttonGovernance?.buttonsScssFile) {
      this.checkPathExists(rawStyles.buttonGovernance.buttonsScssFile, 'audit-config-missing-file', 'button governance SCSS file');
    }

    if (Array.isArray(rawStyles?.heavyEffectPaths)) {
      for (const p of rawStyles.heavyEffectPaths) {
        this.checkPathExists(p, 'audit-config-missing-path', 'heavy effect path');
      }
    }
  }

  private verifyExtensionPaths(config: AuditEngineConfig): void {
    const rawExtensions = config._rawConfig?.extensions ?? config.extensions;
    if (!Array.isArray(rawExtensions)) return;

    for (const ext of rawExtensions) {
      if (typeof ext === 'string') {
        this.checkPathExists(ext, 'audit-config-invalid-extension', 'extension file or directory');
      }
    }
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateAuditConfigAuditor());
