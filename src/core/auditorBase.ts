/**
 * scripts/lib/auditorBase.ts
 * 
 * BASE AUDITOR FRAMEWORK (Node.js 26+ Native)
 * Mandatory base orchestrator for all sub-auditors in scripts/auditors/.
 * Enforces the StandardAuditResult contract:
 *   1. Always outputs the clean Box-Drawing summary table to console.
 *   2. Always writes 100% complete structured JSON to scratch/audits/<family>/<id>.json.
 */

import fs from 'node:fs/promises';
import nodeFs from 'node:fs';
import path from 'node:path';
import { parseArgs, styleText } from 'node:util';
import { enableCompileCache } from 'node:module';
import {
  type AuditFamily,
  type AuditFinding,
  type FindingSeverity,
  type StandardAuditResult
} from './auditContract.ts';
import {
  renderBanner,
  renderAuditTaskRow,
  renderFindingsDetail
} from './unifiedTheme.ts';
import { getAuditConfig, loadAuditConfig } from './auditConfig.ts';
import type { SharedAstContext } from './astContext.ts';
import type ts from 'typescript';

enableCompileCache();

/** Directories that must ALWAYS be ignored across all tools, runners, and auditors (compilation, VCS, scratch, test artifacts) */
export const ALWAYS_IGNORE_DIRS: ReadonlySet<string> = new Set([ // runtime-set: Fast O(1) membership lookup set
  'node_modules',
  '.git',
  '.tsbuildinfo',
  '.vitest-cache',
  '.fallow',
  '.vscode',
  '.github',
  '.gemini',
  'dist',
  'dev-dist',
  'build',
  'coverage',
  'results',
  'test-results',
  'scratch',
  'tmp',
  'volumes'
]);

/** Additional directories ignored during code scanning (documentation/skills and static assets) */
export const CODE_ONLY_IGNORE_DIRS: ReadonlySet<string> = new Set([ // runtime-set: Fast O(1) membership lookup set
  '.agents',
  'skills',
  'public',
  'packages',
  'docs'
]);

/** Canonical ignore directories for application code auditors (union of ALWAYS + CODE_ONLY) */
export const CANONICAL_IGNORE_DIRS: ReadonlySet<string> = new Set([ // runtime-set: Fast O(1) membership lookup set
  ...ALWAYS_IGNORE_DIRS,
  ...CODE_ONLY_IGNORE_DIRS
]);

/** Returns the effective set of ignore directories combining canonical defaults with audit.config.ts paths.ignoredDirs */
export function getEffectiveIgnoreDirs(): ReadonlySet<string> {
  const config = getAuditConfig();
  const custom = config.paths?.ignoredDirs ?? [];
  return new Set([...CANONICAL_IGNORE_DIRS, ...custom]);
}

export const SCANNABLE_EXTENSIONS: ReadonlySet<string> = new Set(['.ts', '.js', '.vue', '.cjs', '.mjs']); // runtime-set: Fast O(1) membership lookup set

export const CANONICAL_SCANNABLE_ROOTS = [
  'scripts',
  'src',
  'tests'
] as const;
export type CanonicalScannableRoot = (typeof CANONICAL_SCANNABLE_ROOTS)[number];

export function getEffectiveScannableRoots(config = getAuditConfig()): readonly string[] {
  const codeRoots = config.paths?.codeRoots ?? ['src', 'scripts'];
  const testRoots = config.paths?.testRoots ?? ['tests'];
  const integrationRoots = config.paths?.integrationRoots ?? [];
  const e2eRoots = config.paths?.e2eRoots ?? [];
  return Array.from(new Set([...codeRoots, ...testRoots, ...integrationRoots, ...e2eRoots]));
}

/**
 * Validates that a path component is safe against path traversal.
 */
export function assertSafePathComponent(component: string): void {
  if (component.includes('..')) {
    throw new Error(`Path traversal attempt detected in path component: ${component}`);
  }
}


/**
 * Loads directory ignore patterns from .fallowrc.json if present.
 */
export function loadFallowIgnorePatterns(projectRoot = process.cwd()): string[] {
  const fallowRcPath = path.resolve(projectRoot, '.fallowrc.json');
  try {
    if (nodeFs.existsSync(fallowRcPath)) {
      const raw = nodeFs.readFileSync(fallowRcPath, 'utf-8');
      const data = JSON.parse(raw) as { ignorePatterns?: string[] };
      return Array.isArray(data.ignorePatterns) ? data.ignorePatterns : [];
    }
  } catch {
    // Ignore fallback
  }
  return [];
}

/**
 * Determines whether a relative POSIX path belongs to an ignored directory or matches directory ignore patterns.
 */
export function isPathIgnored(
  relPath: string,
  extraIgnorePatterns: readonly string[] = [],
  unignoreDirs: ReadonlySet<string> | readonly string[] = []
): boolean {
  const normalized = relPath.split(path.sep).join(path.posix.sep).toLowerCase();
  const segments = normalized.split('/');
  const unignoreSet = unignoreDirs instanceof Set ? unignoreDirs : new Set(unignoreDirs);

  const rawConfigIgnoredDirs = getAuditConfig()?.paths?.ignoredDirs ?? [];
  const configIgnoredDirs = rawConfigIgnoredDirs.map(d => d.toLowerCase().replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''));
  const hasConfigIgnored = configIgnoredDirs.length > 0;

  let hasUnignoredAncestor = false;

  for (const seg of segments) {
    if (ALWAYS_IGNORE_DIRS.has(seg)) {
      return true;
    }

    if (unignoreSet.has(seg)) {
      hasUnignoredAncestor = true;
      continue;
    }

    if (!hasUnignoredAncestor) {
      const isIgnored = CODE_ONLY_IGNORE_DIRS.has(seg) || (hasConfigIgnored && configIgnoredDirs.some(d => d === seg || normalized === d || normalized.startsWith(d + '/') || normalized.includes('/' + d + '/')));
      if (isIgnored) {
        return true;
      }
    }
  }

  const configPatterns = getAuditConfig()?.paths?.ignoredPatterns ?? [];
  const configGlobs = getAuditConfig()?.paths?.ignoreGlobs ?? [];
  const allPatterns = [...extraIgnorePatterns, ...configPatterns, ...configGlobs];

  for (const pattern of allPatterns) {
    let cleanPattern = pattern.toLowerCase();
    const matchesAnywhere = cleanPattern.startsWith('**/');
    if (matchesAnywhere) {
      cleanPattern = cleanPattern.slice(3);
    }
    cleanPattern = cleanPattern.replace(/\/\*\*$/, '').replace(/\/\*$/, '');

    if (!cleanPattern) continue;

    if (matchesAnywhere) {
      if (
        normalized === cleanPattern ||
        normalized.startsWith(cleanPattern + '/') ||
        normalized.endsWith('/' + cleanPattern) ||
        normalized.includes('/' + cleanPattern + '/') ||
        cleanPattern.endsWith('/' + normalized)
      ) {
        return true;
      }
    } else {
      if (
        normalized === cleanPattern ||
        normalized.startsWith(cleanPattern + '/') ||
        normalized.endsWith('/' + cleanPattern) ||
        normalized.includes('/' + cleanPattern) ||
        cleanPattern.endsWith('/' + normalized)
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Recursively collects scannable files from a directory, applying ignore filters.
 */
export function collectRepositoryFiles(
  dir: string,
  projectRoot = process.cwd(),
  extraIgnorePatterns: readonly string[] = [],
  allowedExtensions: ReadonlySet<string> = SCANNABLE_EXTENSIONS,
  unignoreDirs: ReadonlySet<string> | readonly string[] = []
): string[] {
  const results: string[] = []; // no-domain: Non-domain utility collection or data structure
  if (!nodeFs.existsSync(dir)) return results;

  const stat = nodeFs.statSync(dir);
  if (stat.isFile()) {
    const relPath = path.relative(projectRoot, dir).split(path.sep).join(path.posix.sep);
    if (!isPathIgnored(relPath, extraIgnorePatterns, unignoreDirs)) {
      const ext = path.extname(dir).toLowerCase();
      if (allowedExtensions.has(ext)) {
        results.push(dir);
      }
    }
    return results;
  }

  let entries: nodeFs.Dirent[];
  try {
    entries = nodeFs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.resolve(dir, entry.name);
    const relPath = path.relative(projectRoot, fullPath).split(path.sep).join(path.posix.sep);

    if (entry.isDirectory()) {
      if (!isPathIgnored(relPath, extraIgnorePatterns, unignoreDirs)) {
        results.push(...collectRepositoryFiles(fullPath, projectRoot, extraIgnorePatterns, allowedExtensions, unignoreDirs));
      }
    } else if (entry.isFile()) {
      if (!isPathIgnored(relPath, extraIgnorePatterns, unignoreDirs)) {
        const ext = path.extname(entry.name).toLowerCase();
        if (allowedExtensions.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  }
  return results;
}

export interface AuditorConfig {
  id: string;
  name: string;
  description: string;
  family: AuditFamily;
  requiredFiles?: string[];
  extraIgnorePatterns?: string[];
  unignoreDirs?: string[];
  projectRoot?: string;
}

export interface AuditorContext {
  values: {
    output?: string;
    'errors-only'?: boolean;
  };
  ignorePatterns: readonly string[];
  unignoreDirs: readonly string[];
  isPathIgnored: (relPath: string) => boolean;
  collectFiles: (roots?: readonly string[], allowedExtensions?: ReadonlySet<string>) => string[];
  logProgress: (msg: string) => void;
  logStep: (stepNumber: number, totalSteps: number, description: string) => void;
  addFinding: (finding: AuditFinding) => void;
  addError: (message: string, file?: string, line?: number, context?: string, ruleId?: string, ruleDescription?: string, suiteId?: string, suiteName?: string) => void;
  addWarning: (message: string, file?: string, line?: number, context?: string, ruleId?: string, ruleDescription?: string, suiteId?: string, suiteName?: string) => void;
  setMetric: (key: string, value: number | string) => void;
  checkFiles: () => Promise<void>;
  finish: (finalMetrics?: Record<string, number | string>, legacyErrors?: string[], legacyWarnings?: string[]) => Promise<StandardAuditResult>;
}

export function setupAuditor(config: AuditorConfig): AuditorContext {
  const startTime = performance.now();
  const args = process.argv.slice(2);
  const normalized = args.map(a => a.includes('=') && !a.startsWith('-') ? `--${a}` : (['errors-only'].includes(a) ? `--${a}` : a));

  const { values } = parseArgs({
    args: normalized,
    options: {
      output: { type: 'string', short: 'o' },
      'errors-only': { type: 'boolean' }
    },
    strict: false
  });

  const projectRoot = config.projectRoot || process.cwd();
  const fallowIgnores = loadFallowIgnorePatterns(projectRoot);
  const combinedIgnores = [...fallowIgnores, ...(config.extraIgnorePatterns || [])];
  const unignoreDirs = config.unignoreDirs ?? [];

  const isSubprocess = process.env.AUDIT_SUBPROCESS === 'true';
  const findings: AuditFinding[] = [];
  const metrics: Record<string, number | string> = {};

  return {
    values: values as AuditorContext['values'],
    ignorePatterns: combinedIgnores,
    unignoreDirs,
    isPathIgnored: (relPath: string) => isPathIgnored(relPath, combinedIgnores, unignoreDirs),
    collectFiles: (roots: readonly string[] = getEffectiveScannableRoots(), allowedExtensions = SCANNABLE_EXTENSIONS) => {
      const all: string[] = []; // no-domain: Non-domain utility collection or data structure
      for (const root of roots) {
        const fullRoot = path.resolve(projectRoot, root);
        all.push(...collectRepositoryFiles(fullRoot, projectRoot, combinedIgnores, allowedExtensions, unignoreDirs));
      }
      return all;
    },
    logProgress: (msg: string) => {
      console.log(msg);
    },
    logStep: (stepNumber: number, totalSteps: number, description: string) => {
      console.log(`🔍 [${stepNumber}/${totalSteps}] ${description}`);
    },
    addFinding: (f: AuditFinding) => findings.push(f),
    addError: (message: string, file?: string, line?: number, context?: string, ruleId?: string, ruleDescription?: string, suiteId?: string, suiteName?: string) => {
      findings.push({ severity: 'error', message, file, line, context, ruleId, ruleDescription, suiteId, suiteName });
    },
    addWarning: (message: string, file?: string, line?: number, context?: string, ruleId?: string, ruleDescription?: string, suiteId?: string, suiteName?: string) => {
      if (!values['errors-only']) {
        findings.push({ severity: 'warning', message, file, line, context, ruleId, ruleDescription, suiteId, suiteName });
      }
    },
    setMetric: (key: string, value: number | string) => {
      metrics[key] = value;
    },
    checkFiles: async () => {
      if (!config.requiredFiles || config.requiredFiles.length === 0) return;
      try {
        for (const file of config.requiredFiles) {
          await fs.access(file);
        }
      } catch (_err) {
        console.error(styleText('red', `❌ Archivos requeridos no encontrados o no accesibles:\n${config.requiredFiles.map(f => `   - ${f}`).join('\n')}`));
        if (isSubprocess) {
          throw new Error(`Archivos requeridos no encontrados: ${config.requiredFiles.join(', ')}`, { cause: _err });
        }
        process.exit(1);
      }
    },
    finish: async (finalMetrics?: Record<string, number | string>, legacyErrors?: string[], legacyWarnings?: string[]) => {
      // Merge legacy arrays if provided
      if (legacyErrors) {
        for (const err of legacyErrors) {
          findings.push({ severity: 'error', message: err });
        }
      }
      if (legacyWarnings && !values['errors-only']) {
        for (const warn of legacyWarnings) {
          findings.push({ severity: 'warning', message: warn });
        }
      }

      if (finalMetrics) {
        Object.assign(metrics, finalMetrics);
      }

      const durationMs = Math.round(performance.now() - startTime);
      const errorsCount = findings.filter(f => f.severity === 'error').length;
      const warningsCount = findings.filter(f => f.severity === 'warning').length;
      const infoCount = findings.filter(f => f.severity === 'info').length;

      const result: StandardAuditResult = {
        id: config.id,
        name: config.name,
        description: config.description,
        family: config.family,
        status: errorsCount === 0 ? 'passed' : 'failed',
        durationMs,
        metrics,
        findings,
        summary: {
          errors: errorsCount,
          warnings: warningsCount,
          info: infoCount
        }
      };

      // 1. Persist complete JSON to clean scratch directory (if write permissions are granted)
      const scratchFamilyDir = path.resolve(process.cwd(), 'scratch/audits', config.family);
      const targetJsonPath = path.join(scratchFamilyDir, `${config.id}.json`);
      const latestJsonPath = path.resolve(process.cwd(), 'scratch/audits', `latest_${config.id}.json`);

      try {
        await fs.mkdir(scratchFamilyDir, { recursive: true });
        const jsonString = JSON.stringify(result, null, 2);
        await fs.writeFile(targetJsonPath, jsonString, 'utf-8');
        await fs.writeFile(latestJsonPath, jsonString, 'utf-8');

        if (typeof values.output === 'string' && values.output && !values.output.includes('..')) {
          const outPath = path.resolve(process.cwd(), values.output);
          await fs.writeFile(outPath, jsonString, 'utf-8');
        }
      } catch {
        // Ignorar errores de escritura si el comando se ejecuta en modo solo lectura (--allow-fs-read)
      }

      // 2. ALWAYS output human summary table to console when run standalone
      if (!isSubprocess) {
        console.log(renderBanner(config.name, `Familia: ${config.family.toUpperCase()}  |  ID: ${config.id}`));
        console.log(renderAuditTaskRow(result));

        if (findings.length > 0) {
          console.log(renderFindingsDetail(findings));
        }

        const relPath = path.relative(process.cwd(), targetJsonPath);
        console.log(`\n${result.status === 'passed' ? styleText('green', '✨ Auditoría completada con éxito.') : styleText('red', '🚨 Auditoría finalizada con errores.')}`);
        console.log(styleText('dim', `💾 Reporte detallado guardado en: ${relPath}\n`));
      }

      if (!isSubprocess && errorsCount > 0) {
        process.exit(1);
      }

      return result;
    }
  };
}

export const MAX_AUDITOR_DESCRIPTION_LENGTH = 50;
export const MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH = 60;

export interface AuditorOptions<TRuleId extends string = string> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly family: AuditFamily;
  readonly packageName?: string;
  readonly ruleIds?: readonly TRuleId[];
  readonly ruleDescriptions?: Readonly<Partial<Record<TRuleId, string>>>;
  readonly roots?: readonly string[];
  readonly allowedExtensions?: ReadonlySet<string>;
  readonly extraIgnorePatterns?: readonly string[];
  readonly unignoreDirs?: readonly string[];
  readonly requiredFiles?: readonly string[];
  readonly requiresAst?: boolean;
  readonly projectRoot?: string;
}

export interface ViolationInput<TRuleId extends string = string> {
  readonly ruleId: TRuleId;
  readonly ruleDescription?: string;
  readonly severity: FindingSeverity;
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly context: string;
}

/**
 * Base Object-Oriented Auditor class.
 * Centralizes violation tracking, rule counting, metrics reporting, and unified CLI execution.
 */
export abstract class BaseAuditor<TRuleId extends string = string> {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  public readonly family: AuditFamily;
  public readonly packageName?: string;
  public readonly ruleIds: readonly TRuleId[];
  public readonly ruleDescriptions?: Readonly<Partial<Record<TRuleId, string>>>;
  public readonly roots: readonly string[];
  public readonly allowedExtensions: ReadonlySet<string>;
  public readonly extraIgnorePatterns: readonly string[];
  public readonly unignoreDirs: readonly string[];
  public readonly requiredFiles: readonly string[];
  public readonly requiresAst: boolean;

  protected readonly projectRoot: string;
  protected readonly context: AuditorContext;
  protected readonly countsByRule: Map<TRuleId, number> = new Map();
  protected filesScannedCount = 0;

  constructor(options: AuditorOptions<TRuleId>) {
    this.requiresAst = options.requiresAst ?? false;
    this.packageName = options.packageName;
    if (!options.id || options.id.trim().length === 0) {
      throw new Error('Auditor must define an id');
    }
    if (!options.name || options.name.trim().length === 0) {
      throw new Error(`Auditor [${options.id}] must define a name`);
    }
    if (!options.description || options.description.trim().length === 0) {
      throw new Error(`Auditor [${options.id}] must define a human-friendly description`);
    }
    if (options.description.length > MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH || options.description.includes('\n')) {
      throw new Error(
        `Auditor [${options.id}] description exceeds ${MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH} characters or contains newlines.`
      );
    }

    this.id = options.id;
    this.name = options.name;
    this.description = options.description;
    this.family = options.family;
    this.ruleIds = options.ruleIds ?? [];
    this.ruleDescriptions = options.ruleDescriptions;
    this.roots = options.roots ?? getEffectiveScannableRoots();
    this.allowedExtensions = options.allowedExtensions ?? SCANNABLE_EXTENSIONS;
    this.extraIgnorePatterns = options.extraIgnorePatterns ?? [];
    this.unignoreDirs = options.unignoreDirs ?? [];
    this.requiredFiles = options.requiredFiles ?? [];
    this.projectRoot = options.projectRoot || process.cwd();

    if (options.ruleDescriptions) {
      for (const [ruleId, desc] of Object.entries(options.ruleDescriptions)) {
        const descText = typeof desc === 'string' ? desc : '';
        const formatted = this.formatRuleDescription(ruleId as TRuleId, descText);
        if (formatted && (formatted.length > MAX_AUDITOR_DESCRIPTION_LENGTH || formatted.includes('\n'))) {
          throw new Error(
            `Auditor [${options.id}] rule description for '${ruleId}' ('${formatted}') exceeds ${MAX_AUDITOR_DESCRIPTION_LENGTH} characters or contains newlines.`
          );
        }
      }
    }

    for (const ruleId of this.ruleIds) {
      this.countsByRule.set(ruleId, 0);
    }

    this.context = setupAuditor({
      id: this.id,
      name: this.name,
      description: this.description,
      family: this.family,
      requiredFiles: [...this.requiredFiles],
      extraIgnorePatterns: [...this.extraIgnorePatterns],
      unignoreDirs: [...this.unignoreDirs],
      projectRoot: this.projectRoot
    });
  }

  public getCountsByRule(): ReadonlyMap<TRuleId, number> {
    return this.countsByRule;
  }

  public formatRuleDescription(ruleId: TRuleId, rawDescription?: string): string {
    const raw = rawDescription || this.ruleDescriptions?.[ruleId] || ruleId;
    if (this.packageName && !raw.toLowerCase().startsWith(this.packageName.toLowerCase() + ':')) {
      const combined = `${this.packageName}: ${raw}`;
      return combined.length <= MAX_AUDITOR_DESCRIPTION_LENGTH ? combined : raw;
    }
    return raw;
  }

  public getRuleLabel(ruleId: string): string {
    return this.formatRuleDescription(ruleId as TRuleId);
  }

  public getFilesScanned(): number {
    return this.filesScannedCount;
  }

  public addViolation(v: ViolationInput<TRuleId>): void {
    const current = this.countsByRule.get(v.ruleId) ?? 0;
    this.countsByRule.set(v.ruleId, current + 1);

    const ruleDesc = this.formatRuleDescription(v.ruleId, v.ruleDescription);

    if (v.severity === 'error') {
      this.context.addError(v.message, v.file, v.line, v.context, v.ruleId, ruleDesc, this.id, this.name);
    } else {
      this.context.addWarning(v.message, v.file, v.line, v.context, v.ruleId, ruleDesc, this.id, this.name);
    }
  }

  public isLineIgnored(line: string, customTokens: readonly string[] = []): boolean {
    const baseTokens = ['domain-ok', 'string-ok', 'test-ok', 'fallow-ignore-next-line', ...customTokens];
    const pattern = new RegExp(`(?:--|\\/\\/|<!--)\\s*(?:${baseTokens.join('|')})\\b`, 'i');
    return pattern.test(line);
  }

  protected hasEscapeHatch(line: string, hatches: readonly string[]): boolean {
    return hatches.some(h => line.includes(`// ${h}`) || line.includes(`/* ${h}`) || line.includes(`<!-- ${h}`));
  }

  protected getLineNumber(content: string, charIndex: number): number {
    return content.slice(0, charIndex).split('\n').length;
  }

  protected getLineAt(content: string, lineIndex: number): string {
    const lines = content.split('\n');
    return lines[lineIndex - 1] ?? '';
  }

  protected scanRegexMatches(
    content: string,
    regex: RegExp,
    relPath: string,
    ruleId: TRuleId,
    escapeHatches: readonly string[],
    message: string,
    filter?: (lineContent: string, match: RegExpExecArray) => boolean,
    sourceForLines: string = content,
    charOffset: number = 0
  ): void {
    let match: RegExpExecArray | null;
    const re = new RegExp(regex.source, regex.flags);
    while ((match = re.exec(content)) !== null) {
      const line = this.getLineNumber(sourceForLines, charOffset + match.index);
      const lineContent = this.getLineAt(sourceForLines, line);
      if (filter && !filter(lineContent, match)) continue;
      if (this.hasEscapeHatch(lineContent, escapeHatches)) continue;
      this.addViolation({
        ruleId,
        severity: 'error',
        file: relPath,
        line,
        message,
        context: lineContent.trim()
      });
    }
  }

  public abstract runAudit(astContext?: SharedAstContext): Promise<void> | void;

  public async execute(astContext?: SharedAstContext): Promise<StandardAuditResult> {
    await loadAuditConfig(this.projectRoot);
    await this.context.checkFiles();
    let effectiveAst = astContext;
    if (!effectiveAst && this.requiresAst) {
      const { SharedAstContext } = await import('./astContext.ts');
      effectiveAst = new SharedAstContext();
    }
    await this.runAudit(effectiveAst);

    this.context.setMetric('Files Scanned', this.filesScannedCount);
    for (const [ruleId, count] of this.countsByRule.entries()) {
      this.context.setMetric(`Rule: ${ruleId}`, count);
    }

    return await this.context.finish({
      'Files Scanned': this.filesScannedCount
    });
  }

  public async finishAudit(): Promise<StandardAuditResult> {
    return await this.context.finish({
      'Files Scanned': this.filesScannedCount
    });
  }

  public static async runCli(auditor: BaseAuditor<string>): Promise<void> {
    await auditor.execute();
  }
}

/**
 * Specialized File-Scanning Auditor.
 * Automates recursive file discovery, ignore filtering, reading, and line-by-line scanning dispatch.
 */
export abstract class FileScanAuditor<TRuleId extends string = string> extends BaseAuditor<TRuleId> {
  protected abstract scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile): void | Promise<void>;

  public override async runAudit(astContext?: SharedAstContext): Promise<void> {
    const files = this.context.collectFiles(this.roots, this.allowedExtensions);
    let effectiveAst = astContext;
    if (!effectiveAst && this.requiresAst) {
      const { SharedAstContext } = await import('./astContext.ts');
      effectiveAst = new SharedAstContext();
    }

    for (const file of files) {
      const relPath = path.relative(this.projectRoot, file).split(path.sep).join(path.posix.sep);
      try {
        const content = nodeFs.readFileSync(file, 'utf-8');
        this.filesScannedCount++;
        const sourceFile = effectiveAst && this.requiresAst ? effectiveAst.getSourceFile(file, content) : undefined;
        await this.scanFile(relPath, content, sourceFile);
      } catch {
        // Ignore read errors on inaccessible files
      }
    }
  }
}

