/**
 * scripts/auditors/architecture/validate_fallow_config.ts
 *
 * FALLOW CONFIGURATION & EXPORTS HYGIENE AUDITOR (Node.js 26+)
 *
 * Enforces the integrity of .fallowrc.json:
 *   1. Prohibits banned blanket entry globs (e.g. src/components/**) that suppress dead code.
 *   2. Guarantees that 100% of files listed in ignoreExports actually exist on disk.
 *   3. Guarantees that 100% of symbols in ignoreExports are legitimately exported in their files.
 *   4. Flags duplicate entries and empty export lists.
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';

enableCompileCache();

export type FallowConfigRuleId =
  | 'fallow-config-missing'
  | 'fallow-config-syntax'
  | 'fallow-banned-entry-glob'
  | 'fallow-stale-file'
  | 'fallow-stale-export'
  | 'fallow-empty-export-list'
  | 'fallow-duplicate-entry';

export const FALLOW_CONFIG_RULES: readonly FallowConfigRuleId[] = [
  'fallow-config-missing',
  'fallow-config-syntax',
  'fallow-banned-entry-glob',
  'fallow-stale-file',
  'fallow-stale-export',
  'fallow-empty-export-list',
  'fallow-duplicate-entry'
] as const;

export const BANNED_ENTRY_GLOBS = [
  'src/components/**/*.vue',
  'src/views/**/*.vue',
  'src/components/**',
  'src/views/**'
] as const;

export function escapeRegExp(str: string): string {
  return RegExp.escape(str);
}

/**
 * Checks whether a symbol is exported from file content.
 */
export function isSymbolExportedInContent(content: string, symbol: string, isVue = false): boolean {
  if (symbol === 'default') {
    return /export\s+default\b/.test(content) || isVue;
  }

  const escaped = escapeRegExp(symbol);
  const wordRegex = new RegExp(`\\b${escaped}\\b`);
  if (!wordRegex.test(content)) return false;

  const exportRegex = new RegExp(
    `export\\s+(?:const|let|var|function|async\\s+function|type|interface|enum|class|abstract\\s+class)\\s+${escaped}\\b|` +
    `export\\s+(?:const|let|var)\\s+\\{[^}]*\\b${escaped}\\b|` +
    `export\\s+(?:const|let|var)\\s+\\[[^\\]]*\\b${escaped}\\b|` +
    `export\\s+(?:type\\s+)?\\{[^}]*\\b${escaped}\\b|` +
    `export\\s+\\*\\s+as\\s+${escaped}\\b`
  );
  return exportRegex.test(content);
}

export interface FallowIgnoreExportEntry {
  file: string;
  exports: string[];
}

export interface FallowConfigSchema {
  entry?: string[];
  ignorePatterns?: string[];
  ignoreExports?: FallowIgnoreExportEntry[];
  rules?: Record<string, string>;
}

export class ValidateFallowConfigAuditor extends BaseAuditor<FallowConfigRuleId> {
  private readonly configPath: string;

  constructor(targetPath?: string) {
    const isJsonFile = typeof targetPath === 'string' && targetPath.endsWith('.json');
    const projectRoot = isJsonFile ? path.dirname(targetPath) : (targetPath || process.cwd());

    super({
      id: 'validate_fallow_config',
      name: 'Fallow Configuration & Exports Hygiene Validator',
      description: 'Valida integridad de .fallowrc.json y sus ignoreExports',
      family: 'architecture',
      ruleIds: FALLOW_CONFIG_RULES,
      packageName: 'Fallow',
      ruleDescriptions: {
        'fallow-config-missing': 'Falta archivo .fallowrc.json',
        'fallow-config-syntax': 'JSON inválido en .fallowrc.json',
        'fallow-banned-entry-glob': 'Glob prohibido en entry',
        'fallow-stale-file': 'Archivo inexistente en config',
        'fallow-stale-export': 'Export inexistente en config',
        'fallow-empty-export-list': 'Entrada vacía en ignoreExports',
        'fallow-duplicate-entry': 'Entrada o export duplicado'
      },
      projectRoot
    });

    this.configPath = isJsonFile ? targetPath : path.resolve(projectRoot, '.fallowrc.json');
  }

  public override async runAudit(): Promise<void> {
    this.context.logStep(1, 3, 'Verificando existencia y sintaxis de .fallowrc.json...');

    if (!fs.existsSync(this.configPath)) {
      this.addViolation({
        ruleId: 'fallow-config-missing',
        severity: 'error',
        file: '.fallowrc.json',
        line: 1,
        message: 'No se encontró el archivo de configuración .fallowrc.json.',
        context: this.configPath
      });
      return;
    }

    let config: FallowConfigSchema;
    try {
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      config = JSON.parse(raw) as FallowConfigSchema;
    } catch (err) {
      this.addViolation({
        ruleId: 'fallow-config-syntax',
        severity: 'error',
        file: '.fallowrc.json',
        line: 1,
        message: `Error al parsear .fallowrc.json: ${(err as Error).message}`,
        context: '.fallowrc.json'
      });
      return;
    }

    this.context.logStep(2, 3, 'Validando puntos de entrada (entry) contra globs prohibidos...');
    if (Array.isArray(config.entry)) {
      for (let i = 0; i < config.entry.length; i++) {
        const pattern = config.entry[i]!;
        for (const banned of BANNED_ENTRY_GLOBS) {
          if (pattern === banned || pattern.startsWith(banned.replace(/\*.*$/, ''))) {
            this.addViolation({
              ruleId: 'fallow-banned-entry-glob',
              severity: 'error',
              file: '.fallowrc.json',
              line: i + 1,
              message: `Patrón entry prohibido '${pattern}' detectado. Oculta componentes o vistas muertas.`,
              context: pattern
            });
          }
        }
      }
    }

    this.context.logStep(3, 3, 'Validando existencia real de archivos y exports en ignoreExports...');
    const ignoreExports = config.ignoreExports;
    if (!Array.isArray(ignoreExports)) {
      this.context.setMetric('Archivos en ignoreExports', 0);
      this.context.setMetric('Exports Validados', 0);
      return;
    }

    const seenFiles = new Set<string>();
    let totalExports = 0;
    this.filesScannedCount = ignoreExports.length;

    for (let entryIdx = 0; entryIdx < ignoreExports.length; entryIdx++) {
      const entry = ignoreExports[entryIdx]!;
      const relFile = entry.file;

      if (seenFiles.has(relFile)) {
        this.addViolation({
          ruleId: 'fallow-duplicate-entry',
          severity: 'error',
          file: '.fallowrc.json',
          line: entryIdx + 1,
          message: `Archivo duplicado en ignoreExports: '${relFile}'.`,
          context: relFile
        });
      }
      seenFiles.add(relFile);

      if (!Array.isArray(entry.exports) || entry.exports.length === 0) {
        this.addViolation({
          ruleId: 'fallow-empty-export-list',
          severity: 'error',
          file: '.fallowrc.json',
          line: entryIdx + 1,
          message: `Entrada para '${relFile}' no declara ningún export en su array de exports.`,
          context: relFile
        });
        continue;
      }

      const fullFilePath = path.resolve(this.projectRoot, relFile);
      if (!fs.existsSync(fullFilePath)) {
        this.addViolation({
          ruleId: 'fallow-stale-file',
          severity: 'error',
          file: '.fallowrc.json',
          line: entryIdx + 1,
          message: `Archivo '${relFile}' declarado en ignoreExports no existe en el disco.`,
          context: relFile
        });
        continue;
      }

      let content: string;
      try {
        content = fs.readFileSync(fullFilePath, 'utf-8');
      } catch (err) {
        this.addViolation({
          ruleId: 'fallow-stale-file',
          severity: 'error',
          file: '.fallowrc.json',
          line: entryIdx + 1,
          message: `No se pudo leer el archivo '${relFile}': ${(err as Error).message}`,
          context: relFile
        });
        continue;
      }

      const isVue = relFile.endsWith('.vue');
      const seenExportsInFile = new Set<string>();

      for (const exp of entry.exports) {
        totalExports++;
        if (seenExportsInFile.has(exp)) {
          this.addViolation({
            ruleId: 'fallow-duplicate-entry',
            severity: 'error',
            file: '.fallowrc.json',
            line: entryIdx + 1,
            message: `Export duplicado '${exp}' en '${relFile}'.`,
            context: `${relFile} -> ${exp}`
          });
        }
        seenExportsInFile.add(exp);

        if (!isSymbolExportedInContent(content, exp, isVue)) {
          this.addViolation({
            ruleId: 'fallow-stale-export',
            severity: 'error',
            file: '.fallowrc.json',
            line: entryIdx + 1,
            message: `El símbolo '${exp}' no se encuentra exportado en el archivo real '${relFile}'.`,
            context: `${relFile} -> ${exp}`
          });
        }
      }
    }

    this.context.setMetric('Archivos en ignoreExports', seenFiles.size);
    this.context.setMetric('Exports Validados', totalExports);
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new ValidateFallowConfigAuditor());
}
