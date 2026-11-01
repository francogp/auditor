import { AuditTaskDefinition } from "./auditContract.js";
export declare function isNodeInternalWarning(line: string): boolean;
export interface ExecutedTaskOutput {
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}
export declare function executeAuditorStreaming(task: AuditTaskDefinition, args: string[], onSubProgress?: (line: string) => void): Promise<ExecutedTaskOutput>;