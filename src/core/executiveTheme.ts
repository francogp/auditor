/**
 * src/core/executiveTheme.ts
 *
 * Ultra-compact, AI-friendly executive console renderer for @francogp/auditor.
 * Emits high-density semantic text without heavy Unicode Box-Drawing decorations.
 */

import { styleText } from 'node:util';

import type { RemediationPhaseId, StandardAuditResult } from './auditContract.ts';
import { formatDurationMs, formatNumber } from './durationFormatter.ts';

export interface ExecutivePassSummaryParams {
  totalSuites: number;
  passedSuites: number;
  skippedSuites?: number;
  totalErrors: number;
  totalWarnings: number;
  durationMs: number;
  latestAuditJsonPath?: string;
  ratchetOk?: boolean;
}

export interface ExecutiveFailPhaseBreakdown {
  phase: RemediationPhaseId;
  errors: number;
  warnings: number;
}

export interface ExecutiveFailSummaryParams {
  totalSuites: number;
  failedSuites: number;
  totalErrors: number;
  totalWarnings: number;
  durationMs: number;
  phaseBreakdown: readonly ExecutiveFailPhaseBreakdown[];
  fixableErrors?: number;
  fixableWarnings?: number;
  latestAuditJsonPath?: string;
}

export interface ExecutiveSetupBlockingSummaryParams {
  totalSuites: number;
  setupErrors: number;
  postponedAppErrors: number;
  durationMs: number;
  blockingSuites: readonly string[];
  hasFixableErrors?: boolean;
  latestAuditJsonPath?: string;
}

export interface ExecutiveFixSummaryParams {
  durationMs: number;
  totalViolationsRepaired: number;
  filesModified: number;
  remainingErrors?: number;
  remainingWarnings?: number;
  latestAuditJsonPath?: string;
}

const PHASE_NAME_PAD_LENGTH = 12;

export function renderExecutivePassSummary(params: ExecutivePassSummaryParams): string {
  const {
    totalSuites,
    passedSuites,
    skippedSuites = 0,
    totalErrors,
    totalWarnings,
    durationMs,
    latestAuditJsonPath = 'scratch/audits/latest_audit.json',
    ratchetOk = true
  } = params;

  const skippedText = skippedSuites > 0 ? ` (${skippedSuites} skipped)` : '';
  const ratchetText = ratchetOk ? ' | Ratchet: OK' : '';

  const isWarningPass = totalWarnings > 0;
  const title = isWarningPass
    ? `[WARN] AUDIT PASSED WITH WARNINGS [${passedSuites}/${totalSuites} suites${skippedText}] in ${formatDurationMs(durationMs)}`
    : `[OK] AUDIT PASSED [${passedSuites}/${totalSuites} suites${skippedText}] in ${formatDurationMs(durationMs)}`;
  const color = isWarningPass ? (['bold', 'yellow'] as const) : (['bold', 'green'] as const);

  const line1 = styleText(color, title);
  const line2 = `  Errors: ${totalErrors} | Warnings: ${totalWarnings}${ratchetText}`;
  const line3 = styleText('dim', `  Report: ${latestAuditJsonPath}`);

  return `${line1}\n${line2}\n${line3}\n`;
}

export function renderExecutiveFailSummary(params: ExecutiveFailSummaryParams): string {
  const {
    totalSuites,
    failedSuites,
    totalErrors,
    totalWarnings,
    durationMs,
    phaseBreakdown,
    fixableErrors = 0,
    fixableWarnings = 0,
    latestAuditJsonPath = 'scratch/audits/latest_audit.json'
  } = params;

  const totalFixable = fixableErrors + fixableWarnings;
  const fixableText = totalFixable > 0 ? ` (${totalFixable} auto-fixable)` : '';
  const suiteText = failedSuites > 0 ? ` in ${failedSuites} suite(s)` : '';

  const header = styleText(
    ['bold', 'red'],
    `[FAIL] AUDIT FAILED [${totalSuites} suites] in ${formatDurationMs(durationMs)}`
  );
  const status = `  Status: ${formatNumber(totalErrors)} error(s), ${formatNumber(totalWarnings)} warning(s)${fixableText}${suiteText}`;

  // no-domain: Non-domain utility collection or data structure
  const phaseLines: string[] = ['  Breakdown by Phase:'];
  for (const p of phaseBreakdown) {
    const errText = p.errors > 0 ? `${p.errors} error(s)` : '';
    const warnText = p.warnings > 0 ? `${p.warnings} warning(s)` : '';
    const counts = [errText, warnText].filter(Boolean).join(', ');
    phaseLines.push(`  • ${p.phase.padEnd(PHASE_NAME_PAD_LENGTH)}: ${counts}`);
  }

  const nextActionLines: string[] = ['  Next Actions for AI:'];
  if (totalFixable > 0) {
    nextActionLines.push(
      `  1. Mandatory Auto-Fix: npm run auditor:fix (${totalFixable} auto-fixable)`
    );
  } else {
    nextActionLines.push(
      '  1. Focus critical phase: npm run auditor:next',
      '  2. Inspect findings:   npm run auditor:findings',
      phaseBreakdown[0]
        ? `  3. Inspect by phase:   npm run auditor:findings -- phase=${phaseBreakdown[0].phase}`
        : '  3. Inspect by rule:    npm run auditor:by-rule',
      '  4. Consult rule guide: npm run auditor -- guide <ruleId>'
    );
  }

  const reportLine = styleText('dim', `  Full Report: ${latestAuditJsonPath}`);

  return `${header}\n${status}\n\n${phaseLines.join('\n')}\n\n${nextActionLines.join('\n')}\n\n${reportLine}\n`;
}

export function renderExecutiveSetupBlockingSummary(
  params: ExecutiveSetupBlockingSummaryParams
): string {
  const {
    totalSuites,
    setupErrors,
    postponedAppErrors,
    durationMs,
    blockingSuites,
    hasFixableErrors,
    latestAuditJsonPath = 'scratch/audits/latest_audit.json'
  } = params;

  const header = styleText(
    ['bold', 'red'],
    `[BLOCKED] AUDIT BLOCKED: Setup Phase Failure [${totalSuites} suites] in ${formatDurationMs(durationMs)}`
  );
  const postponedSuffix =
    postponedAppErrors > 0
      ? ` (${formatNumber(postponedAppErrors)} downstream app errors postponed to prevent false positives)`
      : '';
  const status = `  Status: ${formatNumber(setupErrors)} setup error(s)${postponedSuffix}`;

  // no-domain: Non-domain utility collection or data structure
  const suitesLines: string[] = ['  Blocking Suites:'];
  for (const s of blockingSuites) {
    suitesLines.push(`  • ${s}`);
  }

  const warning = styleText(
    ['bold', 'yellow'],
    '  MANDATE: STRICTLY FORBIDDEN to modify application code or styles while setup phase is blocked.'
  );

  const nextActionLines: string[] = [
    '  Next Actions for AI:',
    '  1. Inspect setup issues: npm run auditor:findings -- phase=setup',
    hasFixableErrors
      ? '  2. Run setup auto-repair: npm run auditor:fix'
      : '  2. Fix configuration in .auditor/audit.config.ts or package.json'
  ];

  const reportLine = styleText('dim', `  Full Report: ${latestAuditJsonPath}`);

  return `${header}\n${status}\n\n${suitesLines.join('\n')}\n\n${warning}\n\n${nextActionLines.join('\n')}\n\n${reportLine}\n`;
}

export function renderExecutiveFixSummary(params: ExecutiveFixSummaryParams): string {
  const {
    durationMs,
    totalViolationsRepaired,
    filesModified,
    remainingErrors = 0,
    remainingWarnings = 0,
    latestAuditJsonPath = 'scratch/audits/latest_audit.json'
  } = params;

  const header = styleText(
    ['bold', 'green'],
    `[OK] AUTO-FIX COMPLETED in ${formatDurationMs(durationMs)}`
  );
  const details = `  Repaired: ${formatNumber(totalViolationsRepaired)} violation(s) across ${formatNumber(filesModified)} file(s)`;

  let remaining = '';
  if (remainingErrors > 0 || remainingWarnings > 0) {
    remaining = styleText(
      'yellow',
      `  Remaining: ${formatNumber(remainingErrors)} unfixable error(s), ${formatNumber(remainingWarnings)} warning(s)`
    );
  }

  const nextAction = "  Next Action: Run 'npm run auditor' to verify clean pass.";
  const reportLine = styleText('dim', `  Full Report: ${latestAuditJsonPath}`);

  const lines = [header, details];
  if (remaining) lines.push(remaining);
  lines.push(nextAction, reportLine);

  return `${lines.join('\n')}\n`;
}

export function extractPhaseBreakdown(
  results: readonly StandardAuditResult[]
): ExecutiveFailPhaseBreakdown[] {
  const map = new Map<RemediationPhaseId, { errors: number; warnings: number }>();

  for (const r of results) {
    for (const f of r.findings ?? []) {
      const phase: RemediationPhaseId = f.remediationPhase || 'behavior';
      const entry = map.get(phase) ?? { errors: 0, warnings: 0 };
      if (f.severity === 'error') {
        entry.errors++;
      } else {
        entry.warnings++;
      }
      map.set(phase, entry);
    }
  }

  const result: ExecutiveFailPhaseBreakdown[] = [];
  for (const [phase, data] of map.entries()) {
    if (data.errors > 0 || data.warnings > 0) {
      result.push({ phase, errors: data.errors, warnings: data.warnings });
    }
  }

  // Sort phases strategically: setup first, then by error count descending
  return result.sort((a, b) => {
    if (a.phase === 'setup') return -1;
    if (b.phase === 'setup') return 1;
    return b.errors - a.errors;
  });
}
