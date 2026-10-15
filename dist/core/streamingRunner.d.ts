import { AuditTaskDefinition, SubAuditorReport } from "./auditContract.js";
//#region src/core/streamingRunner.d.ts
export interface TaskStreamProgressParams {
  taskName: string;
  taskId: string;
  subLines: readonly string[];
  durationMs: number;
  isSuccess: boolean;
  hasWarnings?: boolean;
  isSkipped?: boolean;
  isBuiltin?: boolean;
  icon?: string;
  taskIndex?: number;
  subAuditors?: readonly SubAuditorReport[];
}
export declare const STREAM_LINE_SEVERITY_COLORS: readonly ["red", "yellow", "dim"];
export type StreamLineSeverityColor = (typeof STREAM_LINE_SEVERITY_COLORS)[number];
export declare function colorizeStreamSubLine(line: string, params: {
  isSuccess: boolean;
  hasWarnings?: boolean;
  subAuditors?: readonly SubAuditorReport[];
}): string;
export declare class TaskStreamCoordinator {
  private completedCount;
  private readonly totalTasks;
  private readonly indent;
  private printLock;
  constructor(totalTasks: number, options?: {
    indent?: string;
  });
  onTaskComplete(params: TaskStreamProgressParams): Promise<void>;
  private printTaskItem;
}
export declare function isNodeInternalWarning(line: string): boolean;
export interface ExecutedTaskOutput {
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}
export declare function executeAuditorStreaming(task: AuditTaskDefinition, args: string[], onSubProgress?: (line: string) => void): Promise<ExecutedTaskOutput>;
//#endregion