/**
 * packages/auditor/src/core/streamingFormat.ts
 *
 * Presentation and severity formatters for streaming task execution output.
 * Formats badges, colored sublines, and step-by-step progress reports.
 */

import { styleText } from 'node:util';

import { type SubAuditorReport } from './auditContract.ts';
import {
  isSubAuditorFailed,
  isSubAuditorWarning,
  type SubAuditorSeverityTarget
} from './subAuditorSeverity.ts';

export { isSubAuditorFailed, isSubAuditorWarning, type SubAuditorSeverityTarget };
export {
  resolveEffectiveErrorsCount,
  resolveEffectiveWarningsCount
} from './subAuditorSeverity.ts';

export interface AuditExecutionVerdict {
  readonly isSuccess: boolean;
  readonly hasWarnings?: boolean;
  readonly errorsCount?: number;
  readonly warningsCount?: number;
}

export interface TaskStreamProgressParams extends AuditExecutionVerdict {
  taskName: string;
  taskId: string;
  subLines: readonly string[];
  durationMs: number;
  isSkipped?: boolean;
  isBuiltin?: boolean;
  icon?: string;
  taskIndex?: number;
  subAuditors?: readonly SubAuditorReport[];
}

export const STREAM_LINE_SEVERITY_COLORS = ['red', 'yellow', 'dim'] as const;
export type StreamLineSeverityColor = (typeof STREAM_LINE_SEVERITY_COLORS)[number];

export function formatFindingCountBadge(errorsCount = 0, warningsCount = 0): string {
  const parts: string[] = [];
  if (errorsCount > 0) {
    parts.push(`${errorsCount} error${errorsCount === 1 ? '' : 's'}`);
  }
  if (warningsCount > 0) {
    parts.push(`${warningsCount} warning${warningsCount === 1 ? '' : 's'}`);
  }
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

function resolveStepIndex(line: string): number {
  const match = line.match(/\[(\d+)\/(\d+)\]/);
  return match ? parseInt(match[1]!, 10) - 1 : -1;
}

export function getColorFromSubAuditor(
  line: string,
  subAuditors?: readonly SubAuditorReport[]
): StreamLineSeverityColor | null {
  if (!subAuditors) return null;
  const stepIdx = resolveStepIndex(line);
  if (stepIdx < 0) return null;
  const report = subAuditors[stepIdx];
  if (!report) return null;
  if (isSubAuditorFailed(report)) return 'red';
  if (isSubAuditorWarning(report)) return 'yellow';
  if (report.count === 0 && report.status === 'passed') return 'dim';
  return null;
}

export interface ColorizeStreamSubLineParams extends AuditExecutionVerdict {
  readonly subAuditors?: readonly SubAuditorReport[];
}

export interface ExecutionSeverityClassification {
  readonly isError: boolean;
  readonly isWarning: boolean;
}

export function classifyExecutionSeverity(
  verdict: AuditExecutionVerdict
): ExecutionSeverityClassification {
  const isError =
    (verdict.errorsCount ?? 0) > 0 ||
    (!verdict.isSuccess && !verdict.hasWarnings && (verdict.warningsCount ?? 0) === 0);
  const isWarning = (verdict.warningsCount ?? 0) > 0 || Boolean(verdict.hasWarnings);
  return { isError, isWarning };
}

export function colorizeStreamSubLine(line: string, params: ColorizeStreamSubLineParams): string {
  const { isError, isWarning } = classifyExecutionSeverity(params);
  const fallbackColor = isError ? 'red' : isWarning ? 'yellow' : 'dim';
  const color = getColorFromSubAuditor(line, params.subAuditors) ?? fallbackColor;
  if (color === 'red') return styleText('red', line);
  if (color === 'yellow') return styleText('yellow', line);
  return styleText('dim', line);
}

export type ConsoleOutputMode = 'compact' | 'human';
