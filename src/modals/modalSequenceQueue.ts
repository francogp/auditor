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

interface QueuedModalTask<TTaskKind extends string, TContext> {
  readonly task: ModalSequenceTask<TTaskKind, TContext>;
  readonly insertionOrder: number;
}

function compareQueuedTasks<TTaskKind extends string, TContext>(
  left: QueuedModalTask<TTaskKind, TContext>,
  right: QueuedModalTask<TTaskKind, TContext>
): number {
  if (right.task.priority !== left.task.priority) {
    return right.task.priority - left.task.priority;
  }
  return left.insertionOrder - right.insertionOrder;
}

export class ModalSequenceQueue<TTaskKind extends string = string, TContext = undefined> {
  private readonly onTaskError:
    | ((error: Error, task: ModalSequenceTask<TTaskKind, TContext>) => void)
    | undefined;
  private queued: QueuedModalTask<TTaskKind, TContext>[] = [];
  private nextInsertionOrder = 0;
  private running = false;
  private runGeneration = 0;
  private activeRunPromise: Promise<void> | null = null;
  private readonly idleWaiters = new Set<() => void>();

  public constructor(config: ModalSequenceQueueConfig<TTaskKind, TContext> = {}) {
    this.onTaskError = config.onTaskError;
  }

  public isRunning(): boolean {
    return this.running;
  }

  public isBusy(): boolean {
    return this.running || this.queued.length > 0;
  }

  public getPendingTasks(): readonly ModalSequenceTask<TTaskKind, TContext>[] {
    const sorted = Array.from(this.queued).sort(compareQueuedTasks);
    return sorted.map((entry) => entry.task);
  }

  public enqueue(task: ModalSequenceTask<TTaskKind, TContext>): void {
    this.queued.push({
      task,
      insertionOrder: this.nextInsertionOrder++
    });
  }

  public clear(): void {
    this.runGeneration++;
    this.queued = [];
    this.running = false;
    this.activeRunPromise = null;
    this.flushIdleWaiters();
  }

  public waitUntilIdle(): Promise<void> {
    if (!this.isBusy()) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.idleWaiters.add(resolve);
    });
  }

  public runSequence(context: TContext): Promise<void> {
    if (this.activeRunPromise) {
      return this.activeRunPromise;
    }
    const generation = ++this.runGeneration;
    this.running = true;
    const execution = this.drainQueue(context, generation).finally(() => {
      if (this.runGeneration === generation) {
        this.running = false;
        this.activeRunPromise = null;
        if (!this.isBusy()) {
          this.flushIdleWaiters();
        }
      }
    });
    this.activeRunPromise = execution;
    return execution;
  }

  private async drainQueue(context: TContext, generation: number): Promise<void> {
    while (this.queued.length > 0 && this.running && this.runGeneration === generation) {
      this.queued.sort(compareQueuedTasks);
      const nextItem = this.queued.shift();
      if (!nextItem) break;

      try {
        await nextItem.task.execute(context);
      } catch (err: unknown) {
        const normalized = err instanceof Error ? err : new Error(String(err), { cause: err });
        if (this.onTaskError) {
          this.onTaskError(normalized, nextItem.task);
        } else {
          throw normalized;
        }
      }
    }
  }

  private flushIdleWaiters(): void {
    if (this.idleWaiters.size === 0) return;
    const pending = Array.from(this.idleWaiters);
    this.idleWaiters.clear();
    for (const resolve of pending) {
      resolve();
    }
  }
}

export function createModalSequenceQueue<TTaskKind extends string = string, TContext = undefined>(
  config: ModalSequenceQueueConfig<TTaskKind, TContext> = {}
): ModalSequenceQueue<TTaskKind, TContext> {
  return new ModalSequenceQueue<TTaskKind, TContext>(config);
}
