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
import { BaseAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';

enableCompileCache();

export type FallowConfigRuleId =
  | 'fallow-config-missing'
  | 'fallow-config-syntax'
  | 'fallow-banned-entry-glob'
  | 'fallow-stale-file'
  | 'fallow-stale-export'
  | 'fallow-empty-export-list'
  | 'fallow-duplicate-entry'
  | 'fallow-workspace-diagnostic';

export const FALLOW_CONFIG_RULES: readonly FallowConfigRuleId[] = [
  'fallow-config-missing',
  'fallow-config-syntax',
  'fallow-banned-entry-glob',
  'fallow-stale-file',
  'fallow-stale-export',
  'fallow-empty-export-list',
  'fallow-duplicate-entry',
  'fallow-workspace-diagnostic'
] as const;

export function getBannedEntryGlobs(projectRoot?: string): readonly string[] {
  const config = getAuditConfig(projectRoot);
  const globs: string[] = [];
  const compRoots = config.paths.componentsRoots ?? ['src/components'];
  const viewRoots = config.paths.viewsRoots ?? ['src/views'];
  for (const c of compRoots) {
    globs.push(`${c}/**/*.vue`, `${c}/**`);
  }
  for (const v of viewRoots) {
    globs.push(`${v}/**/*.vue`, `${v}/**`);
  }
  return globs;
}

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

function loadFallowConfig(configPath: string, auditor: ValidateFallowConfigAuditor): FallowConfigSchema | null {
  if (!fs.existsSync(configPath)) {
    auditor.addViolation({
      ruleId: 'fallow-config-missing',
      severity: 'error',
      file: '.fallowrc.json',
      line: 1,
      message: 'No se encontró el archivo de configuración .fallowrc.json.',
      context: configPath
    });
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
  entries: readonly string[] | undefined,
  bannedGlobs: readonly string[],
  auditor: ValidateFallowConfigAuditor
): void {
  if (!Array.isArray(entries)) return;
  for (let i = 0; i < entries.length; i++) {
    const pattern = entries[i]!;
    for (const banned of bannedGlobs) {
      if (pattern === banned || pattern.startsWith(banned.replace(/\*.*$/, ''))) {
        auditor.addViolation({
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

function validateExportSymbols(params: {
  exports: readonly string[];
  content: string;
  relFile: string;
  isVue: boolean;
  lineNum: number;
  auditor: ValidateFallowConfigAuditor;
}): number {
  const seenExportsInFile = new Set<string>();
  let exportCount = 0;

  for (const exp of params.exports) {
    exportCount++;
    if (seenExportsInFile.has(exp)) {
      params.auditor.addViolation({
        ruleId: 'fallow-duplicate-entry',
        severity: 'error',
        file: '.fallowrc.json',
        line: params.lineNum,
        message: `Export duplicado '${exp}' en '${params.relFile}'.`,
        context: `${params.relFile} -> ${exp}`
      });
    }
    seenExportsInFile.add(exp);

    if (!isSymbolExportedInContent(params.content, exp, params.isVue)) {
      params.auditor.addViolation({
        ruleId: 'fallow-stale-export',
        severity: 'error',
        file: '.fallowrc.json',
        line: params.lineNum,
        message: `El símbolo '${exp}' no se encuentra exportado en el archivo real '${params.relFile}'.`,
        context: `${params.relFile} -> ${exp}`
      });
    }
  }

  return exportCount;
}

function validateSingleIgnoreEntry(params: {
  entry: FallowIgnoreExportEntry;
  lineNum: number;
  projectRoot: string;
  seenFiles: Set<string>;
  auditor: ValidateFallowConfigAuditor;
}): number {
  const { entry, lineNum, projectRoot, seenFiles, auditor } = params;
  const relFile = entry.file;

  if (seenFiles.has(relFile)) {
    auditor.addViolation({
      ruleId: 'fallow-duplicate-entry',
      severity: 'error',
      file: '.fallowrc.json',
      line: lineNum,
      message: `Archivo duplicado en ignoreExports: '${relFile}'.`,
      context: relFile
    });
  }
  seenFiles.add(relFile);

  if (!Array.isArray(entry.exports) || entry.exports.length === 0) {
    auditor.addViolation({
      ruleId: 'fallow-empty-export-list',
      severity: 'error',
      file: '.fallowrc.json',
      line: lineNum,
      message: `Entrada para '${relFile}' no declara ningún export en su array de exports.`,
      context: relFile
    });
    return 0;
  }

  const fullFilePath = path.resolve(projectRoot, relFile);
  if (!fs.existsSync(fullFilePath)) {
    auditor.addViolation({
      ruleId: 'fallow-stale-file',
      severity: 'error',
      file: '.fallowrc.json',
      line: lineNum,
      message: `Archivo '${relFile}' declarado en ignoreExports no existe en el disco.`,
      context: relFile
    });
    return 0;
  }

  let content: string;
  try {
    content = fs.readFileSync(fullFilePath, 'utf-8');
  } catch (err) {
    auditor.addViolation({
      ruleId: 'fallow-stale-file',
      severity: 'error',
      file: '.fallowrc.json',
      line: lineNum,
      message: `No se pudo leer el archivo '${relFile}': ${(err as Error).message}`,
      context: relFile
    });
    return 0;
  }

  return validateExportSymbols({
    exports: entry.exports,
    content,
    relFile,
    isVue: relFile.endsWith('.vue'),
    lineNum,
    auditor
  });
}

function validateFallowIgnoreExports(
  ignoreExports: readonly FallowIgnoreExportEntry[] | undefined,
  projectRoot: string,
  auditor: ValidateFallowConfigAuditor
): { fileCount: number; exportCount: number } {
  if (!Array.isArray(ignoreExports)) {
    return { fileCount: 0, exportCount: 0 };
  }

  const seenFiles = new Set<string>();
  let totalExports = 0;

  for (let entryIdx = 0; entryIdx < ignoreExports.length; entryIdx++) {
    const entry = ignoreExports[entryIdx]!;
    totalExports += validateSingleIgnoreEntry({
      entry,
      lineNum: entryIdx + 1,
      projectRoot,
      seenFiles,
      auditor
    });
  }

  return { fileCount: seenFiles.size, exportCount: totalExports };
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
      ruleId: 'fallow-workspace-diagnostic',
      severity: 'error',
      file: d.path && d.path !== '.' ? d.path : '.fallowrc.json',
      line: 1,
      message: `Diagnóstico de workspace (Fallow): [${d.kind || 'diagnostic'}] ${d.message || ''}`,
      context: d.kind || 'workspace_diagnostic'
    });
  }
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
      icon: '🌾',
      ruleDescriptions: {
        'fallow-config-missing': 'Falta archivo .fallowrc.json',
        'fallow-config-syntax': 'JSON inválido en .fallowrc.json',
        'fallow-banned-entry-glob': 'Glob prohibido en entry',
        'fallow-stale-file': 'Archivo inexistente en config',
        'fallow-stale-export': 'Export inexistente en config',
        'fallow-empty-export-list': 'Entrada vacía en ignoreExports',
        'fallow-duplicate-entry': 'Entrada o export duplicado',
        'fallow-workspace-diagnostic': 'Diagnóstico de workspace'
      },
      coverage: {
        include: ['.fallowrc.json']
      },
      projectRoot
    });

    this.configPath = isJsonFile ? targetPath : path.resolve(projectRoot, '.fallowrc.json');
  }

  public override async runAudit(): Promise<void> {
    this.markRuleEvaluated('fallow-config-missing');
    const config = loadFallowConfig(this.configPath, this);
    if (!config) return;

    this.recordScanned('.fallowrc.json');
    this.markRuleEvaluated('fallow-config-syntax');
    this.markRuleEvaluated('fallow-banned-entry-glob');
    this.markRuleEvaluated('fallow-stale-file');
    this.markRuleEvaluated('fallow-stale-export');
    this.markRuleEvaluated('fallow-empty-export-list');
    this.markRuleEvaluated('fallow-duplicate-entry');
    this.markRuleEvaluated('fallow-workspace-diagnostic');

    const bannedGlobs = getBannedEntryGlobs(this.projectRoot);
    validateFallowEntries(config.entry, bannedGlobs, this);

    const { fileCount, exportCount } = validateFallowIgnoreExports(config.ignoreExports, this.projectRoot, this);

    this.context.setMetric('Archivos en ignoreExports', fileCount);
    this.context.setMetric('Exports Validados', exportCount);

    try {
      const candidates = [
        path.resolve(this.projectRoot, 'node_modules/fallow/bin/fallow'),
        path.resolve(process.cwd(), 'node_modules/fallow/bin/fallow')
      ];
      const fallowBin = candidates.find(c => fs.existsSync(c));
      if (fallowBin) {
        const stdout = execSync(`node "${fallowBin}" list --workspaces --format json --root "${this.projectRoot}"`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
          timeout: 10000
        });
        const parsed = JSON.parse(stdout) as { workspace_diagnostics?: FallowWorkspaceDiagnosticItem[] };
        validateFallowWorkspaceDiagnostics(parsed.workspace_diagnostics, this);
      }
    } catch {
      // catch-ok: Fallow execution might not be available in non-standard test sandboxes
    }
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateFallowConfigAuditor());
