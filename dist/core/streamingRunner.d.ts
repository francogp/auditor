/**
 * scripts/lib/streamingRunner.ts
 *
 * SHARED STREAMING EXECUTION ENGINE (Node.js 26+)
 * Provides unified, non-blocking asynchronous process streaming with:
 *   1. Real-time sub-task and progress output.
 *   2. Automatic filtering of internal Node.js permission and deprecation warnings.
 *   3. Strict timeout enforcement with SIGKILL escalation.
 *   4. Clean structured output resolution for orchestrators.
 */
import { type AuditTaskDefinition } from './auditContract.ts';
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
}
export declare class TaskStreamCoordinator {
    private completedCount;
    private readonly totalTasks;
    private readonly indent;
    private printLock;
    constructor(totalTasks: number, options?: {
        indent?: string;
    });
    onTaskComplete(params: TaskStreamProgressParams): Promise<void>;
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
//# sourceMappingURL=streamingRunner.d.ts.map