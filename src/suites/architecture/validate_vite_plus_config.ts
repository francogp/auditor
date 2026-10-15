import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, createRuleCapabilities } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { toPosixRelative } from '../../core/safePath.ts';
import type { AuditFinding, AuditorConfigFileRequirement } from '../../core/auditContract.ts';
import {
  buildCanonicalVitePlusConfig,
  repairVitePlusProject,
  LEGACY_CONFIG_FILES,
  cleanLegacyConfigFiles
} from '../../core/vitePlusConfigSync.ts';

enableCompileCache();

export type VitePlusConfigRuleId =
  | 'vite-plus-config-missing'
  | 'vite-plus-config-any-allowed'
  | 'vite-plus-config-ts-ignore-allowed'
  | 'vite-plus-legacy-config-forbidden';

export const VITE_PLUS_CONFIG_RULES: readonly VitePlusConfigRuleId[] = [
  'vite-plus-config-missing',
  'vite-plus-config-any-allowed',
  'vite-plus-config-ts-ignore-allowed',
  'vite-plus-legacy-config-forbidden'
] as const;

export interface VitePlusConfigAuditOptions {
  readonly projectRoot?: string;
  readonly configFile?: string;
  readonly fix?: boolean;
}

/**
 * Validates that a vite.config.ts file enforces strict /domain-type-first rules.
 */
export function auditVitePlusConfigContent(content: string, fileName: string): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // 1. @typescript-eslint/no-explicit-any MUST be 'error'
  const hasExplicitAnyError =
    /['"]@typescript-eslint\/no-explicit-any['"]\s*:\s*['"]error['"]/i.test(content) ||
    /['"]@typescript-eslint\/no-explicit-any['"]\s*:\s*\[\s*['"]error['"]/i.test(content);

  const hasExplicitAnyOffOrWarn =
    /['"]@typescript-eslint\/no-explicit-any['"]\s*:\s*['"](?:off|warn|0|1)['"]/i.test(content) ||
    /['"]@typescript-eslint\/no-explicit-any['"]\s*:\s*\[\s*['"](?:off|warn|0|1)['"]/i.test(
      content
    );

  if (!hasExplicitAnyError || hasExplicitAnyOffOrWarn) {
    findings.push({
      suiteId: 'validate_vite_plus_config',
      suiteName: 'Vite+ Unified Configuration Validator',
      ruleId: 'vite-plus-config-any-allowed',
      ruleDescription: 'Vite+: Regla no-explicit-any no es error',
      severity: 'error',
      file: fileName,
      line: 1,
      col: 1,
      context: '@typescript-eslint/no-explicit-any',
      message: `La regla '@typescript-eslint/no-explicit-any' debe estar configurada en 'error' en vite.config.ts para cumplir con /domain-type-first.`
    });
  }

  // 2. @typescript-eslint/ban-ts-comment MUST be 'error'
  const hasBanTsCommentError =
    /['"]@typescript-eslint\/ban-ts-comment['"]\s*:\s*['"]error['"]/i.test(content) ||
    /['"]@typescript-eslint\/ban-ts-comment['"]\s*:\s*\[\s*['"]error['"]/i.test(content);

  const hasBanTsCommentOffOrWarn =
    /['"]@typescript-eslint\/ban-ts-comment['"]\s*:\s*['"](?:off|warn|0|1)['"]/i.test(content) ||
    /['"]@typescript-eslint\/ban-ts-comment['"]\s*:\s*\[\s*['"](?:off|warn|0|1)['"]/i.test(content);

  if (!hasBanTsCommentError || hasBanTsCommentOffOrWarn) {
    findings.push({
      suiteId: 'validate_vite_plus_config',
      suiteName: 'Vite+ Unified Configuration Validator',
      ruleId: 'vite-plus-config-ts-ignore-allowed',
      ruleDescription: 'Vite+: Regla ban-ts-comment no es error',
      severity: 'error',
      file: fileName,
      line: 1,
      col: 1,
      context: '@typescript-eslint/ban-ts-comment',
      message: `La regla '@typescript-eslint/ban-ts-comment' debe estar configurada en 'error' en vite.config.ts para prohibir supresiones (@ts-ignore) en tipos de dominio.`
    });
  }

  return findings;
}

export const VITE_PLUS_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<VitePlusConfigRuleId> = {
  id: 'vite-plus-config',
  file: 'vite.config.ts',
  candidateFiles: ['vite.config.ts'],
  description: 'Configuración unificada de Vite+ (vite.config.ts)',
  ruleId: 'vite-plus-config-missing',
  generateDefaultContent: (ctx) => buildCanonicalVitePlusConfig(getAuditConfig(ctx.projectRoot))
};

export class ValidateVitePlusConfigAuditor extends BaseAuditor<VitePlusConfigRuleId> {
  constructor(options: VitePlusConfigAuditOptions = {}) {
    const effectiveRoot = options.projectRoot ?? process.cwd();
    const configRequirement: AuditorConfigFileRequirement<VitePlusConfigRuleId> = options.configFile
      ? {
          ...VITE_PLUS_CONFIG_REQUIREMENT,
          file: options.configFile,
          candidateFiles: [options.configFile],
          generateDefaultContent: () => buildCanonicalVitePlusConfig(getAuditConfig(effectiveRoot))
        }
      : VITE_PLUS_CONFIG_REQUIREMENT;

    super({
      usesThirdPartyTool: false,
      ruleCapabilities: createRuleCapabilities(
        VITE_PLUS_CONFIG_RULES,
        {
          speed: 'light',
          phase: 'normal',
          fix: 'priority',
          md: false,
          ast: false,
          changedOnly: false,
          critical: false
        },
        ['vite-plus-config-missing', 'vite-plus-legacy-config-forbidden']
      ),
      fixableRuleIds: ['vite-plus-config-missing', 'vite-plus-legacy-config-forbidden'],
      configFiles: [configRequirement],
      fix: options.fix,
      id: 'validate_vite_plus_config',
      name: 'Vite+ Unified Configuration Validator',
      description: 'Valida configuración de Vite+ y reglas de dominio',
      family: 'architecture',
      packageName: 'Vite+',
      configKey: 'vitePlusConfig.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '⚡',
      ruleIds: VITE_PLUS_CONFIG_RULES,
      ruleDescriptions: {
        'vite-plus-config-missing': 'Archivo vite.config.ts ausente',
        'vite-plus-config-any-allowed': 'Regla no-explicit-any no es error',
        'vite-plus-config-ts-ignore-allowed': 'Regla ban-ts-comment no es error',
        'vite-plus-legacy-config-forbidden': 'Configuraciones legacy prohibidas'
      },
      ruleRemediations: {
        'vite-plus-config-missing':
          'Guía de diagnóstico y remediación para vite-plus-config-missing. Ejecuta `auditor fix` para generar vite.config.ts desde .auditor/audit.config.ts.',
        'vite-plus-config-any-allowed':
          'Guía de diagnóstico y remediación para vite-plus-config-any-allowed. Configura @typescript-eslint/no-explicit-any en "error" en vite.config.ts.',
        'vite-plus-config-ts-ignore-allowed':
          'Guía de diagnóstico y remediación para vite-plus-config-ts-ignore-allowed. Configura @typescript-eslint/ban-ts-comment en "error" en vite.config.ts.',
        'vite-plus-legacy-config-forbidden':
          'Guía de diagnóstico y remediación para vite-plus-legacy-config-forbidden. Elimina archivos de configuración obsoletos (eslint, vitest, tsdown) migrándolos a vite.config.ts.'
      },
      coverage: {
        include: ['vite.config.ts']
      },
      projectRoot: effectiveRoot
    });
  }

  public override async runAudit(): Promise<void> {
    if (this.isFixActive()) {
      repairVitePlusProject(this.projectRoot);
    }

    // Rule: vite-plus-legacy-config-forbidden
    this.runSubAuditorSync('vite-plus-legacy-config-forbidden', () => {
      for (const legacy of LEGACY_CONFIG_FILES) {
        const fullPath = path.resolve(this.projectRoot, legacy);
        if (fs.existsSync(fullPath)) {
          if (this.isFixActive()) {
            cleanLegacyConfigFiles(this.projectRoot);
            break;
          } else {
            this.addViolation({
              ruleId: 'vite-plus-legacy-config-forbidden',
              severity: 'error',
              file: legacy,
              line: 1,
              context: legacy,
              message: `El archivo '${legacy}' es un archivo de configuración obsoleto. Toda la configuración debe vivir en vite.config.ts y sincronizarse desde .auditor/audit.config.ts.`,
              fixable: true
            });
          }
        }
      }
    });

    const requirement = this.configFiles[0] ?? VITE_PLUS_CONFIG_REQUIREMENT;
    const ensured = await this.runSubAuditor('vite-plus-config-missing', async () => {
      return await this.ensureConfigFile(requirement);
    });

    if (!ensured) {
      this.markRuleNotApplicable(
        'vite-plus-config-any-allowed',
        'Archivo de configuración no encontrado'
      );
      this.markRuleNotApplicable(
        'vite-plus-config-ts-ignore-allowed',
        'Archivo de configuración no encontrado'
      );
      return;
    }

    const resolvedPath = ensured.resolvedPath;
    const relFileName = toPosixRelative(this.projectRoot, resolvedPath);
    this.recordScanned(relFileName);

    const content = fs.readFileSync(resolvedPath, 'utf-8');

    this.runSubAuditorSync('vite-plus-config-any-allowed', () => {
      const hasExplicitAnyError =
        /['"]@typescript-eslint\/no-explicit-any['"]\s*:\s*['"]error['"]/i.test(content) ||
        /['"]@typescript-eslint\/no-explicit-any['"]\s*:\s*\[\s*['"]error['"]/i.test(content);
      const hasExplicitAnyOffOrWarn =
        /['"]@typescript-eslint\/no-explicit-any['"]\s*:\s*['"](?:off|warn|0|1)['"]/i.test(
          content
        ) ||
        /['"]@typescript-eslint\/no-explicit-any['"]\s*:\s*\[\s*['"](?:off|warn|0|1)['"]/i.test(
          content
        );
      if (!hasExplicitAnyError || hasExplicitAnyOffOrWarn) {
        this.addViolation({
          ruleId: 'vite-plus-config-any-allowed',
          severity: 'error',
          file: relFileName,
          line: 1,
          context: '@typescript-eslint/no-explicit-any',
          message: `La regla '@typescript-eslint/no-explicit-any' debe estar configurada en 'error' para cumplir con /domain-type-first.`
        });
      }
    });

    this.runSubAuditorSync('vite-plus-config-ts-ignore-allowed', () => {
      const hasBanTsCommentError =
        /['"]@typescript-eslint\/ban-ts-comment['"]\s*:\s*['"]error['"]/i.test(content) ||
        /['"]@typescript-eslint\/ban-ts-comment['"]\s*:\s*\[\s*['"]error['"]/i.test(content);
      const hasBanTsCommentOffOrWarn =
        /['"]@typescript-eslint\/ban-ts-comment['"]\s*:\s*['"](?:off|warn|0|1)['"]/i.test(
          content
        ) ||
        /['"]@typescript-eslint\/ban-ts-comment['"]\s*:\s*\[\s*['"](?:off|warn|0|1)['"]/i.test(
          content
        );
      if (!hasBanTsCommentError || hasBanTsCommentOffOrWarn) {
        this.addViolation({
          ruleId: 'vite-plus-config-ts-ignore-allowed',
          severity: 'error',
          file: relFileName,
          line: 1,
          context: '@typescript-eslint/ban-ts-comment',
          message: `La regla '@typescript-eslint/ban-ts-comment' debe estar configurada en 'error' para prohibir supresiones (@ts-ignore) en tipos de dominio.`
        });
      }
    });

    this.context.setMetric('Vite+ Config Checked', relFileName);
    const totalViolations = Array.from(this.countsByRule.values()).reduce((a, b) => a + b, 0);
    this.context.setMetric('Vite+ Config Violations', totalViolations);
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateVitePlusConfigAuditor());
