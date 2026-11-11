import { describe, expect, it } from 'vite-plus/test';

import {
  ModalSequenceQueue,
  createModalSequenceQueue,
  createModalStack,
  type ModalCloseReason,
  type ModalStackManager
} from '../src/modals/index.ts';

type PostBattleModalKind = 'move_learning' | 'evolution' | 'event_auto_enroll' | 'fishing_minigame';

interface SequenceModalMeta {
  readonly pokemonName?: string;
  readonly moveName?: string;
  readonly eventTitle?: string;
}

interface SequenceContext {
  readonly stack: ModalStackManager<PostBattleModalKind, SequenceModalMeta>;
  readonly executionLog: string[];
}

const PRIORITY_MOVE_LEARNING = 100;
const PRIORITY_EVOLUTION = 80;
const PRIORITY_EVENT_ENROLL = 60;

function enqueueModalStep(
  queue: ModalSequenceQueue<PostBattleModalKind, SequenceContext>,
  params: {
    readonly taskUid: string;
    readonly kind: PostBattleModalKind;
    readonly priority: number;
    readonly label: string;
    readonly meta?: SequenceModalMeta;
  }
): void {
  queue.enqueue({
    taskUid: params.taskUid,
    kind: params.kind,
    priority: params.priority,
    async execute(ctx): Promise<void> {
      ctx.executionLog.push(`open:${params.label}`);
      const opened = ctx.stack.open({
        kind: params.kind,
        modalUid: `modal-${params.taskUid}`,
        meta: params.meta
      });
      const result = await ctx.stack.waitForClose(opened.modalUid);
      ctx.executionLog.push(`closed:${params.label}:${result.reason}`);
    }
  });
}

async function closeCurrentTopWhenReady(
  stack: ModalStackManager<PostBattleModalKind, SequenceModalMeta>,
  reason: ModalCloseReason = 'close-button'
): Promise<void> {
  await Promise.resolve();
  const top = stack.getSnapshot().activeTop;
  if (top) {
    stack.requestClose(top.modalUid, reason);
  }
  await Promise.resolve();
}

describe('ModalSequenceQueue — Ported PokeBorrador 7-Scenario Priority Coordinator Suite', () => {
  describe('Scenario 1 (1a, 1b, 1c): Isolated Individual Modals', () => {
    it.each([
      {
        caseId: '1a',
        kind: 'move_learning' as const,
        priority: PRIORITY_MOVE_LEARNING,
        label: 'Pikachu-Thunderbolt'
      },
      {
        caseId: '1b',
        kind: 'evolution' as const,
        priority: PRIORITY_EVOLUTION,
        label: 'Charmander-Charmeleon'
      },
      {
        caseId: '1c',
        kind: 'event_auto_enroll' as const,
        priority: PRIORITY_EVENT_ENROLL,
        label: 'FishingCup'
      }
    ])(
      'executes isolated modal sequence ($caseId: $kind) via event-driven waitForClose with zero polling',
      async ({ caseId, kind, priority, label }) => {
        const stack = createModalStack<PostBattleModalKind, SequenceModalMeta>({
          animatedClose: false
        });
        const queue = createModalSequenceQueue<PostBattleModalKind, SequenceContext>();
        const executionLog: string[] = [];

        enqueueModalStep(queue, {
          taskUid: `task-${caseId}`,
          kind,
          priority,
          label
        });

        const runPromise = queue.runSequence({ stack, executionLog });
        expect(stack.getSnapshot().activeTop?.kind).toBe(kind);
        expect(executionLog).toEqual([`open:${label}`]);

        stack.closeTop('close-button');
        await runPromise;

        expect(executionLog).toEqual([`open:${label}`, `closed:${label}:close-button`]);
        expect(queue.isBusy()).toBe(false);
        expect(stack.getSnapshot().hasOpenModals).toBe(false);
      }
    );
  });

  describe('Scenario 2: Multiple Same-Kind Items in Strict Serial Order', () => {
    it('opens the second move_learning modal only after the first modal has completely closed', async () => {
      const stack = createModalStack<PostBattleModalKind, SequenceModalMeta>({
        animatedClose: false
      });
      const queue = createModalSequenceQueue<PostBattleModalKind, SequenceContext>();
      const executionLog: string[] = [];
      let maxObservedConcurrentModals = 0;

      stack.subscribe((snap) => {
        if (snap.activeCount > maxObservedConcurrentModals) {
          maxObservedConcurrentModals = snap.activeCount;
        }
      });

      enqueueModalStep(queue, {
        taskUid: 'move-1',
        kind: 'move_learning',
        priority: PRIORITY_MOVE_LEARNING,
        label: 'Move-1',
        meta: { moveName: 'Agility' }
      });
      enqueueModalStep(queue, {
        taskUid: 'move-2',
        kind: 'move_learning',
        priority: PRIORITY_MOVE_LEARNING,
        label: 'Move-2',
        meta: { moveName: 'Thunder' }
      });

      const sequenceDone = queue.runSequence({ stack, executionLog });
      expect(stack.getSnapshot().activeTop?.modalUid).toBe('modal-move-1');
      expect(stack.hasUid('modal-move-2')).toBe(false);

      await closeCurrentTopWhenReady(stack, 'close-button');
      expect(stack.getSnapshot().activeTop?.modalUid).toBe('modal-move-2');

      await closeCurrentTopWhenReady(stack, 'close-button');
      await sequenceDone;

      expect(maxObservedConcurrentModals).toBe(1);
      expect(executionLog).toEqual([
        'open:Move-1',
        'closed:Move-1:close-button',
        'open:Move-2',
        'closed:Move-2:close-button'
      ]);
    });
  });

  describe('Scenario 3 & Scenario 4: Priority Sorting (100 -> 80 -> 60) & Dynamic Enqueueing', () => {
    it('executes higher priority (100) before lower priority (80) even when 80 was enqueued first', async () => {
      const stack = createModalStack<PostBattleModalKind, SequenceModalMeta>({
        animatedClose: false
      });
      const queue = createModalSequenceQueue<PostBattleModalKind, SequenceContext>();
      const executionLog: string[] = [];

      enqueueModalStep(queue, {
        taskUid: 'evo-first',
        kind: 'evolution',
        priority: PRIORITY_EVOLUTION,
        label: 'Evolution-80'
      });
      enqueueModalStep(queue, {
        taskUid: 'move-second',
        kind: 'move_learning',
        priority: PRIORITY_MOVE_LEARNING,
        label: 'MoveLearning-100'
      });

      expect(queue.getPendingTasks().map((t) => t.taskUid)).toEqual(['move-second', 'evo-first']);

      const runPromise = queue.runSequence({ stack, executionLog });
      expect(stack.getSnapshot().activeTop?.kind).toBe('move_learning');

      await closeCurrentTopWhenReady(stack);
      expect(stack.getSnapshot().activeTop?.kind).toBe('evolution');

      await closeCurrentTopWhenReady(stack);
      await runPromise;

      expect(executionLog).toEqual([
        'open:MoveLearning-100',
        'closed:MoveLearning-100:close-button',
        'open:Evolution-80',
        'closed:Evolution-80:close-button'
      ]);
    });

    it('drains full 3-tier post-battle combo (60, 100, 80 + hot-enqueued 80) in strict priority order', async () => {
      const stack = createModalStack<PostBattleModalKind, SequenceModalMeta>({
        animatedClose: false
      });
      const queue = createModalSequenceQueue<PostBattleModalKind, SequenceContext>();
      const executionLog: string[] = [];

      enqueueModalStep(queue, {
        taskUid: 'event-60',
        kind: 'event_auto_enroll',
        priority: PRIORITY_EVENT_ENROLL,
        label: 'Event-60'
      });
      enqueueModalStep(queue, {
        taskUid: 'move-100',
        kind: 'move_learning',
        priority: PRIORITY_MOVE_LEARNING,
        label: 'Move-100'
      });
      enqueueModalStep(queue, {
        taskUid: 'evo-80-a',
        kind: 'evolution',
        priority: PRIORITY_EVOLUTION,
        label: 'Evo-80-A'
      });

      const runPromise = queue.runSequence({ stack, executionLog });
      // Hot-enqueue a second evolution while Move-100 is open on screen
      enqueueModalStep(queue, {
        taskUid: 'evo-80-b',
        kind: 'evolution',
        priority: PRIORITY_EVOLUTION,
        label: 'Evo-80-B'
      });

      await closeCurrentTopWhenReady(stack);
      await closeCurrentTopWhenReady(stack);
      await closeCurrentTopWhenReady(stack);
      await closeCurrentTopWhenReady(stack);
      await runPromise;

      expect(executionLog).toEqual([
        'open:Move-100',
        'closed:Move-100:close-button',
        'open:Evo-80-A',
        'closed:Evo-80-A:close-button',
        'open:Evo-80-B',
        'closed:Evo-80-B:close-button',
        'open:Event-60',
        'closed:Event-60:close-button'
      ]);
    });
  });

  describe('Scenario 5, 6 & 7: User Escape Cancellation, isBusy Loop Guard & waitUntilIdle Overlap Prevention', () => {
    it('completes cleanly without hanging promises when user cancels modals with Escape (Scenario 5)', async () => {
      const stack = createModalStack<PostBattleModalKind, SequenceModalMeta>({
        animatedClose: false
      });
      const queue = createModalSequenceQueue<PostBattleModalKind, SequenceContext>();
      const executionLog: string[] = [];

      enqueueModalStep(queue, {
        taskUid: 'cancel-1',
        kind: 'move_learning',
        priority: PRIORITY_MOVE_LEARNING,
        label: 'MoveCancel'
      });
      enqueueModalStep(queue, {
        taskUid: 'cancel-2',
        kind: 'evolution',
        priority: PRIORITY_EVOLUTION,
        label: 'EvoCancel'
      });

      const runPromise = queue.runSequence({ stack, executionLog });
      await closeCurrentTopWhenReady(stack, 'escape');
      await closeCurrentTopWhenReady(stack, 'escape');
      await runPromise;

      expect(executionLog).toEqual([
        'open:MoveCancel',
        'closed:MoveCancel:escape',
        'open:EvoCancel',
        'closed:EvoCancel:escape'
      ]);
      expect(queue.isBusy()).toBe(false);
    });

    it('keeps isBusy() and isRunning() true throughout multi-step execution and blocks external minigame overlap via waitUntilIdle() (Scenarios 6 & 7)', async () => {
      const stack = createModalStack<PostBattleModalKind, SequenceModalMeta>({
        animatedClose: false
      });
      const queue = new ModalSequenceQueue<PostBattleModalKind, SequenceContext>();
      const executionLog: string[] = [];

      // When already idle, waitUntilIdle resolves immediately
      await expect(queue.waitUntilIdle()).resolves.toBeUndefined();
      expect(queue.isBusy()).toBe(false);
      expect(queue.isRunning()).toBe(false);

      enqueueModalStep(queue, {
        taskUid: 'seq-1',
        kind: 'move_learning',
        priority: PRIORITY_MOVE_LEARNING,
        label: 'SeqMove'
      });
      enqueueModalStep(queue, {
        taskUid: 'seq-2',
        kind: 'evolution',
        priority: PRIORITY_EVOLUTION,
        label: 'SeqEvo'
      });

      // Enqueued before runSequence -> already busy!
      expect(queue.isBusy()).toBe(true);
      expect(queue.isRunning()).toBe(false);

      const sequencePromise = queue.runSequence({ stack, executionLog });
      // Concurrent runSequence call deduplicates onto active promise
      expect(queue.runSequence({ stack, executionLog })).toBe(sequencePromise);
      expect(queue.isRunning()).toBe(true);

      // External fishing minigame waits on waitUntilIdle() before opening its own modal
      let minigameOpened = false;
      const launchMinigameWhenIdle = queue.waitUntilIdle().then(() => {
        minigameOpened = true;
        executionLog.push('open:FishingMinigame');
        stack.open({ kind: 'fishing_minigame', modalUid: 'modal-fishing' });
      });

      await Promise.resolve();
      expect(minigameOpened).toBe(false);
      expect(stack.hasKind('fishing_minigame')).toBe(false);

      // Step 1 closes -> still busy on Step 2, minigame still blocked!
      await closeCurrentTopWhenReady(stack, 'close-button');
      expect(queue.isBusy()).toBe(true);
      expect(minigameOpened).toBe(false);

      // Step 2 closes -> queue becomes idle -> FishingMinigame opens immediately!
      await closeCurrentTopWhenReady(stack, 'close-button');
      await sequencePromise;
      await launchMinigameWhenIdle;

      expect(minigameOpened).toBe(true);
      expect(stack.getSnapshot().activeTop?.kind).toBe('fishing_minigame');
      expect(executionLog).toEqual([
        'open:SeqMove',
        'closed:SeqMove:close-button',
        'open:SeqEvo',
        'closed:SeqEvo:close-button',
        'open:FishingMinigame'
      ]);
      stack.clearAll();
    });
  });

  describe('Canary Tests & Auto-Repair: Task Error Resilience & Mid-Flight Queue Clear', () => {
    it('isolates task exceptions via onTaskError without aborting subsequent queued modals and unblocks waitUntilIdle on clear()', async () => {
      const stack = createModalStack<PostBattleModalKind, SequenceModalMeta>({
        animatedClose: false
      });
      const capturedErrors: string[] = [];
      const queue = createModalSequenceQueue<PostBattleModalKind, SequenceContext>({
        onTaskError: (err, task) => {
          capturedErrors.push(`${task.taskUid}:${err.message}`);
        }
      });
      const executionLog: string[] = [];

      queue.enqueue({
        taskUid: 'boom-task',
        kind: 'move_learning',
        priority: PRIORITY_MOVE_LEARNING,
        execute(): Promise<void> {
          return Promise.reject(new Error('Simulated network timeout'));
        }
      });
      enqueueModalStep(queue, {
        taskUid: 'survivor-task',
        kind: 'evolution',
        priority: PRIORITY_EVOLUTION,
        label: 'SurvivorEvo'
      });

      const runPromise = queue.runSequence({ stack, executionLog });
      await Promise.resolve();
      await Promise.resolve();

      expect(capturedErrors).toEqual(['boom-task:Simulated network timeout']);
      expect(stack.getSnapshot().activeTop?.modalUid).toBe('modal-survivor-task');

      await closeCurrentTopWhenReady(stack, 'close-button');
      await runPromise;
      expect(executionLog).toEqual(['open:SurvivorEvo', 'closed:SurvivorEvo:close-button']);

      // Verify clear() immediately flushes waitUntilIdle waiters
      enqueueModalStep(queue, {
        taskUid: 'pending-clear',
        kind: 'event_auto_enroll',
        priority: PRIORITY_EVENT_ENROLL,
        label: 'PendingClear'
      });
      let idleResolved = false;
      const idleWait = queue.waitUntilIdle().then(() => {
        idleResolved = true;
      });
      queue.clear();
      await idleWait;
      expect(idleResolved).toBe(true);
      expect(queue.isBusy()).toBe(false);
    });

    it('propagates task errors fail-loud with preserved cause when onTaskError is omitted, and prevents mid-flight clear() from clobbering a new runSequence()', async () => {
      // 1. Fail-loud with preserved { cause } when onTaskError is omitted
      const strictQueue = createModalSequenceQueue<PostBattleModalKind>();
      const rawNonErrorReason = { code: 'ERR_MODAL_STEP' };
      strictQueue.enqueue({
        taskUid: 'strict-fail',
        kind: 'move_learning',
        priority: PRIORITY_MOVE_LEARNING,
        execute(): Promise<void> {
          return Promise.reject(rawNonErrorReason);
        }
      });

      let caughtError: Error | undefined;
      try {
        await strictQueue.runSequence(undefined);
      } catch (err: unknown) {
        if (err instanceof Error) {
          caughtError = err;
        }
      }
      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError?.cause).toBe(rawNonErrorReason);
      expect(strictQueue.isBusy()).toBe(false);

      // 2. Mid-flight clear() during an active task must NOT clobber an immediately restarted runSequence()
      const raceQueue = createModalSequenceQueue<PostBattleModalKind, string[]>();
      const events: string[] = [];
      let resolveStaleTask!: () => void;

      raceQueue.enqueue({
        taskUid: 'stale-inflight',
        kind: 'move_learning',
        priority: PRIORITY_MOVE_LEARNING,
        execute(log): Promise<void> {
          log.push('start:stale-inflight');
          return new Promise<void>((resolve) => {
            resolveStaleTask = resolve;
          });
        }
      });
      raceQueue.enqueue({
        taskUid: 'aborted-followup',
        kind: 'evolution',
        priority: PRIORITY_EVOLUTION,
        execute(log): void {
          log.push('unexpected:aborted-followup');
        }
      });

      const staleRun = raceQueue.runSequence(events);
      expect(events).toEqual(['start:stale-inflight']);

      // Clear mid-flight and immediately start a fresh sequence before stale-inflight settles
      raceQueue.clear();
      expect(raceQueue.isRunning()).toBe(false);

      let resolveFreshTask!: () => void;
      raceQueue.enqueue({
        taskUid: 'fresh-inflight',
        kind: 'event_auto_enroll',
        priority: PRIORITY_EVENT_ENROLL,
        execute(log): Promise<void> {
          log.push('start:fresh-inflight');
          return new Promise<void>((resolve) => {
            resolveFreshTask = resolve;
          });
        }
      });

      const freshRun = raceQueue.runSequence(events);
      expect(raceQueue.isRunning()).toBe(true);

      // Settle the old cancelled task now -> must NOT flip raceQueue.isRunning() to false!
      resolveStaleTask();
      await staleRun;
      expect(raceQueue.isRunning()).toBe(true);
      expect(raceQueue.isBusy()).toBe(true);

      resolveFreshTask();
      await freshRun;
      expect(raceQueue.isRunning()).toBe(false);
      expect(events).toEqual(['start:stale-inflight', 'start:fresh-inflight']);
    });
  });
});
