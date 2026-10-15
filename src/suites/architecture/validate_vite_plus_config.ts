import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, createRuleCapabilities } from '../../core/auditorBase.ts';
import { getAuditConfig, type AuditConfig } from '../../core/auditConfig.ts';
import { toPosixRelative } from '../../core/safePath.ts';
import type { AuditFinding, AuditorConfigFileRequirement } from '../../core/auditContract.ts';
import {
  buildCanonicalVitePlusConfig,
  repairVitePlusProject,
  LEGACY_CONFIG_FILES,
  cleanLegacyConfigFiles,
  syncViteConfigWithAuditConfig,
  resolveAuditConfigIgnoreGlobs,
  extractObjectPropertyBlock
} from '../../core/vitePlusConfigSync.ts';

enableCompileCache();

export type VitePlusConfigRuleId =
  | 'vite-plus-config-missing'
  | 'vite-plus-config-any-allowed'
  | 'vite-plus-config-ts-ignore-allowed'
  | 'vite-plus-config-type-assertions-allowed'
  | 'vite-plus-config-double-cast-allowed'
  | 'vite-plus-config-legacy-date-allowed'
  | 'vite-plus-config-fmt-missing'
  | 'vite-plus-config-staged-missing'
  | 'vite-plus-config-test-missing'
  | 'vite-plus-legacy-config-forbidden'
  | 'vite-plus-config-ignore-patterns-missing'
  | 'vite-plus-config-plugin-missing'
  | 'vite-plus-config-options-missing'
  | 'vite-plus-config-test-roots-desynced';

export const VITE_PLUS_CONFIG_RULES: readonly VitePlusConfigRuleId[] = [
  'vite-plus-config-missing',
  'vite-plus-config-any-allowed',
  'vite-plus-config-ts-ignore-allowed',
  'vite-plus-config-type-assertions-allowed',
  'vite-plus-config-double-cast-allowed',
  'vite-plus-config-legacy-date-allowed',
  'vite-plus-config-fmt-missing',
  'vite-plus-config-staged-missing',
  'vite-plus-config-test-missing',
  'vite-plus-legacy-config-forbidden',
  'vite-plus-config-ignore-patterns-missing',
  'vite-plus-config-plugin-missing',
  'vite-plus-config-options-missing',
  'vite-plus-config-test-roots-desynced'
] as const;

export interface VitePlusConfigAuditOptions {
  readonly projectRoot?: string;
  readonly configFile?: string;
  readonly fix?: boolean;
}

function checkRuleLevel(content: string, ruleName: string): boolean {
  const escaped = ruleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hasError =
    new RegExp(`['"]${escaped}['"]\\s*:\\s*['"]error['"]`, 'i').test(content) ||
    new RegExp(`['"]${escaped}['"]\\s*:\\s*\\[\\s*['"]error['"]`, 'i').test(content);
  const hasOffOrWarn =
    new RegExp(`['"]${escaped}['"]\\s*:\\s*['"](?:off|warn|0|1)['"]`, 'i').test(content) ||
    new RegExp(`['"]${escaped}['"]\\s*:\\s*\\[\\s*['"](?:off|warn|0|1)['"]`, 'i').test(content);
  return hasError && !hasOffOrWarn;
}

function validateAntiCastrationRules(content: string, fileName: string): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (!checkRuleLevel(content, '@typescript-eslint/no-explicit-any')) {
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

  if (!checkRuleLevel(content, '@typescript-eslint/ban-ts-comment')) {
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

  const hasTypeAssertions =
    new RegExp(
      `['"]@typescript-eslint/consistent-type-assertions['"]\\s*:\\s*\\[\\s*['"]error['"]`,
      'i'
    ).test(content) &&
    !new RegExp(
      `['"]@typescript-eslint/consistent-type-assertions['"]\\s*:\\s*['"](?:off|warn|0|1)['"]`,
      'i'
    ).test(content);
  if (!hasTypeAssertions) {
    findings.push({
      suiteId: 'validate_vite_plus_config',
      suiteName: 'Vite+ Unified Configuration Validator',
      ruleId: 'vite-plus-config-type-assertions-allowed',
      ruleDescription: 'Vite+: Regla consistent-type-assertions no configurada en error',
      severity: 'error',
      file: fileName,
      line: 1,
      col: 1,
      context: '@typescript-eslint/consistent-type-assertions',
      message: `Falta configurar '@typescript-eslint/consistent-type-assertions' en 'error' con estilo 'as' y objectLiteralTypeAssertions: 'never'.`
    });
  }

  if (!checkRuleLevel(content, '@francogp/domain-type/no-double-cast-unknown')) {
    findings.push({
      suiteId: 'validate_vite_plus_config',
      suiteName: 'Vite+ Unified Configuration Validator',
      ruleId: 'vite-plus-config-double-cast-allowed',
      ruleDescription: 'Vite+: Falta prohibición de doble casteo a unknown',
      severity: 'error',
      file: fileName,
      line: 1,
      col: 1,
      context: '@francogp/domain-type/no-double-cast-unknown',
      message: `Falta la regla '@francogp/domain-type/no-double-cast-unknown' configurada en 'error' para prohibir el casteo hacia unknown.`
    });
  }

  if (!checkRuleLevel(content, '@francogp/domain-type/no-legacy-date')) {
    findings.push({
      suiteId: 'validate_vite_plus_config',
      suiteName: 'Vite+ Unified Configuration Validator',
      ruleId: 'vite-plus-config-legacy-date-allowed',
      ruleDescription: 'Vite+: Falta prohibición de constructores legados de Date',
      severity: 'error',
      file: fileName,
      line: 1,
      col: 1,
      context: '@francogp/domain-type/no-legacy-date',
      message: `Falta la regla '@francogp/domain-type/no-legacy-date' configurada en 'error' para prohibir new Date() y Date.now().`
    });
  }

  return findings;
}

function validateRequiredSections(content: string, fileName: string): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (!/(^|\s)fmt\s*:\s*\{/m.test(content)) {
    findings.push({
      suiteId: 'validate_vite_plus_config',
      suiteName: 'Vite+ Unified Configuration Validator',
      ruleId: 'vite-plus-config-fmt-missing',
      ruleDescription: 'Vite+: Falta bloque de formato fmt',
      severity: 'error',
      file: fileName,
      line: 1,
      col: 1,
      context: 'fmt',
      message: `Falta la sección 'fmt' en vite.config.ts para gobernar el formateo nativo con Oxfmt.`
    });
  }

  if (!/(^|\s)staged\s*:\s*\{/m.test(content)) {
    findings.push({
      suiteId: 'validate_vite_plus_config',
      suiteName: 'Vite+ Unified Configuration Validator',
      ruleId: 'vite-plus-config-staged-missing',
      ruleDescription: 'Vite+: Falta bloque de git hooks staged',
      severity: 'error',
      file: fileName,
      line: 1,
      col: 1,
      context: 'staged',
      message: `Falta la sección 'staged' en vite.config.ts para habilitar git hooks pre-commit nativos.`
    });
  }

  if (!/(^|\s)test\s*:\s*\{/m.test(content)) {
    findings.push({
      suiteId: 'validate_vite_plus_config',
      suiteName: 'Vite+ Unified Configuration Validator',
      ruleId: 'vite-plus-config-test-missing',
      ruleDescription: 'Vite+: Falta bloque de pruebas test',
      severity: 'error',
      file: fileName,
      line: 1,
      col: 1,
      context: 'test',
      message: `Falta la sección 'test' en vite.config.ts para ejecutar pruebas con Vitest integrado.`
    });
  }

  return findings;
}

function validateLintOptionsAndPlugins(content: string, fileName: string): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (!content.includes('@francogp/auditor/domain-type-plugin')) {
    findings.push({
      suiteId: 'validate_vite_plus_config',
      suiteName: 'Vite+ Unified Configuration Validator',
      ruleId: 'vite-plus-config-plugin-missing',
      ruleDescription: 'Vite+: Falta jsPlugin de dominio en lint',
      severity: 'error',
      file: fileName,
      line: 1,
      col: 1,
      context: 'domain-type-plugin',
      message: `Falta registrar el plugin jsPlugins: ['@francogp/auditor/domain-type-plugin'] en la sección 'lint' de vite.config.ts.`
    });
  }

  const lintBlock = extractObjectPropertyBlock(content, 'lint');
  if (lintBlock && (!lintBlock.includes('options:') || !lintBlock.includes('typeAware:'))) {
    findings.push({
      suiteId: 'validate_vite_plus_config',
      suiteName: 'Vite+ Unified Configuration Validator',
      ruleId: 'vite-plus-config-options-missing',
      ruleDescription: 'Vite+: Falta bloque options en lint',
      severity: 'error',
      file: fileName,
      line: 1,
      col: 1,
      context: 'lint.options',
      message: `Falta configurar la sección 'options' con 'typeAware' y 'typeCheck' en 'lint' de vite.config.ts.`
    });
  }

  return findings;
}

function validateSynchronizedConfig(
  content: string,
  fileName: string,
  auditConfig: AuditConfig,
  projectRoot?: string
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const lintBlock = extractObjectPropertyBlock(content, 'lint');

  // ignorePatterns synchronization
  const lintIgnores = resolveAuditConfigIgnoreGlobs(auditConfig, 'lint', projectRoot);
  const missingLint = lintBlock
    ? lintIgnores.filter((g) => !lintBlock.includes(`'${g}'`) && !lintBlock.includes(`"${g}"`))
    : lintIgnores;

  const fmtBlock = extractObjectPropertyBlock(content, 'fmt');
  const fmtIgnores = resolveAuditConfigIgnoreGlobs(auditConfig, 'fmt', projectRoot);
  const missingFmt = fmtBlock
    ? fmtIgnores.filter((g) => !fmtBlock.includes(`'${g}'`) && !fmtBlock.includes(`"${g}"`))
    : fmtIgnores;

  if (missingLint.length > 0 || missingFmt.length > 0) {
    const missingParts: string[] = [];
    if (missingLint.length > 0) missingParts.push(`lint: [${missingLint.join(', ')}]`);
    if (missingFmt.length > 0) missingParts.push(`fmt: [${missingFmt.join(', ')}]`);
    findings.push({
      suiteId: 'validate_vite_plus_config',
      suiteName: 'Vite+ Unified Configuration Validator',
      ruleId: 'vite-plus-config-ignore-patterns-missing',
      ruleDescription: 'Vite+: Faltan exclusiones de audit.config.ts',
      severity: 'error',
      file: fileName,
      line: 1,
      col: 1,
      context: 'ignorePatterns',
      message: `Faltan patrones de exclusión requeridos por audit.config.ts en vite.config.ts: ${missingParts.join('; ')}. Ejecuta 'auditor fix' para sincronizarlos automáticamente.`
    });
  }

  // testRoots synchronization
  const testRoots = auditConfig.paths?.testRoots;
  if (testRoots && testRoots.length > 0) {
    const testBlock = extractObjectPropertyBlock(content, 'test');
    if (testBlock) {
      const missingRoots = testRoots.filter(
        (r) => !testBlock.includes(`'${r}/`) && !testBlock.includes(`"${r}/`)
      );
      if (missingRoots.length > 0) {
        findings.push({
          suiteId: 'validate_vite_plus_config',
          suiteName: 'Vite+ Unified Configuration Validator',
          ruleId: 'vite-plus-config-test-roots-desynced',
          ruleDescription: 'Vite+: Raíces de test desincronizadas',
          severity: 'error',
          file: fileName,
          line: 1,
          col: 1,
          context: 'test.include',
          message: `Las raíces de pruebas declaradas en audit.config.ts (${missingRoots.join(', ')}) no están sincronizadas en 'test.include' de vite.config.ts. Ejecuta 'auditor fix' para sincronizarlas automáticamente.`
        });
      }
    }
  }

  return findings;
}

/**
 * Validates that a vite.config.ts file enforces strict /domain-type-first rules and sections.
 */
export function auditVitePlusConfigContent(
  content: string,
  fileName: string,
  auditConfig?: AuditConfig,
  projectRoot?: string
): AuditFinding[] {
  const findings: AuditFinding[] = [
    ...validateAntiCastrationRules(content, fileName),
    ...validateRequiredSections(content, fileName),
    ...validateLintOptionsAndPlugins(content, fileName)
  ];

  if (auditConfig) {
    findings.push(...validateSynchronizedConfig(content, fileName, auditConfig, projectRoot));
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
        [...VITE_PLUS_CONFIG_RULES]
      ),
      fixableRuleIds: [...VITE_PLUS_CONFIG_RULES],
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
        'vite-plus-config-type-assertions-allowed': 'Regla consistent-type-assertions',
        'vite-plus-config-double-cast-allowed': 'Falta prohibición de doble casteo',
        'vite-plus-config-legacy-date-allowed': 'Falta prohibición de Date legado',
        'vite-plus-config-fmt-missing': 'Falta bloque de formateo fmt',
        'vite-plus-config-staged-missing': 'Falta bloque de git hooks staged',
        'vite-plus-config-test-missing': 'Falta bloque de pruebas test',
        'vite-plus-legacy-config-forbidden': 'Configuraciones legacy prohibidas',
        'vite-plus-config-ignore-patterns-missing': 'Faltan exclusiones de audit.config.ts',
        'vite-plus-config-plugin-missing': 'Falta jsPlugin de dominio en lint',
        'vite-plus-config-options-missing': 'Falta bloque options en lint',
        'vite-plus-config-test-roots-desynced': 'Raíces de test desincronizadas'
      },
      ruleRemediations: {
        'vite-plus-config-missing':
          'Guía de diagnóstico y remediación para vite-plus-config-missing. Ejecuta `auditor fix` para generar vite.config.ts desde .auditor/audit.config.ts.',
        'vite-plus-config-any-allowed':
          'Guía de diagnóstico y remediación para vite-plus-config-any-allowed. Configura @typescript-eslint/no-explicit-any en "error" en vite.config.ts.',
        'vite-plus-config-ts-ignore-allowed':
          'Guía de diagnóstico y remediación para vite-plus-config-ts-ignore-allowed. Configura @typescript-eslint/ban-ts-comment en "error" en vite.config.ts.',
        'vite-plus-config-type-assertions-allowed':
          'Guía de diagnóstico y remediación para vite-plus-config-type-assertions-allowed. Configura consistent-type-assertions en "error" en vite.config.ts.',
        'vite-plus-config-double-cast-allowed':
          'Guía de diagnóstico y remediación para vite-plus-config-double-cast-allowed. Configura @francogp/domain-type/no-double-cast-unknown en "error" en vite.config.ts.',
        'vite-plus-config-legacy-date-allowed':
          'Guía de diagnóstico y remediación para vite-plus-config-legacy-date-allowed. Configura @francogp/domain-type/no-legacy-date en "error" en vite.config.ts.',
        'vite-plus-config-fmt-missing':
          'Guía de diagnóstico y remediación para vite-plus-config-fmt-missing. Configura la sección fmt en vite.config.ts o ejecuta `auditor fix`.',
        'vite-plus-config-staged-missing':
          'Guía de diagnóstico y remediación para vite-plus-config-staged-missing. Configura la sección staged en vite.config.ts o ejecuta `auditor fix`.',
        'vite-plus-config-test-missing':
          'Guía de diagnóstico y remediación para vite-plus-config-test-missing. Configura la sección test en vite.config.ts o ejecuta `auditor fix`.',
        'vite-plus-legacy-config-forbidden':
          'Guía de diagnóstico y remediación para vite-plus-legacy-config-forbidden. Elimina archivos de configuración obsoletos (eslint, vitest, tsdown) migrándolos a vite.config.ts.',
        'vite-plus-config-ignore-patterns-missing':
          'Guía de diagnóstico y remediación para vite-plus-config-ignore-patterns-missing. Sincroniza paths.ignoreGlobs, testRoots y exclusiones desde audit.config.ts a vite.config.ts mediante `auditor fix`.',
        'vite-plus-config-plugin-missing':
          'Guía de diagnóstico y remediación para vite-plus-config-plugin-missing. Registra jsPlugins: ["@francogp/auditor/domain-type-plugin"] en vite.config.ts mediante `auditor fix`.',
        'vite-plus-config-options-missing':
          'Guía de diagnóstico y remediación para vite-plus-config-options-missing. Configura la sección options con typeAware en lint de vite.config.ts mediante `auditor fix`.',
        'vite-plus-config-test-roots-desynced':
          'Guía de diagnóstico y remediación para vite-plus-config-test-roots-desynced. Asegura que todas las raíces de prueba de paths.testRoots estén en test.include de vite.config.ts mediante `auditor fix`.'
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

    if (this.isFixActive() && fs.existsSync(path.resolve(this.projectRoot, 'vite.config.ts'))) {
      syncViteConfigWithAuditConfig(this.projectRoot);
    }

    const rulesToCheck: readonly VitePlusConfigRuleId[] = [
      'vite-plus-config-any-allowed',
      'vite-plus-config-ts-ignore-allowed',
      'vite-plus-config-type-assertions-allowed',
      'vite-plus-config-double-cast-allowed',
      'vite-plus-config-legacy-date-allowed',
      'vite-plus-config-fmt-missing',
      'vite-plus-config-staged-missing',
      'vite-plus-config-test-missing',
      'vite-plus-config-ignore-patterns-missing',
      'vite-plus-config-plugin-missing',
      'vite-plus-config-options-missing',
      'vite-plus-config-test-roots-desynced'
    ];

    if (!ensured) {
      for (const ruleId of rulesToCheck) {
        this.markRuleNotApplicable(ruleId, 'Archivo de configuración no encontrado');
      }
      return;
    }

    const resolvedPath = ensured.resolvedPath;
    const relFileName = toPosixRelative(this.projectRoot, resolvedPath);
    this.recordScanned(relFileName);

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const config = getAuditConfig(this.projectRoot);
    const findings = auditVitePlusConfigContent(content, relFileName, config, this.projectRoot);

    const findingMap = new Map<VitePlusConfigRuleId, AuditFinding>();
    for (const f of findings) {
      findingMap.set(f.ruleId as VitePlusConfigRuleId, f);
    }

    for (const ruleId of rulesToCheck) {
      this.runSubAuditorSync(ruleId, () => {
        const f = findingMap.get(ruleId);
        if (f) {
          this.addViolation({
            ruleId,
            severity: 'error',
            file: relFileName,
            line: f.line ?? 1,
            context: f.context ?? ruleId,
            message: f.message,
            fixable: true
          });
        }
      });
    }

    this.context.setMetric('Vite+ Config Checked', relFileName);
    const totalViolations = Array.from(this.countsByRule.values()).reduce((a, b) => a + b, 0);
    this.context.setMetric('Vite+ Config Violations', totalViolations);
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateVitePlusConfigAuditor());
