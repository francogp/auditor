/**
 * src/modals/modalSequenceQueue.ts
 *
 * Priority-ordered sequential modal/task coordinator with deterministic,
 * event-driven idle resolution (zero polling timers).
 */
export interface ModalSequenceTask<TTaskKind extends string = string, TContext = undefined> {
  readonly taskUid: string;
  readonly kind: TTaskKind;
  readonly priority: number;
  execute(context: TContext): Promise<void> | void;
}
export interface ModalSequenceQueueConfig<TTaskKind extends string = string, TContext = undefined> {
  readonly onTaskError?: (error: Error, task: ModalSequenceTask<TTaskKind, TContext>) => void;
}
export declare class ModalSequenceQueue<TTaskKind extends string = string, TContext = undefined> {
  private readonly onTaskError;
  private queued;
  private nextInsertionOrder;
  private running;
  private runGeneration;
  private activeRunPromise;
  private readonly idleWaiters;
  constructor(config?: ModalSequenceQueueConfig<TTaskKind, TContext>);
  isRunning(): boolean;
  isBusy(): boolean;
  getPendingTasks(): readonly ModalSequenceTask<TTaskKind, TContext>[];
  enqueue(task: ModalSequenceTask<TTaskKind, TContext>): void;
  clear(): void;
  waitUntilIdle(): Promise<void>;
  runSequence(context: TContext): Promise<void>;
  private drainQueue;
  private flushIdleWaiters;
}
export declare function createModalSequenceQueue<TTaskKind extends string = string, TContext = undefined>(config?: ModalSequenceQueueConfig<TTaskKind, TContext>): ModalSequenceQueue<TTaskKind, TContext>;