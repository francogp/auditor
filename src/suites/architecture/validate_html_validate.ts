/**
 * packages/auditor/src/suites/architecture/validate_html_validate.ts
 *
 * HTML5 STANDARDS & MARKUP HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Runs `html-validate` with `html-validate-vue` across project templates (.vue, .html),
 * detects deprecated attributes, obsolete elements, and spec violations (Zero-Warning Policy),
 * and persists structured reports to scratch/audits/architecture/validate_html_validate.json.
 * Supports auto-fix when `fix` is passed.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-child-process packages/auditor/src/suites/architecture/validate_html_validate.ts
 *   npm run validate:html
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import type { AuditFinding } from '../../core/auditContract.ts';

enableCompileCache();

export type HtmlValidateRuleId = 'html-validate-issue';

export const HTML_VALIDATE_RULES: readonly HtmlValidateRuleId[] = [
  'html-validate-issue'
] as const;

const MAX_BUFFER_BYTES = 52428800 as const;
const EXECUTION_TIMEOUT_MS = 120000 as const;
const DEFAULT_ERROR_LINE = 1 as const;

export interface RawHtmlValidateMessage {
  ruleId?: string | null;
  severity?: number;
  message?: string;
  line?: number;
  column?: number;
}

export interface RawHtmlValidateFileReport {
  filePath?: string;
  messages?: RawHtmlValidateMessage[];
  errorCount?: number;
  warningCount?: number;
}

/**
 * Parses raw JSON output or an array of file reports from html-validate into canonical AuditFindings.
 * Elevates both warnings and errors to severity: 'error' (Zero-Warning Policy).
 */
export function parseHtmlValidateResults(input: string | object[], cwd: string = process.cwd()): AuditFinding[] {
  const findings: AuditFinding[] = [];
  if (!input) return findings;

  let rawList: RawHtmlValidateFileReport[] = [];
  if (typeof input === 'string') {
    const cleanedLines = input
      .split('\n')
      .filter((line) => !line.startsWith('(node:') && !line.startsWith('(Use `node') && !line.includes('SecurityWarning') && !line.startsWith('[PERM') && !line.startsWith('npm notice'));
    const trimmed = cleanedLines.join('\n').trim();
    if (!trimmed) return findings;
    const startIdx = trimmed.indexOf('[');
    const endIdx = trimmed.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return findings;

    try {
      rawList = JSON.parse(trimmed.substring(startIdx, endIdx + 1)) as RawHtmlValidateFileReport[];
    } catch {
      return findings;
    }
  } else if (Array.isArray(input)) {
    rawList = input as RawHtmlValidateFileReport[];
  }

  for (const fileReport of rawList) {
    const rawFile = fileReport.filePath || '';
    if (!fileReport.messages || fileReport.messages.length === 0) continue;

    const resolvedPath = path.isAbsolute(rawFile)
      ? path.relative(cwd, rawFile)
      : rawFile;
    const cleanFile = resolvedPath.split(path.sep).join(path.posix.sep);

    for (const msg of fileReport.messages) {
      const rule = msg.ruleId || 'html-validate';
      const text = msg.message || 'HTML validation issue';

      findings.push({
        suiteId: 'validate_html_validate',
        suiteName: 'HTML5 Standards & Markup Hygiene Validator',
        ruleId: 'html-validate-issue',
        ruleDescription: 'Violación de estándar HTML5',
        severity: 'error',
        file: cleanFile,
        line: msg.line || DEFAULT_ERROR_LINE,
        context: rule,
        message: `[${rule}] ${text}`
      });
    }
  }

  return findings;
}

function resolveHtmlValidateBin(projectRoot: string): string {
  const candidates = [
    path.resolve(projectRoot, 'node_modules/html-validate/bin/html-validate.mjs'),
    path.resolve(import.meta.dirname, '../../node_modules/html-validate/bin/html-validate.mjs'),
    path.resolve(import.meta.dirname, '../../../node_modules/html-validate/bin/html-validate.mjs'),
    path.resolve(import.meta.dirname, '../../../../node_modules/html-validate/bin/html-validate.mjs')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]!;
}

function resolveHtmlValidateConfig(projectRoot: string): string {
  const hostConfig = path.resolve(projectRoot, '.htmlvalidate.json');
  if (fs.existsSync(hostConfig)) return hostConfig;
  const packageConfig = path.resolve(import.meta.dirname, '../../../.htmlvalidate.json');
  if (fs.existsSync(packageConfig)) return packageConfig;
  return '.htmlvalidate.json';
}

export class HtmlValidateAuditor extends BaseAuditor<HtmlValidateRuleId> {
  constructor() {
    super({
      id: 'validate_html_validate',
      name: 'HTML5 Standards & Markup Hygiene Validator',
      description: 'Valida estándares y elementos obsoletos con html-validate',
      family: 'architecture',
      packageName: 'HTML',
      ruleIds: HTML_VALIDATE_RULES,
      ruleDescriptions: {
        'html-validate-issue': 'Violación de estándar HTML5'
      }
    });
  }

  public override async runAudit(): Promise<void> {
    const isFixMode = process.argv.includes('fix') || process.argv.includes('--fix') || Boolean((this.context.values as Record<string, unknown>).fix);
    this.context.logStep(1, 2, `Ejecutando html-validate (modo: ${isFixMode ? 'auto-fix' : 'verificación'})...`);

    const binPath = resolveHtmlValidateBin(this.projectRoot);
    const configFile = resolveHtmlValidateConfig(this.projectRoot);
    const reportFile = path.resolve(this.projectRoot, 'scratch/audits/architecture/html-validate-raw.json');
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });

    const targets: string[] = [];
    const srcDir = path.resolve(this.projectRoot, 'src');
    if (fs.existsSync(srcDir)) {
      targets.push('src');
    }
    const indexHtml = path.resolve(this.projectRoot, 'index.html');
    if (fs.existsSync(indexHtml)) {
      targets.push('index.html');
    }

    if (targets.length === 0) {
      this.context.logStep(1, 1, 'No se encontraron archivos HTML/Vue para html-validate. Omitiendo.');
      return;
    }

    const args: string[] = ['-c', configFile, '--ext', 'html,vue', '-f', `json=${reportFile}`, ...targets];

    if (isFixMode) {
      args.push('--fix');
    }

    const proc = spawnSync('node', [
      '--disable-warning=PERM0001',
      '--disable-warning=PERM0002',
      '--disable-warning=ExperimentalWarning',
      binPath,
      ...args
    ], {
      cwd: this.projectRoot,
      encoding: 'utf-8',
      maxBuffer: MAX_BUFFER_BYTES,
      timeout: EXECUTION_TIMEOUT_MS
    });

    let findings: AuditFinding[] = [];
    if (fs.existsSync(reportFile)) {
      try {
        const rawJson = fs.readFileSync(reportFile, 'utf-8');
        findings = parseHtmlValidateResults(rawJson, this.projectRoot);
      } catch {
        const combinedOutput = `${proc.stdout || ''}\n${proc.stderr || ''}`;
        findings = parseHtmlValidateResults(combinedOutput, this.projectRoot);
      }
    } else {
      const combinedOutput = `${proc.stdout || ''}\n${proc.stderr || ''}`;
      findings = parseHtmlValidateResults(combinedOutput, this.projectRoot);
    }

    this.context.logStep(2, 2, `Procesando violaciones de HTML5 (${findings.length} problemas)...`);

    for (const finding of findings) {
      this.addViolation({
        ruleId: 'html-validate-issue',
        severity: 'error',
        file: finding.file || '',
        line: finding.line || DEFAULT_ERROR_LINE,
        context: finding.context || 'html-validate',
        message: finding.message
      });
    }

    this.filesScannedCount = 1;
    this.context.setMetric('html_violations', findings.length);
    this.context.setMetric('mode', isFixMode ? 'fix' : 'check');
  }
}

// Canonical CLI Entrypoint
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new HtmlValidateAuditor());
}
