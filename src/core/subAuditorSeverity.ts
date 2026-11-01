/**
 * packages/auditor/src/core/subAuditorSeverity.ts
 *
 * Severity evaluation and effective counts resolution for sub-auditors and task streams.
 */

import { type SubAuditorStatus } from './auditContract.ts';

export interface SubAuditorSeverityTarget {
  readonly status?: SubAuditorStatus | 'skipped';
  readonly errorsCount?: number;
  readonly warningsCount?: number;
}

export function isSubAuditorFailed(report: SubAuditorSeverityTarget): boolean {
  return (report.errorsCount ?? 0) > 0 || report.status === 'failed';
}

export function isSubAuditorWarning(report: SubAuditorSeverityTarget): boolean {
  return (report.warningsCount ?? 0) > 0 || report.status === 'warning';
}

export function resolveEffectiveErrorsCount(
  report: SubAuditorSeverityTarget,
  fallbackCount = 0
): number {
  if ((report.errorsCount ?? 0) > 0) return report.errorsCount!;
  return isSubAuditorFailed(report) ? fallbackCount : 0;
}

export function resolveEffectiveWarningsCount(
  report: SubAuditorSeverityTarget,
  fallbackCount = 0
): number {
  if ((report.warningsCount ?? 0) > 0) return report.warningsCount!;
  return isSubAuditorWarning(report) && !isSubAuditorFailed(report) ? fallbackCount : 0;
}
