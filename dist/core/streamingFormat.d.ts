import { SubAuditorReport } from "./auditContract.js";
import { SubAuditorSeverityTarget, isSubAuditorFailed, isSubAuditorWarning, resolveEffectiveErrorsCount, resolveEffectiveWarningsCount } from "./subAuditorSeverity.js";
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
export declare const STREAM_LINE_SEVERITY_COLORS: readonly ["red", "yellow", "dim"];
export type StreamLineSeverityColor = (typeof STREAM_LINE_SEVERITY_COLORS)[number];
export declare function formatFindingCountBadge(errorsCount?: number, warningsCount?: number): string;
export declare function getColorFromSubAuditor(line: string, subAuditors?: readonly SubAuditorReport[]): StreamLineSeverityColor | null;
export interface ColorizeStreamSubLineParams extends AuditExecutionVerdict {
  readonly subAuditors?: readonly SubAuditorReport[];
}
export interface ExecutionSeverityClassification {
  readonly isError: boolean;
  readonly isWarning: boolean;
}
export declare function classifyExecutionSeverity(verdict: AuditExecutionVerdict): ExecutionSeverityClassification;
export declare function colorizeStreamSubLine(line: string, params: ColorizeStreamSubLineParams): string;
export type ConsoleOutputMode = 'compact' | 'human';
export { type SubAuditorSeverityTarget, isSubAuditorFailed, isSubAuditorWarning, resolveEffectiveErrorsCount, resolveEffectiveWarningsCount };