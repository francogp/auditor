/**
 * scripts/auditors/documentation/validate_markdown_lint.ts
 *
 * MARKDOWN LINT AUDITOR & HYGIENE VALIDATOR (Node.js 26+ Native)
 *
 * Runs `markdownlint` across all project documentation and skills,
 * parses structured JSON findings, maps them to StandardAuditResult with severity 'error',
 * and persists reports to scratch/audits/documentation/validate_markdown_lint.json.
 * Supports auto-fix when `fix` is passed.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* --allow-child-process scripts/auditors/documentation/validate_markdown_lint.ts
 *   npm run lint:md
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';

enableCompileCache();

export type MarkdownLintRuleId = 'markdownlint-issue';

export const MARKDOWN_LINT_RULES: readonly MarkdownLintRuleId[] = [
  'markdownlint-issue'
] as const;

const MAX_BUFFER_BYTES = 52428800 as const;
const EXECUTION_TIMEOUT_MS = 60000 as const;
const DEFAULT_ERROR_LINE = 1 as const;

export const DEFAULT_MARKDOWN_IGNORE_GLOBS = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'dev-dist/**',
  'scratch/**',
  'test-results/**'
] as const;

export function getMarkdownIgnoreGlobs(projectRoot?: string): readonly string[] {
  const config = getAuditConfig(projectRoot);
  const globs: string[] = [...DEFAULT_MARKDOWN_IGNORE_GLOBS];
  if (config.paths?.ignoreGlobs) {
    globs.push(...config.paths.ignoreGlobs);
  }
  if (config.paths?.e2eRoots) {
    for (const r of config.paths.e2eRoots) {
      globs.push(`${r}/results/**`);
    }
  }
  if (config.persistence?.supabaseDir) {
    globs.push(`${config.persistence.supabaseDir}/**`);
  }
  return Array.from(new Set(globs));
}

export const MARKDOWN_IGNORE_GLOBS = DEFAULT_MARKDOWN_IGNORE_GLOBS;

export interface RawMarkdownLintIssue {
  fileName?: string;
  lineNumber?: number;
  ruleNames?: string[];
  ruleDescription?: string;
  errorDetail?: string | null;
  errorContext?: string | null;
}

/**
 * Parses raw JSON output or an array of issues from markdownlint into canonical AuditFindings.
 */
export function parseMarkdownLintIssues(input: string | object[], cwd: string = process.cwd()): AuditFinding[] {
  const findings: AuditFinding[] = []; // no-domain: Non-domain utility collection or data structure
  if (!input) return findings;

  let rawList: RawMarkdownLintIssue[] = []; // no-domain: Non-domain utility collection or data structure
  if (typeof input === 'string') {
    const cleanedLines = input
      .split('\n')
      .filter((line) => !line.startsWith('(node:') && !line.startsWith('(Use `node') && !line.includes('SecurityWarning') && !line.startsWith('[PERM'));
    const trimmed = cleanedLines.join('\n').trim();
    if (!trimmed) return findings;
    const startIdx = trimmed.indexOf('[');
    const endIdx = trimmed.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return findings;

    try {
      rawList = JSON.parse(trimmed.substring(startIdx, endIdx + 1)) as RawMarkdownLintIssue[];
    } catch (err: unknown) {
      throw new Error(`Error al procesar salida JSON de markdownlint: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
  } else if (Array.isArray(input)) {
    rawList = input as RawMarkdownLintIssue[];
  }

  for (const issue of rawList) {
    const rawFile = issue.fileName || '';
    const resolvedPath = path.isAbsolute(rawFile)
      ? path.relative(cwd, rawFile)
      : rawFile;
    const cleanFile = resolvedPath.split(path.sep).join(path.posix.sep);

    const ruleCode = Array.isArray(issue.ruleNames) ? issue.ruleNames.join('/') : 'MD';
    const detail = issue.errorDetail ? ` (${issue.errorDetail})` : '';
    const desc = issue.ruleDescription || 'Markdown formatting issue';

    findings.push({
      suiteId: 'validate_markdown_lint',
      suiteName: 'Markdownlint Style & Hygiene Validator',
      ruleId: 'markdownlint-issue',
      ruleDescription: 'Formato o estilo inválido',
      severity: 'error',
      file: cleanFile,
      line: issue.lineNumber || DEFAULT_ERROR_LINE,
      context: ruleCode,
      message: `${ruleCode}: ${desc}${detail}`
    });
  }

  return findings;
}

function resolveMarkdownLintBin(projectRoot: string): string {
  const candidates = [
    path.resolve(projectRoot, 'node_modules/markdownlint-cli/markdownlint.js'),
    path.resolve(import.meta.dirname, '../../node_modules/markdownlint-cli/markdownlint.js'),
    path.resolve(import.meta.dirname, '../../../node_modules/markdownlint-cli/markdownlint.js'),
    path.resolve(import.meta.dirname, '../../../../node_modules/markdownlint-cli/markdownlint.js')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]!;
}

export class MarkdownLintAuditor extends BaseAuditor<MarkdownLintRuleId> {
  constructor(projectRoot?: string) {
    super({
      id: 'validate_markdown_lint',
      name: 'Markdownlint Style & Hygiene Validator',
      description: 'Estilo, espaciado y formato en documentación markdown',
      family: 'documentation',
      packageName: 'Markdownlint',
      ruleIds: MARKDOWN_LINT_RULES,
      ruleDescriptions: {
        'markdownlint-issue': 'Formato o estilo inválido'
      },
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const isFixMode = process.argv.includes('fix') || process.argv.includes('--fix') || Boolean((this.context.values as Record<string, unknown>).fix);
    this.context.logStep(1, 2, `Ejecutando markdownlint (modo: ${isFixMode ? 'auto-fix' : 'verificación'})...`);

    const binPath = resolveMarkdownLintBin(this.projectRoot);
    const args: string[] = ['**/*.md']; // no-domain: Non-domain utility collection or data structure

    for (const pattern of getMarkdownIgnoreGlobs(this.projectRoot)) {
      args.push('--ignore', pattern);
    }
    args.push('--json');
    if (isFixMode) {
      args.push('--fix');
    }

    const proc = spawnSync(
      'node',
      ['--disable-warning=PERM0001', '--disable-warning=PERM0002', '--disable-warning=ExperimentalWarning', binPath, ...args],
      {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        maxBuffer: MAX_BUFFER_BYTES,
        timeout: EXECUTION_TIMEOUT_MS
      }
    );

    const combinedOutput = `${proc.stdout || ''}\n${proc.stderr || ''}`;
    const findings = parseMarkdownLintIssues(combinedOutput, this.projectRoot);

    this.context.logStep(2, 2, `Procesando resultados de markdownlint (${findings.length} incidencias)...`);

    for (const finding of findings) {
      this.addViolation({
        ruleId: 'markdownlint-issue',
        severity: 'error',
        file: finding.file || '',
        line: finding.line || DEFAULT_ERROR_LINE,
        context: finding.context || 'markdownlint',
        message: finding.message
      });
    }

    this.filesScannedCount = 1;
    this.context.setMetric('markdown_violations', findings.length);
    this.context.setMetric('mode', isFixMode ? 'fix' : 'check');
  }
}

// Canonical CLI Entrypoint
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new MarkdownLintAuditor());
}
