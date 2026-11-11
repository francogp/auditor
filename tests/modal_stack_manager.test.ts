import { describe, expect, it, vi } from 'vite-plus/test';

import {
  CANONICAL_Z_LAYERS,
  ModalStackManager,
  createModalStack,
  resolveModalZLayers,
  type ModalCeilingDiagnostic,
  type ModalLifecycleEvent
} from '../src/modals/index.ts';

type GameModalKind =
  | 'TestA'
  | 'TestB'
  | 'TestC'
  | 'Profile'
  | 'Shop'
  | 'Confirm'
  | 'Settings'
  | 'Inventory'
  | 'AlarmRulesModal'
  | 'ConfirmModal'
  | 'Notification'
  | `CatalogModal_${number}`;

interface ModalPayload {
  readonly title?: string;
  readonly dirty?: boolean;
  readonly step?: number;
}

describe('ModalStackManager & Customizable Z-Layer Governance', () => {
  describe('Ported PokeBorrador Suite: ModalStore Stacking (LIFO)', () => {
    it('pushes modals onto stack in LIFO order preserving metadata and reference-stable snapshots', () => {
      const stack = createModalStack<GameModalKind, ModalPayload>();
      const emptySnap = stack.getSnapshot();
      expect(emptySnap.hasOpenModals).toBe(false);
      expect(stack.getSnapshot()).toBe(emptySnap);

      const entryA = stack.open({
        kind: 'TestA',
        modalUid: 'modal-a',
        meta: { title: 'First Modal', step: 1 }
      });
      const entryB = stack.open({
        kind: 'TestB',
        modalUid: 'modal-b',
        meta: { title: 'Second Modal', step: 2 }
      });

      const snap = stack.getSnapshot();
      expect(stack.getSnapshot()).toBe(snap);
      expect(snap.totalCount).toBe(2);
      expect(snap.activeCount).toBe(2);
      expect(snap.entries.map((e) => e.modalUid)).toEqual(['modal-a', 'modal-b']);
      expect(snap.activeTop?.modalUid).toBe(entryB.modalUid);
      expect(snap.activeTop?.meta).toEqual({ title: 'Second Modal', step: 2 });
      expect(entryA.zIndex).toBe(CANONICAL_Z_LAYERS.MODAL);
      expect(entryB.zIndex).toBe(CANONICAL_Z_LAYERS.MODAL + CANONICAL_Z_LAYERS.MODAL_STEP);
      expect(entryB.backdropZIndex).toBe(entryB.zIndex);
      expect(entryB.contentZIndex).toBe(entryB.zIndex + 1);
    });

    it('closes only the active top modal via closeTop() and handles empty stack safely', () => {
      const stack = createModalStack<GameModalKind, ModalPayload>({
        holdClosingUntilFinalized: true
      });
      expect(stack.closeTop()).toBe(false);

      stack.open({ kind: 'TestA', modalUid: 'modal-a' });
      stack.open({ kind: 'TestB', modalUid: 'modal-b' });

      expect(stack.closeTop('escape')).toBe(true);
      const midSnap = stack.getSnapshot();
      expect(midSnap.activeTop?.modalUid).toBe('modal-a');
      expect(midSnap.activeCount).toBe(1);
      expect(midSnap.totalCount).toBe(2);
      expect(stack.getByUid('modal-b')?.phase).toBe('closing');

      stack.finalizeClose('modal-b');
      expect(stack.getSnapshot().totalCount).toBe(1);
      expect(stack.hasKind('TestB')).toBe(false);
      expect(stack.hasKind('TestA')).toBe(true);
    });

    it('removes a middle or bottom modal by UID without disturbing the top modal', () => {
      const stack = createModalStack<GameModalKind, ModalPayload>({ animatedClose: false });
      stack.open({ kind: 'TestA', modalUid: 'modal-a' });
      stack.open({ kind: 'TestB', modalUid: 'modal-b' });
      stack.open({ kind: 'TestC', modalUid: 'modal-c' });

      expect(stack.requestClose('modal-b', 'programmatic')).toBe(true);

      const snap = stack.getSnapshot();
      expect(snap.entries.map((e) => e.modalUid)).toEqual(['modal-a', 'modal-c']);
      expect(snap.activeTop?.modalUid).toBe('modal-c');
      expect(stack.hasUid('modal-b')).toBe(false);
      expect(stack.hasUid('modal-a')).toBe(true);
    });

    it('clears all modals immediately or via animated closing phase and tracks hasKind/closeByKind', () => {
      const stack = createModalStack<GameModalKind, ModalPayload>({
        holdClosingUntilFinalized: true
      });
      stack.open({ kind: 'Notification', modalUid: 'notif-1' });
      stack.open({ kind: 'TestA', modalUid: 'modal-a' });
      stack.open({ kind: 'Notification', modalUid: 'notif-2' });

      expect(stack.hasKind('Notification')).toBe(true);
      expect(stack.closeByKind('Notification')).toBe(2);
      expect(stack.hasKind('Notification')).toBe(false);
      expect(stack.hasKind('Notification', { includeClosing: true })).toBe(true);
      expect(stack.hasUid('notif-1')).toBe(false);
      expect(stack.hasUid('notif-1', { includeClosing: true })).toBe(true);

      stack.clearAll({ immediate: true });
      expect(stack.getSnapshot().totalCount).toBe(0);
      expect(stack.hasKind('Notification', { includeClosing: true })).toBe(false);

      stack.open({ kind: 'TestA', modalUid: 'modal-a2' });
      stack.open({ kind: 'TestB', modalUid: 'modal-b2' });
      stack.clearAll({ immediate: false });
      expect(stack.getSnapshot().activeCount).toBe(0);
      expect(stack.getSnapshot().totalCount).toBe(2);
      stack.clearAll({ immediate: true });
      expect(stack.getSnapshot().totalCount).toBe(0);
    });
  });

  describe('Ported PokeBorrador Suite: Modal Store State Lifecycle & Hierarchical isSimplified', () => {
    it('maintains phase="opening" until exact openTimeoutMs boundary (449ms vs 450ms) or completeOpen()', () => {
      vi.useFakeTimers();
      try {
        const openTimeoutMs = 450;
        const preBoundaryMs = 449;
        const stack = createModalStack<GameModalKind>({ openTimeoutMs });
        const events: string[] = [];
        stack.on('open-start', () => events.push('open-start'));
        stack.on('open-end', () => events.push('open-end'));

        const entry = stack.open({ kind: 'TestA', modalUid: 'timed-modal' });
        expect(entry.phase).toBe('opening');
        expect(events).toEqual(['open-start']);

        vi.advanceTimersByTime(preBoundaryMs);
        expect(stack.getByUid('timed-modal')?.phase).toBe('opening');
        expect(events).toEqual(['open-start']);

        vi.advanceTimersByTime(1);
        expect(stack.getByUid('timed-modal')?.phase).toBe('open');
        expect(events).toEqual(['open-start', 'open-end']);
        expect(stack.completeOpen('timed-modal')).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('toggles isSimplified on lower modals immediately at open-start and restores false at close-start', () => {
      const stack = createModalStack<GameModalKind>({
        openTimeoutMs: 500,
        holdClosingUntilFinalized: true
      });

      stack.open({ kind: 'TestA', modalUid: 'modal-a' });
      stack.completeOpen('modal-a');
      expect(stack.getByUid('modal-a')?.isActiveTop).toBe(true);
      expect(stack.getByUid('modal-a')?.isSimplified).toBe(false);

      // Opening B immediately marks A as simplified while B is still in 'opening'
      stack.open({ kind: 'TestB', modalUid: 'modal-b' });
      expect(stack.getByUid('modal-b')?.phase).toBe('opening');
      expect(stack.getByUid('modal-b')?.isActiveTop).toBe(true);
      expect(stack.getByUid('modal-b')?.isSimplified).toBe(false);
      expect(stack.getByUid('modal-a')?.isActiveTop).toBe(false);
      expect(stack.getByUid('modal-a')?.isSimplified).toBe(true);

      // Completing B keeps A simplified
      stack.completeOpen('modal-b');
      expect(stack.getByUid('modal-a')?.isSimplified).toBe(true);

      // Starting B's exit animation immediately restores A as activeTop and non-simplified
      stack.closeTop('escape');
      expect(stack.getByUid('modal-b')?.phase).toBe('closing');
      expect(stack.getByUid('modal-b')?.isActiveTop).toBe(false);
      expect(stack.getByUid('modal-a')?.isActiveTop).toBe(true);
      expect(stack.getByUid('modal-a')?.isSimplified).toBe(false);

      stack.finalizeClose('modal-b');
      expect(stack.getByUid('modal-a')?.isSimplified).toBe(false);
      stack.dispose();
    });

    it('allows disabling automatic simplification via simplifyNonTop: false', () => {
      const stack = createModalStack<GameModalKind>({ simplifyNonTop: false });
      stack.open({ kind: 'TestA', modalUid: 'a' });
      stack.open({ kind: 'TestB', modalUid: 'b' });
      expect(stack.getByUid('a')?.isSimplified).toBe(false);
      expect(stack.getByUid('b')?.isSimplified).toBe(false);
    });
  });

  describe('Ported PokeBorrador Suite: All Modals Fast Mode Contract (obscuresBackground) & Burst Stacking', () => {
    it('enforces obscuresBackground across a 42-modal catalog with non-obscuring Profile and per-open overrides', () => {
      const catalogSize = 41;
      const blockingKinds: GameModalKind[] = Array.from(
        { length: catalogSize },
        (_, idx): GameModalKind => `CatalogModal_${idx + 1}`
      );
      const stack = createModalStack<GameModalKind>({ holdClosingUntilFinalized: true });

      for (const kind of blockingKinds) {
        const opened = stack.open({ kind });
        expect(stack.getSnapshot().obscuresBackground).toBe(true);

        // Immediately drops to false at close-start even before finalizeClose
        stack.requestClose(opened.modalUid, 'close-button');
        expect(stack.getSnapshot().obscuresBackground).toBe(false);
        stack.finalizeClose(opened.modalUid);
      }

      // Non-obscuring Profile modal (or overlay: 'none' override) never triggers background occlusion
      const profile = stack.open({ kind: 'Profile', obscuresBackground: false });
      expect(stack.getSnapshot().hasOpenModals).toBe(true);
      expect(stack.getSnapshot().obscuresBackground).toBe(false);
      stack.forceClose(profile.modalUid);

      // Multi-modal Shop + Confirm hierarchy keeps obscuresBackground true until Shop closes
      const shop = stack.open({ kind: 'Shop', obscuresBackground: true });
      const confirm = stack.open({ kind: 'Confirm', obscuresBackground: true });
      expect(stack.getSnapshot().obscuresBackground).toBe(true);

      stack.requestClose(confirm.modalUid, 'escape');
      expect(stack.getSnapshot().obscuresBackground).toBe(true);
      stack.finalizeClose(confirm.modalUid);
      expect(stack.getSnapshot().obscuresBackground).toBe(true);

      stack.requestClose(shop.modalUid, 'escape');
      expect(stack.getSnapshot().obscuresBackground).toBe(false);
      stack.finalizeClose(shop.modalUid);

      // Foreground battle activity without open modals remains decoupled from obscuresBackground
      const foregroundBattleActive = true;
      expect(foregroundBattleActive && stack.getSnapshot().obscuresBackground).toBe(false);
      const settings = stack.open({ kind: 'Settings' });
      expect(foregroundBattleActive && stack.getSnapshot().obscuresBackground).toBe(true);
      stack.forceClose(settings.modalUid);
      expect(foregroundBattleActive && stack.getSnapshot().obscuresBackground).toBe(false);
    });

    it('handles burst stacking of N=3 and N=10 modals with strictly monotonic z-index layers', () => {
      const stack = createModalStack<GameModalKind>();
      const burstThree = 3;
      const burstTen = 10;

      for (let i = 0; i < burstThree; i++) {
        stack.open({ kind: `CatalogModal_${i}` });
      }
      expect(stack.getSnapshot().activeCount).toBe(burstThree);
      stack.clearAll();
      expect(stack.getSnapshot().totalCount).toBe(0);

      const zIndices: number[] = [];
      for (let i = 0; i < burstTen; i++) {
        const entry = stack.open({ kind: `CatalogModal_${i}` });
        zIndices.push(entry.zIndex);
      }
      for (let i = 1; i < zIndices.length; i++) {
        expect(zIndices[i]!).toBeGreaterThan(zIndices[i - 1]!);
      }
      expect(stack.getSnapshot().highestZIndex).toBe(
        CANONICAL_Z_LAYERS.MODAL + (burstTen - 1) * CANONICAL_Z_LAYERS.MODAL_STEP
      );
      stack.clearAll();
    });
  });

  describe('Canary Tests & Auto-Repair: IPDIFF Dirty Form, Concurrent Exit Freeze & Custom Z-Layers', () => {
    it('supports async dirty-form canClose spawning ConfirmModal above AlarmRulesModal without z-index collision', async () => {
      const stack = new ModalStackManager<GameModalKind, ModalPayload>({ animatedClose: false });
      let isFormDirty = true;
      let resolveGuardGate: ((value: boolean) => void) | null = null;
      const preventedEvents: ModalLifecycleEvent<GameModalKind, ModalPayload>[] = [];
      stack.on('close-prevented', (ev) => preventedEvents.push(ev));

      const alarmModal = stack.open({
        kind: 'AlarmRulesModal',
        modalUid: 'alarm-rules',
        meta: { dirty: true },
        canClose: () =>
          new Promise<boolean>((resolve) => {
            if (!isFormDirty) {
              resolve(true);
              return;
            }
            stack.open({
              kind: 'ConfirmModal',
              modalUid: 'discard-confirm',
              meta: { title: 'Discard unsaved changes?' }
            });
            resolveGuardGate = resolve;
          })
      });

      const firstClosePromise = stack.closeTopAsync('escape');
      // Re-entrant close attempt while async guard is in-flight is rejected without spawning a 2nd ConfirmModal
      expect(stack.requestClose('alarm-rules', 'escape')).toBe(false);
      expect(stack.getSnapshot().activeCount).toBe(2);

      const confirmEntry = stack.getByUid('discard-confirm')!;
      expect(confirmEntry.zIndex).toBeGreaterThan(alarmModal.zIndex);
      expect(stack.getSnapshot().activeTop?.modalUid).toBe('discard-confirm');

      resolveGuardGate!(false);
      await expect(firstClosePromise).resolves.toBe(false);
      expect(preventedEvents).toHaveLength(1);
      expect(preventedEvents[0]?.entry?.modalUid).toBe('alarm-rules');

      // Pressing Escape closes ConfirmModal first (LIFO)
      expect(stack.closeTop('escape')).toBe(true);
      expect(stack.getSnapshot().activeTop?.modalUid).toBe('alarm-rules');

      // Once user marks form clean, pressing Escape closes AlarmRulesModal cleanly
      isFormDirty = false;
      await expect(stack.closeTopAsync('escape')).resolves.toBe(true);
      expect(stack.getSnapshot().totalCount).toBe(0);
    });

    it('treats throwing async canClose guards as vetoed (false) and emits close-prevented safely', async () => {
      const stack = createModalStack<GameModalKind>({ animatedClose: false });
      let preventedCount = 0;
      stack.on('close-prevented', () => {
        preventedCount++;
      });

      stack.open({
        kind: 'TestA',
        modalUid: 'throw-guard',
        canClose: () => Promise.reject(new Error('Network check failed'))
      });

      await expect(stack.requestCloseAsync('throw-guard', 'escape')).resolves.toBe(false);
      expect(preventedCount).toBe(1);
      expect(stack.hasUid('throw-guard')).toBe(true);
    });

    it('freezes exiting modal z-index while allocating strictly higher z-index to newly opened modals, resetting only on stack-empty', () => {
      const stack = createModalStack<GameModalKind>({ holdClosingUntilFinalized: true });
      const emptyEvents: number[] = [];
      stack.on('stack-empty', () => emptyEvents.push(1));

      const modalA = stack.open({ kind: 'TestA', modalUid: 'a' });
      const modalB = stack.open({ kind: 'TestB', modalUid: 'b' });
      expect(modalA.zIndex).toBe(11000);
      expect(modalB.zIndex).toBe(11010);

      // B enters closing animation; its z-index stays frozen at 11010
      stack.requestClose('b', 'escape');
      expect(stack.getByUid('b')?.zIndex).toBe(11010);

      // Opening C while B is closing allocates 11020 (zero z-fighting with exiting B!)
      const modalC = stack.open({ kind: 'TestC', modalUid: 'c' });
      expect(modalC.zIndex).toBe(11020);

      stack.finalizeClose('b');
      expect(stack.getByUid('c')?.zIndex).toBe(11020);
      expect(emptyEvents).toHaveLength(0);

      // Closing A and C drains the stack and resets nextSlot back to 0
      stack.forceClose('c');
      stack.forceClose('a');
      expect(emptyEvents).toHaveLength(1);

      const fresh = stack.open({ kind: 'TestA', modalUid: 'fresh' });
      expect(fresh.zIndex).toBe(11000);
    });

    it('accepts custom user zLayers scales, explicit base/step/ceiling overrides, and per-modal customZIndex / zIndexOffset', () => {
      const customBase = 3000;
      const customStep = 25;
      const customCeiling = 3040;
      const customPin = 4200;
      const customOffset = 5;
      const ceilingDiagnostics: ModalCeilingDiagnostic<GameModalKind>[] = [];

      const resolvedScale = resolveModalZLayers({
        MODAL: customBase,
        MODAL_STEP: customStep,
        TOOLTIP: customCeiling
      });
      expect(resolvedScale.MODAL).toBe(customBase);
      expect(resolvedScale.MODAL_STEP).toBe(customStep);
      expect(resolvedScale.TOOLTIP).toBe(customCeiling);
      expect(resolvedScale.TOAST).toBe(CANONICAL_Z_LAYERS.TOAST);
      expect(CANONICAL_Z_LAYERS.MODAL).toBe(11000);

      const stack = createModalStack<GameModalKind>({
        zLayers: { MODAL: customBase, MODAL_STEP: customStep, TOOLTIP: customCeiling },
        backdropOffset: 0,
        contentOffset: 2,
        onCeilingExceeded: (diag) => ceilingDiagnostics.push(diag)
      });

      expect(stack.getZLayers().MODAL).toBe(customBase);

      const m1 = stack.open({ kind: 'TestA', modalUid: 'm1' });
      const m2 = stack.open({ kind: 'TestB', modalUid: 'm2', zIndexOffset: customOffset });
      const m3 = stack.open({ kind: 'TestC', modalUid: 'm3' });
      const mPinned = stack.open({
        kind: 'ConfirmModal',
        modalUid: 'm-pinned',
        customZIndex: customPin,
        zIndexOffset: customOffset
      });

      expect(m1.zIndex).toBe(customBase);
      expect(m1.contentZIndex).toBe(customBase + 2);
      expect(m2.zIndex).toBe(customBase + customStep + customOffset);
      expect(m3.zIndex).toBe(customBase + customStep * 2);
      expect(mPinned.zIndex).toBe(customPin + customOffset);

      // m3 (3050) and mPinned (4205) both exceed ceiling 3040
      expect(ceilingDiagnostics.map((d) => d.modalUid)).toEqual(['m3', 'm-pinned']);

      // Bringing m1 to front elevates its z-index strictly above mPinned (4205 + 25 = 4230)
      const elevatedM1 = stack.bringToFront('m1')!;
      expect(elevatedM1.isActiveTop).toBe(true);
      expect(elevatedM1.zIndex).toBe(mPinned.zIndex + customStep);
      expect(elevatedM1.zIndex).toBeGreaterThan(mPinned.zIndex);

      // Subsequent normal open() also stays strictly monotonic above elevatedM1 (4230 + 25 = 4255)
      const m4 = stack.open({ kind: 'Notification', modalUid: 'm4' });
      expect(m4.zIndex).toBe(elevatedM1.zIndex + customStep);

      // High baseZIndex without explicit ceilingZIndex scales default ceiling headroom without spurious alerts
      const highBaseDiagnostics: ModalCeilingDiagnostic<GameModalKind>[] = [];
      const highBaseStack = createModalStack<GameModalKind>({
        baseZIndex: 20000,
        onCeilingExceeded: (diag) => highBaseDiagnostics.push(diag)
      });
      const highModal = highBaseStack.open({ kind: 'TestA', modalUid: 'high-1' });
      expect(highModal.zIndex).toBe(20000);
      expect(highBaseDiagnostics).toHaveLength(0);
    });

    it('enforces singleton policies, dismissMode rules, closeTimeoutMs watchdog, reduced motion, and fail-loud guards', async () => {
      vi.useFakeTimers();
      try {
        let reduced = false;
        const watchdogMs = 250;
        const stack = createModalStack<GameModalKind, ModalPayload>({
          closeTimeoutMs: watchdogMs,
          isReducedMotion: () => reduced
        });

        // Singleton: ignore-new
        const first = stack.open({ kind: 'Inventory', modalUid: 'inv-1', meta: { step: 1 } });
        const ignored = stack.open({
          kind: 'Inventory',
          singletonPolicy: 'ignore-new',
          meta: { step: 99 }
        });
        expect(ignored.modalUid).toBe(first.modalUid);
        expect(stack.getByUid('inv-1')?.meta?.step).toBe(1);

        // Singleton: focus-existing updates meta and brings to front
        stack.open({ kind: 'Shop', modalUid: 'shop-1' });
        const focused = stack.open({
          kind: 'Inventory',
          singletonPolicy: 'focus-existing',
          meta: { step: 2 }
        });
        expect(focused.modalUid).toBe('inv-1');
        expect(focused.isActiveTop).toBe(true);
        expect(focused.meta?.step).toBe(2);

        // Singleton: replace-existing closes previous with reason 'replace' and opens new
        const closeWait = stack.waitForClose('inv-1');
        const replaced = stack.open({
          kind: 'Inventory',
          modalUid: 'inv-2',
          singletonPolicy: 'replace-existing'
        });
        expect(replaced.modalUid).toBe('inv-2');
        expect((await closeWait).reason).toBe('replace');

        // dismissMode: 'none' vs 'closerequest'
        const locked = stack.open({ kind: 'Confirm', modalUid: 'locked', dismissMode: 'none' });
        expect(stack.requestClose(locked.modalUid, 'escape')).toBe(false);
        expect(stack.requestClose(locked.modalUid, 'backdrop')).toBe(false);
        expect(stack.requestClose(locked.modalUid, 'programmatic')).toBe(true);

        const escOnly = stack.open({
          kind: 'Settings',
          modalUid: 'esc-only',
          dismissMode: 'closerequest',
          onCloseAnimation: () => {
            // Intentionally never calls done() to verify closeTimeoutMs watchdog recovery
          }
        });
        expect(stack.requestClose(escOnly.modalUid, 'backdrop')).toBe(false);
        expect(stack.requestClose(escOnly.modalUid, 'escape')).toBe(true);
        expect(stack.hasUid('esc-only', { includeClosing: true })).toBe(true);

        vi.advanceTimersByTime(watchdogMs);
        expect(stack.hasUid('esc-only', { includeClosing: true })).toBe(false);

        // Reduced motion short-circuits both open and close animations immediately
        reduced = true;
        stack.setReducedMotionProvider(() => reduced);
        const instant = stack.open({
          kind: 'TestA',
          modalUid: 'instant-rm',
          openTimeoutMs: 500,
          holdClosingUntilFinalized: true
        });
        expect(instant.phase).toBe('open');
        expect(instant.motion.name).toBe('none');
        expect(stack.requestClose('instant-rm', 'escape')).toBe(true);
        expect(stack.hasUid('instant-rm', { includeClosing: true })).toBe(false);

        // Duplicate UID & unknown waitForClose fail loud
        stack.open({ kind: 'TestB', modalUid: 'dup-check' });
        expect(() => stack.open({ kind: 'TestB', modalUid: 'dup-check' })).toThrow(
          /Duplicate modalUid/
        );
        await expect(stack.waitForClose('missing-uid')).rejects.toThrow(/Cannot waitForClose/);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
