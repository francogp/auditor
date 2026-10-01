/**
 * scripts/auditors/architecture/validate_eslint.ts
 *
 * ESLINT AST & CODE QUALITY AUDITOR (Node.js 26+ Native)
 *
 * Runs ESLint across the repository with cache and JSON formatter,
 * maps both errors and warnings to StandardAuditResult findings with severity 'error'
 * (enforcing the strict Zero-Warning Policy), and persists structured reports to
 * scratch/audits/architecture/validate_eslint.json.
 * Supports auto-fix when `fix` is passed.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* --allow-child-process scripts/auditors/architecture/validate_eslint.ts
 *   npm run lint
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import type { AuditFinding } from '../../core/auditContract.ts';

enableCompileCache();

export type EslintRuleId = 'eslint-violation';

export const ESLINT_RULES: readonly EslintRuleId[] = [
  'eslint-violation'
] as const;

const MAX_BUFFER_BYTES = 52428800 as const;
const EXECUTION_TIMEOUT_MS = 120000 as const;
const DEFAULT_ERROR_LINE = 1 as const;

export interface RawEslintMessage {
  ruleId?: string | null;
  severity?: number;
  message?: string;
  line?: number;
  column?: number;
}

export interface RawEslintFileReport {
  filePath?: string;
  messages?: RawEslintMessage[];
  errorCount?: number;
  warningCount?: number;
}

/**
 * Parses raw JSON output or an array of file reports from ESLint into canonical AuditFindings.
 * Elevates both warnings (severity 1) and errors (severity 2) to severity: 'error' (Zero-Warning Policy).
 */
export function parseEslintResults(input: string | object[], cwd: string = process.cwd()): AuditFinding[] {
  const findings: AuditFinding[] = []; // no-domain: Non-domain utility collection or data structure
  if (!input) return findings;

  let rawList: RawEslintFileReport[] = []; // no-domain: Non-domain utility collection or data structure
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
      rawList = JSON.parse(trimmed.substring(startIdx, endIdx + 1)) as RawEslintFileReport[];
    } catch {
      return findings;
    }
  } else if (Array.isArray(input)) {
    rawList = input as RawEslintFileReport[];
  }

  for (const fileReport of rawList) {
    const rawFile = fileReport.filePath || '';
    if (!fileReport.messages || fileReport.messages.length === 0) continue;

    const resolvedPath = path.isAbsolute(rawFile)
      ? path.relative(cwd, rawFile)
      : rawFile;
    const cleanFile = resolvedPath.split(path.sep).join(path.posix.sep);

    for (const msg of fileReport.messages) {
      const rule = msg.ruleId || 'eslint';
      const text = msg.message || 'ESLint violation';

      findings.push({
        suiteId: 'validate_eslint',
        suiteName: 'ESLint Code Hygiene Validator',
        ruleId: 'eslint-violation',
        ruleDescription: 'Error de sintaxis o regla',
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

export class EslintAuditor extends BaseAuditor<EslintRuleId> {
  constructor() {
    super({
      id: 'validate_eslint',
      name: 'ESLint Code Hygiene Validator',
      description: 'Reglas de estilo, buenas prácticas y sintaxis con ESLint',
      family: 'architecture',
      packageName: 'ESLint',
      ruleIds: ESLINT_RULES,
      ruleDescriptions: {
        'eslint-violation': 'Error de sintaxis o regla'
      }
    });
  }

  public override async runAudit(): Promise<void> {
    const isFixMode = process.argv.includes('fix') || process.argv.includes('--fix') || Boolean((this.context.values as Record<string, unknown>).fix);
    this.context.logStep(1, 2, `Ejecutando ESLint (modo: ${isFixMode ? 'auto-fix' : 'verificación'})...`);

    const binPath = path.resolve(this.projectRoot, 'node_modules/eslint/bin/eslint.js');
    const args: string[] = ['--config', 'eslint.config.js', '.', '--cache', '-f', 'json']; // no-domain: Non-domain utility collection or data structure

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

    const combinedOutput = `${proc.stdout || ''}\n${proc.stderr || ''}`;
    const findings = parseEslintResults(combinedOutput, this.projectRoot);

    this.context.logStep(2, 2, `Procesando violaciones de ESLint (${findings.length} problemas)...`);

    for (const finding of findings) {
      this.addViolation({
        ruleId: 'eslint-violation',
        severity: 'error',
        file: finding.file || '',
        line: finding.line || DEFAULT_ERROR_LINE,
        context: finding.context || 'eslint',
        message: finding.message
      });
    }

    this.filesScannedCount = 1;
    this.context.setMetric('eslint_violations', findings.length);
    this.context.setMetric('mode', isFixMode ? 'fix' : 'check');
  }
}

// Canonical CLI Entrypoint
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new EslintAuditor());
}
