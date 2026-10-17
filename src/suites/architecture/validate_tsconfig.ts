/**
 * src/suites/architecture/validate_tsconfig.ts
 *
 * TSCONFIG CONFIGURATION & MANDATORY STRICT BASELINE AUDITOR (Node.js 26+ Native)
 *
 * Enforces strict, uncompromised TypeScript compiler configuration:
 *   1. Guarantees tsconfig.json exists on disk; auto-scaffolds in --fix mode.
 *   2. Guarantees valid JSON syntax without corruption.
 *   3. Enforces the Anti-Castration Mandate: strict: true, noImplicitAny: true,
 *      noUncheckedIndexedAccess: true, and moduleResolution: "bundler" | "node16" | "nodenext".
 *   4. Barred permissive or deprecated options (suppressImplicitAnyIndexErrors, noImplicitThis: false).
 *   5. Guarantees that include covers the primary source directory (src).
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  type AuditorOptions,
  createUniformRuleCapabilities
} from '../../core/auditorBase.ts';
import type { AuditorConfigFileRequirement } from '../../core/auditContract.ts';

import ts from 'typescript';

enableCompileCache();

export const TSCONFIG_RULES = [
  'tsconfig-missing',
  'tsconfig-syntax',
  'tsconfig-missing-strict-compiler-option',
  'tsconfig-banned-option',
  'tsconfig-missing-source-include'
] as const;

export type TsConfigRuleId = (typeof TSCONFIG_RULES)[number];

export interface TsCompilerOptionsShape {
  target?: string;
  module?: string;
  moduleResolution?: string;
  strict?: boolean;
  noImplicitAny?: boolean;
  noUncheckedIndexedAccess?: boolean;
  verbatimModuleSyntax?: boolean;
  useUnknownInCatchVariables?: boolean;
  noPropertyAccessFromIndexSignature?: boolean;
  exactOptionalPropertyTypes?: boolean;
  isolatedModules?: boolean;
  skipLibCheck?: boolean;
  esModuleInterop?: boolean;
  resolveJsonModule?: boolean;
  suppressImplicitAnyIndexErrors?: boolean;
  noImplicitThis?: boolean;
  [key: string]: unknown;
}

export interface TsConfigShape {
  compilerOptions?: TsCompilerOptionsShape;
  include?: string[];
  exclude?: string[];
  references?: Array<{ path: string }>;
  [key: string]: unknown;
}

export const CANONICAL_TSCONFIG: TsConfigShape = {
  compilerOptions: {
    target: 'ESNext',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    noImplicitAny: true,
    noUncheckedIndexedAccess: true,
    verbatimModuleSyntax: true,
    useUnknownInCatchVariables: true,
    isolatedModules: true,
    skipLibCheck: true,
    esModuleInterop: true,
    resolveJsonModule: true
  },
  include: ['src/**/*', 'tests/**/*'],
  exclude: ['node_modules', 'dist', 'scratch']
};

export const MANDATORY_STRICT_OPTIONS: readonly (keyof TsCompilerOptionsShape)[] = [
  'strict',
  'noImplicitAny',
  'noUncheckedIndexedAccess',
  'verbatimModuleSyntax',
  'useUnknownInCatchVariables'
] as const;

export const VALID_MODULE_RESOLUTIONS = [
  'bundler',
  'node16',
  'nodenext'
] as const;

export const VALID_TARGETS = [
  'es2025',
  'esnext'
] as const;

export const BANNED_COMPILER_OPTIONS = [
  'suppressImplicitAnyIndexErrors'
] as const;

export const TSCONFIG_REQUIREMENT: AuditorConfigFileRequirement<TsConfigRuleId> = {
  id: 'tsconfig-config',
  file: 'tsconfig.json',
  candidateFiles: ['tsconfig.json'],
  description: 'Configuración estricta de compilador TypeScript',
  ruleId: 'tsconfig-missing',
  generateDefaultContent: () => JSON.stringify(CANONICAL_TSCONFIG, null, 2) + '\n'
};

export class ValidateTsconfigAuditor extends BaseAuditor<TsConfigRuleId> {
  constructor(
    rootsOrOptions?:
      | readonly string[]
      | (Partial<AuditorOptions<TsConfigRuleId>> & {
          projectRoot?: string;
          fix?: boolean;
          configFile?: string;
        }),
    maybeProjectRoot?: string
  ) {
    const optionsObj =
      rootsOrOptions && !Array.isArray(rootsOrOptions)
        ? (rootsOrOptions as Partial<AuditorOptions<TsConfigRuleId>> & {
            projectRoot?: string;
            fix?: boolean;
            configFile?: string;
          })
        : undefined;
    const projectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();

    const configRequirement: AuditorConfigFileRequirement<TsConfigRuleId> = {
      ...TSCONFIG_REQUIREMENT,
      ...(optionsObj?.configFile
        ? {
            file: optionsObj.configFile,
            candidateFiles: [optionsObj.configFile]
          }
        : {})
    };

    super({
      usesThirdPartyTool: false,
      ruleCapabilities: createUniformRuleCapabilities(TSCONFIG_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'priority',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      fixableRuleIds: [
        'tsconfig-missing',
        'tsconfig-missing-strict-compiler-option',
        'tsconfig-banned-option',
        'tsconfig-missing-source-include'
      ],
      configFiles: [configRequirement],
      id: 'validate_tsconfig',
      name: 'TypeScript Configuration Validator',
      description: 'Valida baseline estricto de tsconfig.json',
      icon: '📘',
      family: 'architecture',
      ruleIds: TSCONFIG_RULES,
      packageName: 'TSConfig',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      ruleDescriptions: {
        'tsconfig-missing': 'Archivo tsconfig.json ausente',
        'tsconfig-syntax': 'Error sintaxis tsconfig.json',
        'tsconfig-missing-strict-compiler-option': 'Falta opción estricta compiler',
        'tsconfig-banned-option': 'Opción prohibida en tsconfig',
        'tsconfig-missing-source-include': 'Include no cubre fuentes src'
      },
      ruleRemediations: {
        'tsconfig-missing':
          'Diagnóstico: El archivo tsconfig.json no existe en la raíz del proyecto.\n' +
          'Remediación: Ejecuta `auditor fix` o `npm run auditor:fix` para auto-scaffoldear ' +
          'la configuración canónica estricta de TypeScript.',
        'tsconfig-syntax':
          'Diagnóstico: El archivo tsconfig.json contiene errores de sintaxis JSON o caracteres inválidos.\n' +
          'Remediación: Inspecciona tsconfig.json, corrige comas sobrantes o comillas mal cerradas.',
        'tsconfig-missing-strict-compiler-option':
          'Diagnóstico: Se omitieron o degradaron opciones estrictas obligatorias (strict, noImplicitAny, noUncheckedIndexedAccess, target >= ES2025).\n' +
          'Remediación: Ejecuta `auditor fix` para reinyectar el baseline estricto o configúralas manualmente en compilerOptions.',
        'tsconfig-banned-option':
          'Diagnóstico: Se detectó una opción permisiva o prohibida (ej. suppressImplicitAnyIndexErrors, noImplicitThis: false).\n' +
          'Remediación: Ejecuta `auditor fix` para remover las opciones prohibidas y resolver los errores de tipado legítimamente.',
        'tsconfig-missing-source-include':
          'Diagnóstico: El arreglo include no abarca el directorio de código fuente principal (`src/**/*`).\n' +
          'Remediación: Agrega `"src/**/*"` al arreglo `include` en tsconfig.json o ejecuta `auditor fix`.'
      },
      coverage: {
        include: ['tsconfig*.json']
      },
      projectRoot,
      fix: optionsObj?.fix,
      ...optionsObj
    });
  }

  public override async runAudit(): Promise<void> {
    const isFix = this.isFixActive();
    let configFile: string | null = null;
    this.runSubAuditorSync('tsconfig-missing', () => {
      configFile = this.resolveConfigFile(TSCONFIG_REQUIREMENT);
    });

    if (!configFile) {
      const ensured = await this.runSubAuditor('tsconfig-missing', () =>
        this.ensureConfigFile(TSCONFIG_REQUIREMENT)
      );
      if (!ensured) {
        this.markRuleNotApplicable('tsconfig-syntax', 'Archivo tsconfig.json ausente');
        this.markRuleNotApplicable('tsconfig-missing-strict-compiler-option', 'Archivo tsconfig.json ausente');
        this.markRuleNotApplicable('tsconfig-banned-option', 'Archivo tsconfig.json ausente');
        this.markRuleNotApplicable('tsconfig-missing-source-include', 'Archivo tsconfig.json ausente');
        return;
      }
      configFile = ensured.resolvedPath;
    }

    const resolvedPath = configFile;

    const relPath = path.relative(this.projectRoot, resolvedPath) || TSCONFIG_REQUIREMENT.file;
    this.recordScanned(relPath);

    const extraTsconfigs: string[] = []; // no-domain: Discovered secondary tsconfig.*.json filenames
    try {
      for (const entry of fs.readdirSync(this.projectRoot)) {
        if (/^tsconfig\..+\.json$/.test(entry)) {
          this.recordScanned(entry);
          extraTsconfigs.push(entry);
        }
      }
    } catch {
      // catch-ok
    }

    let rawContent: string;
    try {
      rawContent = fs.readFileSync(resolvedPath, 'utf8');
    } catch {
      this.markRuleNotApplicable('tsconfig-syntax', 'No se pudo leer el archivo');
      this.markRuleNotApplicable('tsconfig-missing-strict-compiler-option', 'No se pudo leer el archivo');
      this.markRuleNotApplicable('tsconfig-banned-option', 'No se pudo leer el archivo');
      this.markRuleNotApplicable('tsconfig-missing-source-include', 'No se pudo leer el archivo');
      return;
    }

    let parsed: TsConfigShape | undefined;
    const extraParsed = new Map<string, TsConfigShape>();
    this.runSubAuditorSync('tsconfig-syntax', () => {
      const parseRes = ts.parseConfigFileTextToJson(relPath, rawContent);
      if (parseRes.error || !parseRes.config || typeof parseRes.config !== 'object') {
        this.addViolation({
          ruleId: 'tsconfig-syntax',
          severity: 'error',
          file: relPath,
          line: 1,
          message: `Error de sintaxis JSON en ${relPath}.`
        });
      } else {
        parsed = parseRes.config as TsConfigShape;
      }

      for (const extraFile of extraTsconfigs) {
        const extraFullPath = path.resolve(this.projectRoot, extraFile);
        try {
          const extraRaw = fs.readFileSync(extraFullPath, 'utf8');
          const extraRes = ts.parseConfigFileTextToJson(extraFile, extraRaw);
          if (extraRes.error || !extraRes.config || typeof extraRes.config !== 'object') {
            this.addViolation({
              ruleId: 'tsconfig-syntax',
              severity: 'error',
              file: extraFile,
              line: 1,
              message: `Error de sintaxis JSON en ${extraFile}.`
            });
          } else {
            extraParsed.set(extraFile, extraRes.config as TsConfigShape);
          }
        } catch {
          this.addViolation({
            ruleId: 'tsconfig-syntax',
            severity: 'error',
            file: extraFile,
            line: 1,
            message: `Error de sintaxis JSON en ${extraFile}.`
          });
        }
      }
    });

    if (!parsed) {
      this.markRuleNotApplicable('tsconfig-missing-strict-compiler-option', 'Sintaxis JSON inválida');
      this.markRuleNotApplicable('tsconfig-banned-option', 'Sintaxis JSON inválida');
      this.markRuleNotApplicable('tsconfig-missing-source-include', 'Sintaxis JSON inválida');
      return;
    }

    let modified = false;
    const parsedConfig = parsed;
    const compilerOptions = parsedConfig.compilerOptions ?? {};

    // 1. Check mandatory strict options
    this.runSubAuditorSync('tsconfig-missing-strict-compiler-option', () => {
      for (const opt of MANDATORY_STRICT_OPTIONS) {
        if (compilerOptions[opt] !== true) {
          if (isFix) {
            compilerOptions[opt] = true;
            modified = true;
          } else {
            this.addViolation({
              ruleId: 'tsconfig-missing-strict-compiler-option',
              severity: 'error',
              file: relPath,
              line: 1,
              message: `compilerOptions.${opt} debe ser true según el baseline estricto.`
            });
          }
        }
      }

      // Check moduleResolution
      const modRes = compilerOptions.moduleResolution
        ? String(compilerOptions.moduleResolution).toLowerCase()
        : '';
      const isVitePlusProject =
        fs.existsSync(path.resolve(this.projectRoot, 'vite.config.ts')) ||
        fs.existsSync(path.resolve(this.projectRoot, '.auditor/audit.config.ts'));

      if (isVitePlusProject && modRes !== 'bundler') {
        if (isFix) {
          compilerOptions.moduleResolution = 'bundler';
          compilerOptions.allowImportingTsExtensions = true;
          compilerOptions.noEmit = true;
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'tsconfig-missing-strict-compiler-option',
            severity: 'error',
            file: relPath,
            line: 1,
            message: `compilerOptions.moduleResolution debe ser "bundler" en proyectos con Vite+ para permitir imports TypeScript directos (.ts).`
          });
        }
      } else if (!VALID_MODULE_RESOLUTIONS.some((v) => v === modRes)) {
        if (isFix) {
          compilerOptions.moduleResolution = 'bundler';
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'tsconfig-missing-strict-compiler-option',
            severity: 'error',
            file: relPath,
            line: 1,
            message: `compilerOptions.moduleResolution debe ser "bundler", "node16" o "nodenext".`
          });
        }
      }

      // Check target (minimum ES2025 / ESNext standard for Node.js 26+)
      const targetOpt = compilerOptions.target
        ? String(compilerOptions.target).toLowerCase()
        : '';
      if (!VALID_TARGETS.some((v) => v === targetOpt)) {
        if (isFix) {
          compilerOptions.target = 'ES2025';
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'tsconfig-missing-strict-compiler-option',
            severity: 'error',
            file: relPath,
            line: 1,
            message: `compilerOptions.target debe ser "ES2025" o "ESNext" según el baseline estricto de Node 26+.`
          });
        }
      }
    });

    // 2. Check banned options
    this.runSubAuditorSync('tsconfig-banned-option', () => {
      for (const banned of BANNED_COMPILER_OPTIONS) {
        if (compilerOptions[banned] !== undefined) {
          if (isFix) {
            delete compilerOptions[banned];
            modified = true;
          } else {
            this.addViolation({
              ruleId: 'tsconfig-banned-option',
              severity: 'error',
              file: relPath,
              line: 1,
              message: `compilerOptions.${banned} está prohibida por el estándar de calidad.`
            });
          }
        }
      }

      if (compilerOptions.noImplicitThis === false) {
        if (isFix) {
          delete compilerOptions.noImplicitThis;
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'tsconfig-banned-option',
            severity: 'error',
            file: relPath,
            line: 1,
            message:
              'compilerOptions.noImplicitThis: false está prohibido. Debe ser true o eliminarse.'
          });
        }
      }

      for (const [extraFile, extraCfg] of extraParsed.entries()) {
        const extraOpts = extraCfg.compilerOptions ?? {};
        let extraModified = false;
        for (const banned of BANNED_COMPILER_OPTIONS) {
          if (extraOpts[banned] !== undefined) {
            if (isFix) {
              delete extraOpts[banned];
              extraModified = true;
            } else {
              this.addViolation({
                ruleId: 'tsconfig-banned-option',
                severity: 'error',
                file: extraFile,
                line: 1,
                message: `compilerOptions.${banned} está prohibida por el estándar de calidad.`
              });
            }
          }
        }
        if (isFix && extraModified) {
          extraCfg.compilerOptions = extraOpts;
          fs.writeFileSync(
            path.resolve(this.projectRoot, extraFile),
            JSON.stringify(extraCfg, null, 2) + '\n',
            'utf8'
          );
        }
      }
    });

    // 3. Check include covers src
    this.runSubAuditorSync('tsconfig-missing-source-include', () => {
      if (parsedConfig.include && Array.isArray(parsedConfig.include)) {
        const hasSrc = parsedConfig.include.some(
          (p) =>
            p === 'src' ||
            p.startsWith('src/') ||
            p === './src' ||
            p.startsWith('./src/')
        );
        if (!hasSrc) {
          if (isFix) {
            parsedConfig.include.unshift('src/**/*');
            modified = true;
          } else {
            this.addViolation({
              ruleId: 'tsconfig-missing-source-include',
              severity: 'error',
              file: relPath,
              line: 1,
              message: 'El arreglo include en tsconfig.json debe abarcar el directorio src/.'
            });
          }
        }

        if (isFix) {
          const deadLegacyConfigs = [
            'vitest.config.ts',
            'vitest.config.js',
            'vitest.config.mjs'
          ] as const;
          const filtered = parsedConfig.include.filter(
            (p) =>
              !deadLegacyConfigs.some((f) => f === p) ||
              fs.existsSync(path.resolve(this.projectRoot, p))
          );
          if (filtered.length !== parsedConfig.include.length) {
            parsedConfig.include = filtered;
            modified = true;
          }
        }
      } else if (parsedConfig.include !== undefined) {
        if (isFix) {
          parsedConfig.include = ['src/**/*', 'tests/**/*'];
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'tsconfig-missing-source-include',
            severity: 'error',
            file: relPath,
            line: 1,
            message: 'La propiedad include debe ser un arreglo de patrones.'
          });
        }
      }
    });

    if (isFix && modified) {
      parsedConfig.compilerOptions = compilerOptions;
      fs.writeFileSync(resolvedPath, JSON.stringify(parsedConfig, null, 2) + '\n', 'utf8');
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateTsconfigAuditor());
