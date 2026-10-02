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

import { executeNodeCli, resolveNodeModuleBin } from '../../cli/cliUtils.ts';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { parseJsonArrayOutput, normalizePosixPath } from '../../core/reportUtils.ts';

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
  if (config.paths?.ignoredDirs) {
    for (const d of config.paths.ignoredDirs) {
      globs.push(`${d}/**`);
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
  const findings: AuditFinding[] = [];
  if (!input) return findings;

  const rawList = parseJsonArrayOutput<RawMarkdownLintIssue>(input, {
    throwOnError: true,
    toolName: 'markdownlint'
  });

  for (const issue of rawList) {
    const cleanFile = normalizePosixPath(issue.fileName || '', cwd);

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
    const isFixMode = this.isFixModeRequested();
    this.context.logStep(1, 2, `Ejecutando markdownlint (modo: ${isFixMode ? 'auto-fix' : 'verificación'})...`);

    const binPath = resolveNodeModuleBin(this.projectRoot, 'markdownlint-cli/markdownlint.js');
    const args: string[] = ['**/*.md']; // no-domain: Non-domain utility collection or data structure

    for (const pattern of getMarkdownIgnoreGlobs(this.projectRoot)) {
      args.push('--ignore', pattern);
    }
    args.push('--json');
    if (isFixMode) {
      args.push('--fix');
    }

    const combinedOutput = executeNodeCli(binPath, args, {
      cwd: this.projectRoot,
      maxBuffer: MAX_BUFFER_BYTES,
      timeout: EXECUTION_TIMEOUT_MS
    });
    const findings = parseMarkdownLintIssues(combinedOutput, this.projectRoot);

    this.context.logStep(2, 2, `Procesando resultados de markdownlint (${findings.length} incidencias)...`);

    this.importAuditFindings(findings, 'markdownlint-issue', 'markdownlint');

    this.filesScannedCount = 1;
    this.context.setMetric('markdown_violations', findings.length);
    this.context.setMetric('mode', isFixMode ? 'fix' : 'check');
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new MarkdownLintAuditor());
