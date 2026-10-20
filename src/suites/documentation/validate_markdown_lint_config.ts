/**
 * src/suites/documentation/validate_markdown_lint_config.ts
 *
 * MARKDOWNLINT CONFIGURATION & MANDATORY BASELINE AUDITOR (Node.js 26+ Native)
 *
 * Enforces standardized documentation hygiene rules across .markdownlint.json:
 *   1. Guarantees .markdownlint.json exists on disk; auto-scaffolds in --fix mode.
 *   2. Guarantees valid JSON syntax without corruption.
 *   3. Enforces standard documentation baseline:
 *      - default: true
 *      - MD033 allowed_elements: ["br"]
 *      - MD024 siblings_only: true
 *      - MD007 indent: 2
 *      - MD013: false (no hard line length wrapping)
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  type AuditorOptions,
  createUniformRuleCapabilities,
  createUniformRemediationPhases
} from '../../core/auditorBase.ts';
import type { AuditorConfigFileRequirement } from '../../core/auditContract.ts';

enableCompileCache();

export const MARKDOWNLINT_CONFIG_RULES = [
  'markdownlint-config-missing',
  'markdownlint-config-syntax',
  'markdownlint-config-missing-strict-rule'
] as const;

export type MarkdownLintConfigRuleId = (typeof MARKDOWNLINT_CONFIG_RULES)[number];

export interface MarkdownLintConfigShape {
  default?: boolean;
  MD013?: boolean;
  MD060?: boolean;
  MD033?: boolean | { allowed_elements?: string[] };
  MD024?: boolean | { siblings_only?: boolean };
  MD007?: boolean | { indent?: number };
  [key: string]: unknown;
}

export const CANONICAL_MARKDOWNLINT_CONFIG: MarkdownLintConfigShape = {
  default: true,
  MD013: false,
  MD060: false,
  MD033: {
    allowed_elements: ['br']
  },
  MD024: {
    siblings_only: true
  },
  MD007: {
    indent: 2
  }
};

export const MARKDOWNLINT_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<MarkdownLintConfigRuleId> =
  {
    id: 'markdownlint-config',
    file: '.markdownlint.json',
    candidateFiles: ['.markdownlint.json', '.markdownlint-cli2.jsonc'],
    description: 'Configuración estándar de markdownlint para documentación',
    ruleId: 'markdownlint-config-missing',
    generateDefaultContent: () => JSON.stringify(CANONICAL_MARKDOWNLINT_CONFIG, null, 2) + '\n'
  };

export class ValidateMarkdownLintConfigAuditor extends BaseAuditor<MarkdownLintConfigRuleId> {
  constructor(
    rootsOrOptions?:
      | readonly string[]
      | (Partial<AuditorOptions<MarkdownLintConfigRuleId>> & {
          projectRoot?: string;
          fix?: boolean;
          configFile?: string;
        }),
    maybeProjectRoot?: string
  ) {
    const optionsObj =
      rootsOrOptions && !Array.isArray(rootsOrOptions)
        ? (rootsOrOptions as Partial<AuditorOptions<MarkdownLintConfigRuleId>> & {
            projectRoot?: string;
            fix?: boolean;
            configFile?: string;
          })
        : undefined;
    const projectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();

    const configRequirement: AuditorConfigFileRequirement<MarkdownLintConfigRuleId> = {
      ...MARKDOWNLINT_CONFIG_REQUIREMENT,
      ...(optionsObj?.configFile
        ? {
            file: optionsObj.configFile,
            candidateFiles: [optionsObj.configFile]
          }
        : {})
    };

    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createUniformRuleCapabilities(MARKDOWNLINT_CONFIG_RULES, {
        speed: 'light',
        phase: 'setup',
        fix: 'priority',
        md: true,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      fixableRuleIds: [
        'markdownlint-config-missing',
        'markdownlint-config-missing-strict-rule'
      ],
      configFiles: [configRequirement],
      id: 'validate_markdown_lint_config',
      name: 'Markdownlint Configuration Validator',
      description: 'Valida baseline de configuración markdownlint',
      icon: '📝',
      family: 'documentation',
      ruleIds: MARKDOWNLINT_CONFIG_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(MARKDOWNLINT_CONFIG_RULES, 'setup'),
      packageName: 'Markdown',
      configKey: 'documentation',
      defaultConfig: {
        enabled: true
      },
      criticalConfig: {},
      ruleDescriptions: {
        'markdownlint-config-missing': 'Archivo .markdownlint.json ausente',
        'markdownlint-config-syntax': 'Error de sintaxis en configuración',
        'markdownlint-config-missing-strict-rule': 'Falta regla estricta obligatoria'
      },
      ruleRemediations: {
        'markdownlint-config-missing':
          '📖 GUÍA DE REMEDIACIÓN: markdownlint-config-missing\n' +
          '1. Causa Raíz: El archivo de configuración canónico `.markdownlint.json` no existe en la raíz del repositorio.\n' +
          '2. Diagnóstico: Verifica si existe `.markdownlint.json` en la raíz del proyecto.\n' +
          '3. Solución Canónica: Ejecuta `npm run auditor:fix` para auto-scaffoldear automáticamente la configuración canónica con el baseline estricto.\n' +
          '4. Ejemplo / Comando de auto-fix:\n' +
          '   - Ejecutar: `npm run auditor:fix` o `auditor fix`',
        'markdownlint-config-syntax':
          '📖 GUÍA DE REMEDIACIÓN: markdownlint-config-syntax\n' +
          '1. Causa Raíz: El archivo `.markdownlint.json` contiene errores de sintaxis JSON (comas de más, comillas sin cerrar o formato corrupto).\n' +
          '2. Diagnóstico: Abre `.markdownlint.json` y valida la sintaxis con un validador JSON.\n' +
          '3. Solución Canónica: Corrige las comas sobrantes o comillas faltantes en `.markdownlint.json`.\n' +
          '4. Ejemplo / Comando de auto-fix:\n' +
          '   - Ejecutar: `npm run auditor:fix` o formatear `.markdownlint.json` con `vp run oxfmt`',
        'markdownlint-config-missing-strict-rule':
          '📖 GUÍA DE REMEDIACIÓN: markdownlint-config-missing-strict-rule\n' +
          '1. Causa Raíz: Faltan reglas obligatorias del baseline inmutable del auditor (MD033 con allowed_elements: ["br"], MD024 con siblings_only: true, etc.) en `.markdownlint.json`.\n' +
          '2. Diagnóstico: Compara `.markdownlint.json` contra las reglas requeridas por el estándar de documentación del framework.\n' +
          '3. Solución Canónica: Restablece las reglas del baseline estricto ejecutando la auto-reparación mecánica del auditor.\n' +
          '4. Ejemplo / Comando de auto-fix:\n' +
          '   - Ejecutar: `npm run auditor:fix` o `auditor fix`'
      },
      coverage: {
        include: ['.markdownlint*']
      },
      projectRoot,
      fix: optionsObj?.fix,
      ...optionsObj
    });
  }

  public override async runAudit(): Promise<void> {
    const isFix = this.isFixActive();
    let configFile: string | null = null;
    this.runSubAuditorSync('markdownlint-config-missing', () => {
      configFile = this.resolveConfigFile(MARKDOWNLINT_CONFIG_REQUIREMENT);
    });

    if (!configFile) {
      const ensured = await this.runSubAuditor('markdownlint-config-missing', () =>
        this.ensureConfigFile(MARKDOWNLINT_CONFIG_REQUIREMENT)
      );
      if (!ensured) {
        this.markRuleNotApplicable('markdownlint-config-syntax', 'Archivo .markdownlint.json ausente');
        this.markRuleNotApplicable('markdownlint-config-missing-strict-rule', 'Archivo .markdownlint.json ausente');
        return;
      }
      configFile = ensured.resolvedPath;
    }

    const resolvedPath = configFile;

    const relPath =
      path.relative(this.projectRoot, resolvedPath) || MARKDOWNLINT_CONFIG_REQUIREMENT.file;
    this.recordScanned(relPath);
    let rawContent: string;
    try {
      rawContent = fs.readFileSync(resolvedPath, 'utf8');
    } catch {
      this.markRuleNotApplicable('markdownlint-config-syntax', 'No se pudo leer el archivo');
      this.markRuleNotApplicable('markdownlint-config-missing-strict-rule', 'No se pudo leer el archivo');
      return;
    }

    let parsed: MarkdownLintConfigShape | undefined;
    this.runSubAuditorSync('markdownlint-config-syntax', () => {
      try {
        parsed = JSON.parse(rawContent) as MarkdownLintConfigShape;
      } catch {
        this.addViolation({
          ruleId: 'markdownlint-config-syntax',
          severity: 'error',
          file: relPath,
          line: 1,
          message: `Error de sintaxis JSON en ${relPath}.`
        });
      }
    });

    if (!parsed || typeof parsed !== 'object') {
      this.markRuleNotApplicable('markdownlint-config-missing-strict-rule', 'Sintaxis JSON inválida');
      return;
    }

    let modified = false;
    const parsedConfig = parsed;

    // Check mandatory strict baseline rules
    this.runSubAuditorSync('markdownlint-config-missing-strict-rule', () => {
      if (parsedConfig.default !== true) {
        if (isFix) {
          parsedConfig.default = true;
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'markdownlint-config-missing-strict-rule',
            severity: 'error',
            file: relPath,
            line: 1,
            message: 'La configuración debe definir "default": true.'
          });
        }
      }

      // Check MD033 (allowed_elements should include "br")
      const md033 = parsedConfig.MD033;
      const isMd033Ok =
        typeof md033 === 'object' &&
        md033 !== null &&
        Array.isArray(md033.allowed_elements) &&
        md033.allowed_elements.includes('br');

      if (!isMd033Ok && md033 !== false) {
        if (isFix) {
          parsedConfig.MD033 = { allowed_elements: ['br'] };
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'markdownlint-config-missing-strict-rule',
            severity: 'error',
            file: relPath,
            line: 1,
            message: 'MD033 debe permitir <br> vía allowed_elements: ["br"].'
          });
        }
      }

      // Check MD024 (siblings_only: true)
      const md024 = parsedConfig.MD024;
      const isMd024Ok =
        typeof md024 === 'object' && md024 !== null && md024.siblings_only === true;

      if (!isMd024Ok && md024 !== false) {
        if (isFix) {
          parsedConfig.MD024 = { siblings_only: true };
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'markdownlint-config-missing-strict-rule',
            severity: 'error',
            file: relPath,
            line: 1,
            message: 'MD024 debe tener siblings_only: true para permitir subtítulos iguales en secciones distintas.'
          });
        }
      }

      // Check MD007 (indent: 2)
      const md007 = parsedConfig.MD007;
      const isMd007Ok =
        typeof md007 === 'object' && md007 !== null && md007.indent === 2;

      if (!isMd007Ok && md007 !== false) {
        if (isFix) {
          parsedConfig.MD007 = { indent: 2 };
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'markdownlint-config-missing-strict-rule',
            severity: 'error',
            file: relPath,
            line: 1,
            message: 'MD007 debe tener indent: 2 según la guía de Markdown.'
          });
        }
      }
    });

    if (isFix && modified) {
      fs.writeFileSync(resolvedPath, JSON.stringify(parsedConfig, null, 2) + '\n', 'utf8');
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateMarkdownLintConfigAuditor());
