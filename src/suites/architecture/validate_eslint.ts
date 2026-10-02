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
import { executeNodeCli } from '../../cli/cliUtils.ts';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
import { parseLintResultsToFindings, type RawLintMessage, type RawLintFileReport } from '../../core/reportUtils.ts';

enableCompileCache();

export type EslintRuleId = 'eslint-violation';

export const ESLINT_RULES: readonly EslintRuleId[] = [
  'eslint-violation'
] as const;

const MAX_BUFFER_BYTES = 52428800 as const;
const EXECUTION_TIMEOUT_MS = 120000 as const;

export type RawEslintMessage = RawLintMessage;
export type RawEslintFileReport = RawLintFileReport;

/**
 * Parses raw JSON output or an array of file reports from ESLint into canonical AuditFindings.
 * Elevates both warnings (severity 1) and errors (severity 2) to severity: 'error' (Zero-Warning Policy).
 */
export function parseEslintResults(input: string | object[], cwd: string = process.cwd()): AuditFinding[] {
  return parseLintResultsToFindings(input, {
    cwd,
    suiteId: 'validate_eslint',
    suiteName: 'ESLint Code Hygiene Validator',
    ruleId: 'eslint-violation',
    ruleDescription: 'Error de sintaxis o regla',
    defaultRuleName: 'eslint',
    defaultMessage: 'ESLint violation'
  });
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
    const isFixMode = this.isFixModeRequested();
    this.context.logStep(1, 2, `Ejecutando ESLint (modo: ${isFixMode ? 'auto-fix' : 'verificación'})...`);

    const binPath = path.resolve(this.projectRoot, 'node_modules/eslint/bin/eslint.js');
    const args: string[] = ['--config', 'eslint.config.js', '.', '--cache', '-f', 'json']; // no-domain: Non-domain utility collection or data structure

    if (isFixMode) {
      args.push('--fix');
    }

    const combinedOutput = executeNodeCli(binPath, args, {
      cwd: this.projectRoot,
      maxBuffer: MAX_BUFFER_BYTES,
      timeout: EXECUTION_TIMEOUT_MS
    });
    const findings = parseEslintResults(combinedOutput, this.projectRoot);

    this.context.logStep(2, 2, `Procesando violaciones de ESLint (${findings.length} problemas)...`);

    this.importAuditFindings(findings, 'eslint-violation', 'eslint');

    this.filesScannedCount = 1;
    this.context.setMetric('eslint_violations', findings.length);
    this.context.setMetric('mode', isFixMode ? 'fix' : 'check');
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new EslintAuditor());
