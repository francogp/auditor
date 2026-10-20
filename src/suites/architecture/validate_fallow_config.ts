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
import { execSync } from 'node:child_process';
import { enableCompileCache } from 'node:module';
import { BaseAuditor,
  createUniformRemediationPhases, createRuleCapabilities } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { toPosixRelative } from '../../core/safePath.ts';
import type { AuditorConfigFileRequirement } from '../../core/auditContract.ts';

enableCompileCache();

export type FallowConfigRuleId =
  | 'fallow-config-missing'
  | 'fallow-config-syntax'
  | 'fallow-banned-entry-glob'
  | 'fallow-stale-file'
  | 'fallow-stale-export'
  | 'fallow-empty-export-list'
  | 'fallow-duplicate-entry'
  | 'fallow-config-workspace-diagnostic';

export const FALLOW_CONFIG_RULES: readonly FallowConfigRuleId[] = [
  'fallow-config-missing',
  'fallow-config-syntax',
  'fallow-banned-entry-glob',
  'fallow-stale-file',
  'fallow-stale-export',
  'fallow-empty-export-list',
  'fallow-duplicate-entry',
  'fallow-config-workspace-diagnostic'
] as const;

export function getBannedEntryGlobs(projectRoot?: string): readonly string[] {
  const config = getAuditConfig(projectRoot);
  const globs: string[] = [];
  const compRoots = config.paths.componentsRoots ?? [];
  const viewRoots = config.paths.viewsRoots ?? [];
  for (const c of compRoots) {
    globs.push(`${c}/**/*.vue`, `${c}/**`);
  }
  for (const v of viewRoots) {
    globs.push(`${v}/**/*.vue`, `${v}/**`);
  }
  return globs;
}

export const BANNED_ENTRY_GLOBS: readonly string[] = getBannedEntryGlobs();

export const escapeRegExp = (s: string): string => RegExp.escape(s);

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
  $schema?: string;
  entry?: string[];
  ignorePatterns?: string[];
  ignoreExports?: FallowIgnoreExportEntry[];
  rules?: Record<string, string>;
  typeAware?: boolean;
  duplicates?: {
    mode?: string;
    nearMiss?: boolean;
    minTokens?: number;
    minLines?: number;
    minOccurrences?: number;
  };
  viz?: {
    enabled?: boolean;
    outputPath?: string;
  };
  health?: {
    maxCrap?: number;
  };
}

export function createDefaultFallowConfigContent(): string {
  return (
    JSON.stringify(
      {
        $schema: 'https://fallow.tools/schema/config.json',
        entry: ['src/index.ts'],
        ignorePatterns: ['dist/**', 'scratch/**', 'tests/**'],
        typeAware: true,
        duplicates: {
          nearMiss: true,
          mode: 'strict'
        },
        health: {
          maxCrap: 0
        }
      },
      null,
      2
    ) + '\n'
  );
}

function loadFallowConfig(
  configPath: string,
  auditor: ValidateFallowConfigAuditor
): FallowConfigSchema | null {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as FallowConfigSchema;
  } catch (err) {
    auditor.addViolation({
      ruleId: 'fallow-config-syntax',
      severity: 'error',
      file: '.fallowrc.json',
      line: 1,
      message: `Error al parsear .fallowrc.json: ${(err as Error).message}`,
      context: '.fallowrc.json'
    });
    return null;
  }
}

function validateFallowEntries(
  config: FallowConfigSchema,
  bannedGlobs: readonly string[],
  auditor: ValidateFallowConfigAuditor
): boolean {
  if (!Array.isArray(config.entry)) return false;
  let modified = false;
  const keptEntries: string[] = [];
  for (let i = 0; i < config.entry.length; i++) {
    const pattern = config.entry[i]!;
    let isBanned = false;
    for (const banned of bannedGlobs) {
      if (pattern === banned || pattern.startsWith(banned.replace(/\*.*$/, ''))) {
        isBanned = true;
        if (auditor.isFixActive()) {
          modified = true;
        } else {
          auditor.addViolation({
            ruleId: 'fallow-banned-entry-glob',
            severity: 'error',
            file: '.fallowrc.json',
            line: i + 1,
            message: `Patrón entry prohibido '${pattern}' detectado. Oculta componentes o vistas muertas.`,
            context: pattern,
            fixable: true
          });
        }
      }
    }
    if (!isBanned) {
      keptEntries.push(pattern);
    }
  }
  if (modified) {
    config.entry = keptEntries.length > 0 ? keptEntries : ['src/index.ts'];
  }
  return modified;
}

function validateExportSymbols(params: {
  entry: FallowIgnoreExportEntry;
  content: string;
  relFile: string;
  isVue: boolean;
  lineNum: number;
  auditor: ValidateFallowConfigAuditor;
}): { exportCount: number; modified: boolean } {
  const seenExportsInFile = new Set<string>();
  const keptExports: string[] = []; // no-domain: Dynamic AST exported identifier list
  let exportCount = 0;
  let modified = false;

  for (const exp of params.entry.exports) {
    exportCount++;
    const isDup = seenExportsInFile.has(exp);
    if (isDup) {
      if (params.auditor.isFixActive()) {
        modified = true;
      } else {
        params.auditor.addViolation({
          ruleId: 'fallow-duplicate-entry',
          severity: 'error',
          file: '.fallowrc.json',
          line: params.lineNum,
          message: `Export duplicado '${exp}' en '${params.relFile}'.`,
          context: `${params.relFile} -> ${exp}`,
          fixable: true
        });
      }
    }
    seenExportsInFile.add(exp);

    const isStale = !isSymbolExportedInContent(params.content, exp, params.isVue);
    if (isStale) {
      if (params.auditor.isFixActive()) {
        modified = true;
      } else {
        params.auditor.addViolation({
          ruleId: 'fallow-stale-export',
          severity: 'error',
          file: '.fallowrc.json',
          line: params.lineNum,
          message: `El símbolo '${exp}' no se encuentra exportado en el archivo real '${params.relFile}'.`,
          context: `${params.relFile} -> ${exp}`,
          fixable: true
        });
      }
    }

    if (!isDup && !isStale) {
      keptExports.push(exp);
    }
  }

  if (modified) {
    params.entry.exports = keptExports;
  }

  return { exportCount: modified ? keptExports.length : exportCount, modified };
}

function validateSingleIgnoreEntry(params: {
  entry: FallowIgnoreExportEntry;
  lineNum: number;
  projectRoot: string;
  seenFiles: Set<string>;
  auditor: ValidateFallowConfigAuditor;
}): { symbolCount: number; keepEntry: boolean; modified: boolean } {
  const { entry, lineNum, projectRoot, seenFiles, auditor } = params;
  const relFile = entry.file;
  let isDuplicateFile = false;
  let modified = false;

  auditor.runSubAuditorSync('fallow-duplicate-entry', () => {
    if (seenFiles.has(relFile)) {
      isDuplicateFile = true;
      if (auditor.isFixActive()) {
        modified = true;
      } else {
        auditor.addViolation({
          ruleId: 'fallow-duplicate-entry',
          severity: 'error',
          file: '.fallowrc.json',
          line: lineNum,
          message: `Archivo duplicado en ignoreExports: '${relFile}'.`,
          context: relFile,
          fixable: true
        });
      }
    }
  });
  seenFiles.add(relFile);
  if (isDuplicateFile && auditor.isFixActive()) {
    return { symbolCount: 0, keepEntry: false, modified: true };
  }

  let hasEmptyList = false;
  auditor.runSubAuditorSync('fallow-empty-export-list', () => {
    if (!Array.isArray(entry.exports) || entry.exports.length === 0) {
      hasEmptyList = true;
      if (auditor.isFixActive()) {
        modified = true;
      } else {
        auditor.addViolation({
          ruleId: 'fallow-empty-export-list',
          severity: 'error',
          file: '.fallowrc.json',
          line: lineNum,
          message: `Entrada para '${relFile}' no declara ningún export en su array de exports.`,
          context: relFile,
          fixable: true
        });
      }
    }
  });
  if (hasEmptyList) {
    return { symbolCount: 0, keepEntry: !auditor.isFixActive(), modified };
  }

  const fullFilePath = path.resolve(projectRoot, relFile);
  let isStale = false;
  auditor.runSubAuditorSync('fallow-stale-file', () => {
    if (!fs.existsSync(fullFilePath)) {
      isStale = true;
      if (auditor.isFixActive()) {
        modified = true;
      } else {
        auditor.addViolation({
          ruleId: 'fallow-stale-file',
          severity: 'error',
          file: '.fallowrc.json',
          line: lineNum,
          message: `Archivo '${relFile}' declarado en ignoreExports no existe en el disco.`,
          context: relFile,
          fixable: true
        });
      }
    }
  });
  if (isStale) {
    return { symbolCount: 0, keepEntry: !auditor.isFixActive(), modified };
  }

  let symbolCount = 0;
  let keepEntry = true;
  auditor.runSubAuditorSync('fallow-stale-export', () => {
    let content: string;
    try {
      content = fs.readFileSync(fullFilePath, 'utf-8');
    } catch (err) {
      if (auditor.isFixActive()) {
        modified = true;
        keepEntry = false;
      } else {
        auditor.addViolation({
          ruleId: 'fallow-stale-file',
          severity: 'error',
          file: '.fallowrc.json',
          line: lineNum,
          message: `No se pudo leer el archivo '${relFile}': ${(err as Error).message}`,
          context: relFile,
          fixable: true
        });
      }
      return;
    }

    const res = validateExportSymbols({
      entry,
      content,
      relFile,
      isVue: relFile.endsWith('.vue'),
      lineNum,
      auditor
    });
    symbolCount = res.exportCount;
    if (res.modified) {
      modified = true;
      if (entry.exports.length === 0) {
        keepEntry = false;
      }
    }
  });

  return { symbolCount, keepEntry, modified };
}

function validateFallowIgnoreExports(
  config: FallowConfigSchema,
  projectRoot: string,
  auditor: ValidateFallowConfigAuditor
): { fileCount: number; exportCount: number; modified: boolean } {
  if (!Array.isArray(config.ignoreExports)) {
    return { fileCount: 0, exportCount: 0, modified: false };
  }

  const seenFiles = new Set<string>();
  const keptEntries: FallowIgnoreExportEntry[] = [];
  let totalExports = 0;
  let modified = false;

  for (let entryIdx = 0; entryIdx < config.ignoreExports.length; entryIdx++) {
    const entry = config.ignoreExports[entryIdx]!;
    const res = validateSingleIgnoreEntry({
      entry,
      lineNum: entryIdx + 1,
      projectRoot,
      seenFiles,
      auditor
    });
    totalExports += res.symbolCount;
    if (res.modified) modified = true;
    if (res.keepEntry) {
      keptEntries.push(entry);
    }
  }

  if (modified) {
    if (keptEntries.length > 0) {
      config.ignoreExports = keptEntries;
    } else {
      delete config.ignoreExports;
    }
  }

  return {
    fileCount: modified ? keptEntries.length : seenFiles.size,
    exportCount: totalExports,
    modified
  };
}

export interface FallowWorkspaceDiagnosticItem {
  readonly path?: string;
  readonly kind?: string;
  readonly message?: string;
}

export function validateFallowWorkspaceDiagnostics(
  diagnostics: readonly FallowWorkspaceDiagnosticItem[] | undefined,
  auditor: ValidateFallowConfigAuditor
): void {
  if (!Array.isArray(diagnostics)) return;
  for (const d of diagnostics) {
    if (d.kind === 'boundaries-not-configured' || d.kind === 'rule-packs-not-configured') {
      continue;
    }
    auditor.addViolation({
      ruleId: 'fallow-config-workspace-diagnostic',
      severity: 'error',
      file: d.path && d.path !== '.' ? d.path : '.fallowrc.json',
      line: 1,
      message: `Diagnóstico de workspace (Fallow): [${d.kind || 'diagnostic'}] ${d.message || ''}`,
      context: d.kind || 'workspace_diagnostic'
    });
  }
}

export interface ValidateFallowConfigOptions {
  readonly projectRoot?: string;
  readonly configFile?: string;
  readonly fix?: boolean;
}

export const FALLOW_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<FallowConfigRuleId> = {
  id: 'fallow-config',
  file: '.fallowrc.json',
  description: 'Configuración de Fallow y control de exports',
  ruleId: 'fallow-config-missing',
  generateDefaultContent: () => createDefaultFallowConfigContent()
};

export class ValidateFallowConfigAuditor extends BaseAuditor<FallowConfigRuleId> {
  constructor(targetPathOrOptions?: string | ValidateFallowConfigOptions) {
    let projectRoot: string;
    let configPath: string;
    let fix = false;

    if (typeof targetPathOrOptions === 'object' && targetPathOrOptions !== null) {
      projectRoot = targetPathOrOptions.projectRoot || process.cwd();
      configPath = targetPathOrOptions.configFile
        ? path.resolve(projectRoot, targetPathOrOptions.configFile)
        : path.resolve(projectRoot, '.fallowrc.json');
      fix = Boolean(targetPathOrOptions.fix);
    } else {
      const isJsonFile =
        typeof targetPathOrOptions === 'string' && targetPathOrOptions.endsWith('.json');
      projectRoot = isJsonFile
        ? path.dirname(targetPathOrOptions)
        : targetPathOrOptions || process.cwd();
      configPath = isJsonFile ? targetPathOrOptions : path.resolve(projectRoot, '.fallowrc.json');
    }

    const relConfig = toPosixRelative(projectRoot, configPath) || '.fallowrc.json';
    const configRequirement: AuditorConfigFileRequirement<FallowConfigRuleId> = {
      ...FALLOW_CONFIG_REQUIREMENT,
      file: relConfig,
      candidateFiles: [relConfig]
    };

    super({
      usesThirdPartyTool: true,
      requiredPermissions: ['--allow-child-process'],
      thirdPartyToolPolicy: {
        toolName: 'Fallow',
        fallbackBehavior: 'violation',
        fallbackRuleId: 'fallow-config-workspace-diagnostic'
      },
      ruleCapabilities: createRuleCapabilities(
        FALLOW_CONFIG_RULES,
        {
          speed: 'light',
          phase: 'setup',
          fix: 'priority',
          md: false,
          ast: false,
          changedOnly: false,
          critical: false
        },
        [
          'fallow-config-missing',
          'fallow-banned-entry-glob',
          'fallow-stale-file',
          'fallow-stale-export',
          'fallow-empty-export-list',
          'fallow-duplicate-entry'
        ]
      ),
      fixableRuleIds: [
        'fallow-config-missing',
        'fallow-banned-entry-glob',
        'fallow-stale-file',
        'fallow-stale-export',
        'fallow-empty-export-list',
        'fallow-duplicate-entry'
      ],
      configFiles: [configRequirement],
      fix,
      id: 'validate_fallow_config',
      name: 'Fallow Configuration & Exports Hygiene Validator',
      description: 'Valida integridad de .fallowrc.json y sus ignoreExports',
      family: 'architecture',
      ruleIds: FALLOW_CONFIG_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(FALLOW_CONFIG_RULES, 'setup'),
      packageName: 'Fallow',
      configKey: 'fallow.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '🌾',
      ruleDescriptions: {
        'fallow-config-missing': 'Falta archivo .fallowrc.json',
        'fallow-config-syntax': 'JSON inválido en .fallowrc.json',
        'fallow-banned-entry-glob': 'Glob prohibido en entry',
        'fallow-stale-file': 'Archivo inexistente en config',
        'fallow-stale-export': 'Export inexistente en config',
        'fallow-empty-export-list': 'Entrada vacía en ignoreExports',
        'fallow-duplicate-entry': 'Entrada o export duplicado',
        'fallow-config-workspace-diagnostic': 'Diagnóstico de workspace'
      },
      ruleRemediations: {
        'fallow-config-missing':
          'Causa Raíz:\n' +
          'El archivo .fallowrc.json no existe en la raíz del proyecto.\n' +
          'Fallow requiere este archivo para mapear los puntos de entrada canónicos y las excepciones legítimas de código muerto.\n\n' +
          'Diagnóstico:\n' +
          'Verifica si existe el archivo .fallowrc.json en la raíz del repositorio.\n\n' +
          'Solución Canónica:\n' +
          'Ejecuta "npm run auditor:fix" o "auditor fix". El framework generará automáticamente la configuración canónica con los puntos de entrada detectados.',
        'fallow-config-syntax':
          'Causa Raíz:\n' +
          'El archivo .fallowrc.json contiene un error de sintaxis JSON (comas de más, comillas sin cerrar o formato corrupto).\n\n' +
          'Diagnóstico:\n' +
          'Revisa el mensaje de error del parser JSON para ubicar la línea del defecto.\n\n' +
          'Solución Canónica:\n' +
          'Abre .fallowrc.json y corrige el error de formato utilizando un linter JSON o formateador de código.',
        'fallow-banned-entry-glob':
          'Causa Raíz:\n' +
          'Se declaró un patrón de entrada (entry) prohibido en .fallowrc.json (como comodines masivos "src/components/**/*" o "src/views/**/*").\n' +
          'Declarar árboles completos de componentes como puntos de entrada enmascara código huérfano y vistas muertas, impidiendo que Fallow detecte archivos no enlazados en el árbol de dependencias.\n\n' +
          'Diagnóstico:\n' +
          'Examina el array "entry" en .fallowrc.json.\n\n' +
          'Solución Canónica:\n' +
          '1. Ejecuta "npm run auditor:fix" para purgar los globs prohibidos automáticamente.\n' +
          '2. Mantén únicamente los puntos de entrada raíz auténticos (ej. "src/main.ts", "src/index.ts").',
        'fallow-stale-file':
          'Causa Raíz:\n' +
          'Una entrada en "ignoreExports" referencia un archivo que ya fue eliminado, movido o renombrado en el disco.\n\n' +
          'Diagnóstico:\n' +
          'El mensaje de la advertencia detalla la ruta del archivo que no se encuentra en el sistema de archivos.\n\n' +
          'Solución Canónica:\n' +
          'Ejecuta "npm run auditor:fix" o "auditor fix". El auditor eliminará automáticamente todas las entradas obsoletas de .fallowrc.json.',
        'fallow-stale-export':
          'Causa Raíz:\n' +
          'Un símbolo declarado en el array "exports" de una entrada en "ignoreExports" ya no se encuentra exportado en el archivo fuente correspondiente.\n\n' +
          'Diagnóstico:\n' +
          'Comprueba el archivo fuente: el símbolo fue renombrado o eliminado de las sentencias export.\n\n' +
          'Solución Canónica:\n' +
          'Ejecuta "npm run auditor:fix" para sincronizar y eliminar los nombres de símbolos caducados.',
        'fallow-empty-export-list':
          'Causa Raíz:\n' +
          'Una entrada de archivo en "ignoreExports" tiene un array de exports vacío ("exports": []).\n\n' +
          'Diagnóstico:\n' +
          'Revisa las entradas en .fallowrc.json donde no se declaró ningún símbolo.\n\n' +
          'Solución Canónica:\n' +
          'Ejecuta "npm run auditor:fix" para eliminar la entrada innecesaria.',
        'fallow-duplicate-entry':
          'Causa Raíz:\n' +
          'El mismo archivo o símbolo está repetido más de una vez dentro de .fallowrc.json.\n\n' +
          'Diagnóstico:\n' +
          'El mensaje indica la entrada duplicada.\n\n' +
          'Solución Canónica:\n' +
          'Ejecuta "npm run auditor:fix" para deduplicar automáticamente las entradas y símbolos.',
        'fallow-config-workspace-diagnostic':
          'Causa Raíz:\n' +
          'El analizador Fallow emitió un diagnóstico a nivel de espacio de trabajo o configuración de límites arquitectónicos.\n\n' +
          'Diagnóstico:\n' +
          'Inspecciona el mensaje emitido por el motor de Fallow en el reporte.\n\n' +
          'Solución Canónica:\n' +
          'Ajusta la configuración de paquetes o límites en .fallowrc.json de acuerdo a la recomendación del motor.'
      },
      coverage: {
        include: ['.fallowrc.json']
      },
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const requirement = this.configFiles[0] ?? FALLOW_CONFIG_REQUIREMENT;
    const ensured = await this.runSubAuditor('fallow-config-missing', async () => {
      return await this.ensureConfigFile(requirement);
    });
    if (!ensured) return;

    const resolvedPath = ensured.resolvedPath;
    const config = this.runSubAuditorSync('fallow-config-syntax', () => {
      return loadFallowConfig(resolvedPath, this);
    });
    if (!config) return;

    const validConfig: FallowConfigSchema = config;
    this.recordScanned('.fallowrc.json');
    let modified = false;

    this.runSubAuditorSync('fallow-banned-entry-glob', () => {
      const bannedGlobs = getBannedEntryGlobs(this.projectRoot);
      if (validateFallowEntries(validConfig, bannedGlobs, this)) {
        modified = true;
      }
    });

    if (!Array.isArray(validConfig.ignoreExports) || validConfig.ignoreExports.length === 0) {
      this.markRuleNotApplicable('fallow-duplicate-entry', 'Sin ignoreExports en .fallowrc.json');
      this.markRuleNotApplicable('fallow-empty-export-list', 'Sin ignoreExports en .fallowrc.json');
      this.markRuleNotApplicable('fallow-stale-file', 'Sin ignoreExports en .fallowrc.json');
      this.markRuleNotApplicable('fallow-stale-export', 'Sin ignoreExports en .fallowrc.json');
    } else {
      const { fileCount, exportCount, modified: ignoreModified } = validateFallowIgnoreExports(
        validConfig,
        this.projectRoot,
        this
      );
      if (ignoreModified) modified = true;

      this.context.setMetric('Archivos en ignoreExports', fileCount);
      this.context.setMetric('Exports Validados', exportCount);
    }

    if (modified && this.isFixActive()) {
      fs.writeFileSync(resolvedPath, JSON.stringify(validConfig, null, 2) + '\n', 'utf-8');
    }

    this.runSubAuditorSync('fallow-config-workspace-diagnostic', () => {
      try {
        const candidates = [
          path.resolve(this.projectRoot, 'node_modules/fallow/bin/fallow'),
          path.resolve(process.cwd(), 'node_modules/fallow/bin/fallow')
        ];
        const fallowBin = candidates.find((c) => fs.existsSync(c));
        if (fallowBin) {
          const stdout = execSync(
            `node "${fallowBin}" list --workspaces --format json --root "${this.projectRoot}"`,
            {
              encoding: 'utf8',
              stdio: ['pipe', 'pipe', 'ignore'],
              timeout: 10000
            }
          );
          const parsed = JSON.parse(stdout) as {
            workspace_diagnostics?: FallowWorkspaceDiagnosticItem[];
          };
          validateFallowWorkspaceDiagnostics(parsed.workspace_diagnostics, this);
        }
      } catch {
        // catch-ok: Fallow execution might not be available in non-standard test sandboxes
      }
    });
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateFallowConfigAuditor());
