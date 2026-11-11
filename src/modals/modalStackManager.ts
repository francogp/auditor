/**
 * src/modals/modalStackManager.ts
 *
 * Framework-agnostic O(1) LIFO modal stack manager with customizable z-index
 * allocation, instant active-top / simplification transfer, background
 * occlusion tracking, dismissal guards, customizable motion presets, and
 * two-phase exit animation handshakes.
 */

import { createDomainSet } from '../core/domainCollections.ts';
import { addToSetMap } from './modalInternalUtils.ts';
import {
  resolveModalMotionPreset,
  type ModalMotionInput,
  type ModalMotionPreset
} from './modalMotionPresets.ts';
import type {
  ModalCeilingDiagnostic,
  ModalClearAllOptions,
  ModalCloseReason,
  ModalCloseResult,
  ModalDismissMode,
  ModalLifecycleEvent,
  ModalLifecycleEventType,
  ModalLifecycleListener,
  ModalLookupOptions,
  ModalOpenOptions,
  ModalPhase,
  ModalSingletonPolicy,
  ModalSnapshotListener,
  ModalStackConfig,
  ModalStackEntry,
  ModalStackSnapshot
} from './modalStackTypes.ts';
import { CANONICAL_Z_LAYERS, resolveModalZLayers, type ModalZLayerScale } from './modalZLayers.ts';

const DEFAULT_BACKDROP_OFFSET = 0;
const DEFAULT_CONTENT_OFFSET = 1;
const DEFAULT_Z_INDEX_OFFSET = 0;
const DEFAULT_OPEN_TIMEOUT_MS = 0;
const DEFAULT_CLOSE_TIMEOUT_MS = 800;
const INACTIVE_ORDER_SENTINEL = -1;

const USER_DISMISS_REASONS = createDomainSet([
  'escape',
  'backdrop',
  'close-button',
  'back-navigation'
] as const);

interface MutableModalRecord<TModalKind extends string, TMeta> {
  readonly modalUid: string;
  readonly kind: TModalKind;
  phase: ModalPhase;
  slot: number;
  readonly customZIndex: number | undefined;
  readonly zIndexOffset: number;
  zIndex: number;
  backdropZIndex: number;
  contentZIndex: number;
  readonly dismissMode: ModalDismissMode;
  readonly obscuresBackground: boolean;
  readonly motionInput: ModalMotionInput | undefined;
  readonly animatedClose: boolean;
  readonly holdClosingUntilFinalized: boolean;
  readonly openTimeoutMs: number;
  readonly closeTimeoutMs: number;
  meta: TMeta;
  readonly canClose: ModalOpenOptions<TModalKind, TMeta>['canClose'];
  readonly onCloseAnimation: ModalOpenOptions<TModalKind, TMeta>['onCloseAnimation'];
  closingReason: ModalCloseReason;
  openTimer: ReturnType<typeof globalThis.setTimeout> | null;
  closeTimer: ReturnType<typeof globalThis.setTimeout> | null;
}

function defaultUidFactory(): string {
  return globalThis.crypto.randomUUID();
}

function noopDeferDone(): void {
  // No-op when close is synchronous or event is not close-start
}

function isReasonAllowedByDismissMode(
  dismissMode: ModalDismissMode,
  reason: ModalCloseReason
): boolean {
  if (!USER_DISMISS_REASONS.has(reason)) {
    return true;
  }
  if (dismissMode === 'none') {
    return false;
  }
  if (dismissMode === 'closerequest' && reason === 'backdrop') {
    return false;
  }
  return true;
}

function isPromiseLikeBoolean(value: boolean | Promise<boolean>): value is Promise<boolean> {
  return typeof value === 'object' && value !== null && 'then' in value;
}

export class ModalStackManager<TModalKind extends string = string, TMeta = undefined> {
  private readonly zLayers: ModalZLayerScale;
  private readonly baseZIndex: number;
  private readonly stepZIndex: number;
  private readonly backdropOffset: number;
  private readonly contentOffset: number;
  private readonly ceilingZIndex: number | null;
  private readonly defaultDismissMode: ModalDismissMode;
  private readonly defaultSingletonPolicy: ModalSingletonPolicy;
  private readonly defaultObscuresBackground: boolean;
  private readonly defaultMotionPreset: ModalMotionPreset;
  private readonly simplifyNonTop: boolean;
  private readonly animatedClose: boolean;
  private readonly holdClosingUntilFinalized: boolean;
  private readonly instantOnReducedMotion: boolean;
  private readonly openTimeoutMs: number;
  private readonly closeTimeoutMs: number;
  private isReducedMotionFn: (() => boolean) | undefined;
  private readonly uidFactory: () => string;
  private readonly onCeilingExceeded:
    | ((diagnostic: ModalCeilingDiagnostic<TModalKind>) => void)
    | undefined;

  private nextSlot = 0;
  private readonly orderedUids: string[] = [];
  private readonly recordsByUid = new Map<string, MutableModalRecord<TModalKind, TMeta>>();
  private readonly uidsByKind = new Map<TModalKind, Set<string>>();
  private readonly pendingGuardUids = new Set<string>();
  private readonly closeWaitersByUid = new Map<
    string,
    Set<(result: ModalCloseResult<TModalKind, TMeta>) => void>
  >();
  private readonly snapshotListeners = new Set<ModalSnapshotListener<TModalKind, TMeta>>();
  private readonly lifecycleListeners = new Map<
    ModalLifecycleEventType,
    Set<ModalLifecycleListener<TModalKind, TMeta>>
  >();

  private cachedSnapshot: ModalStackSnapshot<TModalKind, TMeta>;
  private cachedEntriesByUid = new Map<string, ModalStackEntry<TModalKind, TMeta>>();

  public constructor(config: ModalStackConfig<TModalKind> = {}) {
    this.zLayers = resolveModalZLayers(config.zLayers);
    this.baseZIndex = config.baseZIndex ?? this.zLayers.MODAL;
    this.stepZIndex = config.stepZIndex ?? this.zLayers.MODAL_STEP;
    this.backdropOffset = config.backdropOffset ?? DEFAULT_BACKDROP_OFFSET;
    this.contentOffset = config.contentOffset ?? DEFAULT_CONTENT_OFFSET;
    const defaultCeilingHeadroom = CANONICAL_Z_LAYERS.TOOLTIP - CANONICAL_Z_LAYERS.MODAL;
    this.ceilingZIndex =
      config.ceilingZIndex !== undefined
        ? config.ceilingZIndex
        : config.zLayers?.TOOLTIP !== undefined || this.baseZIndex < this.zLayers.TOOLTIP
          ? this.zLayers.TOOLTIP
          : this.baseZIndex + defaultCeilingHeadroom;
    this.defaultDismissMode = config.defaultDismissMode ?? 'any';
    this.defaultSingletonPolicy = config.defaultSingletonPolicy ?? 'allow-multiple';
    this.defaultObscuresBackground = config.defaultObscuresBackground ?? true;
    this.defaultMotionPreset = resolveModalMotionPreset(config.defaultMotion);
    this.simplifyNonTop = config.simplifyNonTop ?? true;
    this.animatedClose = config.animatedClose ?? true;
    this.holdClosingUntilFinalized = config.holdClosingUntilFinalized ?? false;
    this.instantOnReducedMotion = config.instantOnReducedMotion ?? true;
    this.openTimeoutMs = config.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS;
    this.closeTimeoutMs = config.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS;
    this.isReducedMotionFn = config.isReducedMotion;
    this.uidFactory = config.uidFactory ?? defaultUidFactory;
    this.onCeilingExceeded = config.onCeilingExceeded;
    this.cachedSnapshot = this.computeSnapshot();
  }

  public getZLayers(): ModalZLayerScale {
    return this.zLayers;
  }

  public getDefaultMotionPreset(): ModalMotionPreset {
    return this.defaultMotionPreset;
  }

  public setReducedMotionProvider(provider: (() => boolean) | undefined): void {
    this.isReducedMotionFn = provider;
    if (this.orderedUids.length > 0) {
      this.commitSnapshot();
    }
  }

  public getSnapshot(): ModalStackSnapshot<TModalKind, TMeta> {
    return this.cachedSnapshot;
  }

  public getByUid(modalUid: string): ModalStackEntry<TModalKind, TMeta> | undefined {
    return this.cachedEntriesByUid.get(modalUid);
  }

  public hasUid(modalUid: string, options: ModalLookupOptions = {}): boolean {
    const rec = this.recordsByUid.get(modalUid);
    if (!rec) return false;
    return options.includeClosing ? true : rec.phase !== 'closing';
  }

  public hasKind(kind: TModalKind, options: ModalLookupOptions = {}): boolean {
    const set = this.uidsByKind.get(kind);
    if (!set || set.size === 0) return false;
    if (options.includeClosing) return true;
    for (const uid of set) {
      const rec = this.recordsByUid.get(uid);
      if (rec && rec.phase !== 'closing') {
        return true;
      }
    }
    return false;
  }

  public isActiveTop(modalUid: string): boolean {
    return this.cachedSnapshot.activeTop?.modalUid === modalUid;
  }

  public subscribe(listener: ModalSnapshotListener<TModalKind, TMeta>): () => void {
    this.snapshotListeners.add(listener);
    return () => {
      this.snapshotListeners.delete(listener);
    };
  }

  public on(
    eventType: ModalLifecycleEventType,
    listener: ModalLifecycleListener<TModalKind, TMeta>
  ): () => void {
    const bucket = addToSetMap(this.lifecycleListeners, eventType, listener);
    return () => {
      bucket.delete(listener);
    };
  }

  public open(options: ModalOpenOptions<TModalKind, TMeta>): ModalStackEntry<TModalKind, TMeta> {
    const singletonResult = this.resolveSingletonOnOpen(options);
    if (singletonResult) {
      return singletonResult;
    }

    const modalUid = options.modalUid !== undefined ? options.modalUid : this.uidFactory();
    if (this.recordsByUid.has(modalUid)) {
      throw new Error(`Duplicate modalUid "${modalUid}" is already present in ModalStackManager`);
    }

    const record = this.createModalRecord(modalUid, options);
    this.registerRecord(record);
    this.commitSnapshot();

    const entry = this.cachedEntriesByUid.get(modalUid)!;
    this.emitLifecycleEvent('open-start', entry);

    if (
      this.shouldShortCircuitMotion() ||
      (record.openTimeoutMs === 0 && entry.motion.enter.durationSec === 0)
    ) {
      this.completeOpen(modalUid);
      return this.cachedEntriesByUid.get(modalUid) ?? entry;
    }

    if (record.openTimeoutMs > 0) {
      record.openTimer = globalThis.setTimeout(() => {
        record.openTimer = null;
        this.completeOpen(modalUid);
      }, record.openTimeoutMs);
    }

    return this.cachedEntriesByUid.get(modalUid) ?? entry;
  }

  public completeOpen(modalUid: string): boolean {
    const record = this.recordsByUid.get(modalUid);
    if (!record || record.phase !== 'opening') {
      return false;
    }
    this.clearOpenTimer(record);
    record.phase = 'open';
    this.commitSnapshot();
    this.emitLifecycleEvent('open-end', this.cachedEntriesByUid.get(modalUid) ?? null);
    return true;
  }

  public bringToFront(modalUid: string): ModalStackEntry<TModalKind, TMeta> | undefined {
    const record = this.recordsByUid.get(modalUid);
    if (!record || record.phase === 'closing') {
      return undefined;
    }
    if (this.isActiveTop(modalUid)) {
      return this.cachedEntriesByUid.get(modalUid);
    }

    const index = this.orderedUids.indexOf(modalUid);
    if (index !== INACTIVE_ORDER_SENTINEL) {
      this.orderedUids.splice(index, 1);
      this.orderedUids.push(modalUid);
    }
    this.assignNextSlot(record);
    this.commitSnapshot();
    const updated = this.cachedEntriesByUid.get(modalUid);
    this.emitLifecycleEvent('reordered', updated ?? null);
    return updated;
  }

  public requestClose(modalUid: string, reason: ModalCloseReason = 'programmatic'): boolean {
    const outcome = this.evaluateCloseAttempt(modalUid, reason);
    if (typeof outcome === 'boolean') {
      return outcome;
    }
    void outcome.then(
      () => undefined,
      () => undefined
    );
    return false;
  }

  public requestCloseAsync(
    modalUid: string,
    reason: ModalCloseReason = 'programmatic'
  ): Promise<boolean> {
    const outcome = this.evaluateCloseAttempt(modalUid, reason);
    return typeof outcome === 'boolean' ? Promise.resolve(outcome) : outcome;
  }

  public closeTop(reason: ModalCloseReason = 'escape'): boolean {
    const top = this.cachedSnapshot.activeTop;
    if (!top) return false;
    return this.requestClose(top.modalUid, reason);
  }

  public closeTopAsync(reason: ModalCloseReason = 'escape'): Promise<boolean> {
    const top = this.cachedSnapshot.activeTop;
    if (!top) return Promise.resolve(false);
    return this.requestCloseAsync(top.modalUid, reason);
  }

  public closeByKind(kind: TModalKind, reason: ModalCloseReason = 'programmatic'): number {
    const uids = this.collectActiveUidsByKind(kind);
    let closedCount = 0;
    for (let i = uids.length - 1; i >= 0; i--) {
      if (this.requestClose(uids[i]!, reason)) {
        closedCount++;
      }
    }
    return closedCount;
  }

  public finalizeClose(modalUid: string): boolean {
    const record = this.recordsByUid.get(modalUid);
    if (!record) return false;

    const closingEntry = this.cachedEntriesByUid.get(modalUid) ?? null;
    const closeReason = record.closingReason;
    const closeResult: ModalCloseResult<TModalKind, TMeta> = {
      modalUid: record.modalUid,
      kind: record.kind,
      reason: closeReason,
      meta: record.meta
    };

    this.unregisterRecord(record);
    if (this.recordsByUid.size === 0) {
      this.nextSlot = 0;
    }

    this.commitSnapshot();
    this.emitLifecycleEvent('close-end', closingEntry, closeReason);
    this.resolveCloseWaiters(modalUid, closeResult);

    if (this.recordsByUid.size === 0) {
      this.emitLifecycleEvent('stack-empty', null);
    }
    return true;
  }

  public forceClose(modalUid: string, reason: ModalCloseReason = 'programmatic'): boolean {
    const record = this.recordsByUid.get(modalUid);
    if (!record) return false;
    record.closingReason = reason;
    return this.finalizeClose(modalUid);
  }

  public clearAll(options: ModalClearAllOptions = {}): void {
    const immediate = options.immediate ?? true;
    const reason = options.reason ?? 'clear-all';
    const snapshotUids = Array.from(this.orderedUids).reverse();

    for (const uid of snapshotUids) {
      const record = this.recordsByUid.get(uid);
      if (!record) continue;
      if (immediate) {
        this.forceClose(uid, reason);
      } else if (record.phase !== 'closing') {
        this.beginClosingPhase(record, reason);
      }
    }
  }

  public waitForClose(modalUid: string): Promise<ModalCloseResult<TModalKind, TMeta>> {
    const record = this.recordsByUid.get(modalUid);
    if (!record) {
      return Promise.reject(
        new Error(`Cannot waitForClose on unknown modalUid "${modalUid}" in ModalStackManager`)
      );
    }
    return new Promise<ModalCloseResult<TModalKind, TMeta>>((resolve) => {
      addToSetMap(this.closeWaitersByUid, modalUid, resolve);
    });
  }

  public dispose(): void {
    this.clearAll({ immediate: true, reason: 'clear-all' });
    this.snapshotListeners.clear();
    this.lifecycleListeners.clear();
    this.pendingGuardUids.clear();
  }

  private resolveSingletonOnOpen(
    options: ModalOpenOptions<TModalKind, TMeta>
  ): ModalStackEntry<TModalKind, TMeta> | null {
    const policy = options.singletonPolicy ?? this.defaultSingletonPolicy;
    if (policy === 'allow-multiple') {
      return null;
    }

    const existingActiveUids = this.collectActiveUidsByKind(options.kind);
    if (existingActiveUids.length === 0) {
      return null;
    }

    const latestUid = existingActiveUids[existingActiveUids.length - 1]!;
    if (policy === 'ignore-new') {
      return this.cachedEntriesByUid.get(latestUid) ?? null;
    }

    if (policy === 'focus-existing') {
      const record = this.recordsByUid.get(latestUid)!;
      if (options.meta !== undefined) {
        record.meta = options.meta;
      }
      if (this.isActiveTop(latestUid)) {
        this.commitSnapshot();
        return this.cachedEntriesByUid.get(latestUid) ?? null;
      }
      return this.bringToFront(latestUid) ?? null;
    }

    for (let i = existingActiveUids.length - 1; i >= 0; i--) {
      const existingRecord = this.recordsByUid.get(existingActiveUids[i]!);
      if (existingRecord && existingRecord.phase !== 'closing') {
        this.beginClosingPhase(existingRecord, 'replace');
      }
    }
    return null;
  }

  private createModalRecord(
    modalUid: string,
    options: ModalOpenOptions<TModalKind, TMeta>
  ): MutableModalRecord<TModalKind, TMeta> {
    const slot = this.nextSlot++;
    const zIndexOffset = options.zIndexOffset ?? DEFAULT_Z_INDEX_OFFSET;
    const autoBaseZ = this.computeNextMonotonicBaseZ(slot);
    const baseCalculatedZ = options.customZIndex ?? autoBaseZ;
    const zIndex = baseCalculatedZ + zIndexOffset;
    this.notifyCeilingIfNeeded(modalUid, options.kind, slot, zIndex);

    return {
      modalUid,
      kind: options.kind,
      phase: 'opening',
      slot,
      customZIndex: options.customZIndex,
      zIndexOffset,
      zIndex,
      backdropZIndex: zIndex + this.backdropOffset,
      contentZIndex: zIndex + this.contentOffset,
      dismissMode: options.dismissMode ?? this.defaultDismissMode,
      obscuresBackground: options.obscuresBackground ?? this.defaultObscuresBackground,
      motionInput: options.motion,
      animatedClose: options.animatedClose ?? this.animatedClose,
      holdClosingUntilFinalized:
        options.holdClosingUntilFinalized ?? this.holdClosingUntilFinalized,
      openTimeoutMs: options.openTimeoutMs ?? this.openTimeoutMs,
      closeTimeoutMs: options.closeTimeoutMs ?? this.closeTimeoutMs,
      meta: options.meta as TMeta,
      canClose: options.canClose,
      onCloseAnimation: options.onCloseAnimation,
      closingReason: 'programmatic',
      openTimer: null,
      closeTimer: null
    };
  }

  private assignNextSlot(record: MutableModalRecord<TModalKind, TMeta>): void {
    const slot = this.nextSlot++;
    const monotonicZ = this.computeNextMonotonicBaseZ(slot, record.modalUid);
    const elevatedBase =
      record.customZIndex !== undefined ? Math.max(record.customZIndex, monotonicZ) : monotonicZ;
    const zIndex = elevatedBase + record.zIndexOffset;
    record.slot = slot;
    record.zIndex = zIndex;
    record.backdropZIndex = zIndex + this.backdropOffset;
    record.contentZIndex = zIndex + this.contentOffset;
    this.notifyCeilingIfNeeded(record.modalUid, record.kind, slot, zIndex);
  }

  private computeNextMonotonicBaseZ(slot: number, excludeUid?: string): number {
    const slotZ = this.baseZIndex + slot * this.stepZIndex;
    let maxBaseZ = Number.NEGATIVE_INFINITY;
    let maxSurfaceZ = Number.NEGATIVE_INFINITY;
    for (const [uid, rec] of this.recordsByUid) {
      if (uid === excludeUid) continue;
      if (rec.zIndex > maxBaseZ) {
        maxBaseZ = rec.zIndex;
      }
      const surfaceTop = Math.max(rec.zIndex, rec.backdropZIndex, rec.contentZIndex);
      if (surfaceTop > maxSurfaceZ) {
        maxSurfaceZ = surfaceTop;
      }
    }
    if (!Number.isFinite(maxSurfaceZ) || slotZ > maxSurfaceZ) {
      return slotZ;
    }
    return Math.max(maxBaseZ + this.stepZIndex, maxSurfaceZ + 1);
  }

  private notifyCeilingIfNeeded(
    modalUid: string,
    kind: TModalKind,
    slot: number,
    zIndex: number
  ): void {
    if (this.ceilingZIndex !== null && zIndex >= this.ceilingZIndex && this.onCeilingExceeded) {
      this.onCeilingExceeded({
        modalUid,
        kind,
        slot,
        zIndex,
        ceilingZIndex: this.ceilingZIndex
      });
    }
  }

  private evaluateCloseAttempt(
    modalUid: string,
    reason: ModalCloseReason
  ): boolean | Promise<boolean> {
    const record = this.recordsByUid.get(modalUid);
    if (!record || record.phase === 'closing' || this.pendingGuardUids.has(modalUid)) {
      return false;
    }

    if (!isReasonAllowedByDismissMode(record.dismissMode, reason)) {
      this.emitLifecycleEvent(
        'close-prevented',
        this.cachedEntriesByUid.get(modalUid) ?? null,
        reason
      );
      return false;
    }

    if (!record.canClose) {
      this.beginClosingPhase(record, reason);
      return true;
    }

    const entrySnapshot = this.cachedEntriesByUid.get(modalUid)!;
    const guardResult = record.canClose({ entry: entrySnapshot, reason });
    if (!isPromiseLikeBoolean(guardResult)) {
      return this.applyGuardVerdict(modalUid, reason, guardResult);
    }

    this.pendingGuardUids.add(modalUid);
    return guardResult
      .then((allowed) => this.applyGuardVerdict(modalUid, reason, allowed))
      .catch(() => this.applyGuardVerdict(modalUid, reason, false))
      .finally(() => {
        this.pendingGuardUids.delete(modalUid);
      });
  }

  private applyGuardVerdict(modalUid: string, reason: ModalCloseReason, allowed: boolean): boolean {
    const record = this.recordsByUid.get(modalUid);
    if (!record || record.phase === 'closing') {
      return false;
    }
    if (!allowed) {
      this.emitLifecycleEvent(
        'close-prevented',
        this.cachedEntriesByUid.get(modalUid) ?? null,
        reason
      );
      return false;
    }
    this.beginClosingPhase(record, reason);
    return true;
  }

  private beginClosingPhase(
    record: MutableModalRecord<TModalKind, TMeta>,
    reason: ModalCloseReason
  ): void {
    this.clearOpenTimer(record);
    record.phase = 'closing';
    record.closingReason = reason;
    this.commitSnapshot();

    const closingEntry = this.cachedEntriesByUid.get(record.modalUid)!;
    const allowAsyncExit = record.animatedClose && !this.shouldShortCircuitMotion();

    let deferred = allowAsyncExit && record.holdClosingUntilFinalized;
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      this.finalizeClose(record.modalUid);
    };

    const claimDefer = (): (() => void) => {
      if (!allowAsyncExit) {
        return noopDeferDone;
      }
      deferred = true;
      return done;
    };

    if (allowAsyncExit && record.onCloseAnimation) {
      deferred = true;
      record.onCloseAnimation(closingEntry, done);
    }

    this.emitLifecycleEvent('close-start', closingEntry, reason, claimDefer);

    if (!deferred || settled || !this.recordsByUid.has(record.modalUid)) {
      if (!settled && this.recordsByUid.has(record.modalUid)) {
        this.finalizeClose(record.modalUid);
      }
      return;
    }

    if (record.closeTimeoutMs > 0) {
      record.closeTimer = globalThis.setTimeout(() => {
        record.closeTimer = null;
        done();
      }, record.closeTimeoutMs);
    }
  }

  private shouldShortCircuitMotion(): boolean {
    return Boolean(this.instantOnReducedMotion && this.isReducedMotionFn?.());
  }

  private registerRecord(record: MutableModalRecord<TModalKind, TMeta>): void {
    this.orderedUids.push(record.modalUid);
    this.recordsByUid.set(record.modalUid, record);
    addToSetMap(this.uidsByKind, record.kind, record.modalUid);
  }

  private unregisterRecord(record: MutableModalRecord<TModalKind, TMeta>): void {
    this.clearOpenTimer(record);
    this.clearCloseTimer(record);
    this.recordsByUid.delete(record.modalUid);
    this.pendingGuardUids.delete(record.modalUid);

    const index = this.orderedUids.indexOf(record.modalUid);
    if (index !== INACTIVE_ORDER_SENTINEL) {
      this.orderedUids.splice(index, 1);
    }

    const kindBucket = this.uidsByKind.get(record.kind);
    if (kindBucket) {
      kindBucket.delete(record.modalUid);
      if (kindBucket.size === 0) {
        this.uidsByKind.delete(record.kind);
      }
    }
  }

  private collectActiveUidsByKind(kind: TModalKind): string[] {
    const bucket = this.uidsByKind.get(kind);
    if (!bucket || bucket.size === 0) return [];
    const active: string[] = [];
    for (const uid of this.orderedUids) {
      if (!bucket.has(uid)) continue;
      const rec = this.recordsByUid.get(uid);
      if (rec && rec.phase !== 'closing') {
        active.push(uid);
      }
    }
    return active;
  }

  private clearOpenTimer(record: MutableModalRecord<TModalKind, TMeta>): void {
    if (record.openTimer !== null) {
      globalThis.clearTimeout(record.openTimer);
      record.openTimer = null;
    }
  }

  private clearCloseTimer(record: MutableModalRecord<TModalKind, TMeta>): void {
    if (record.closeTimer !== null) {
      globalThis.clearTimeout(record.closeTimer);
      record.closeTimer = null;
    }
  }

  private resolveCloseWaiters(modalUid: string, result: ModalCloseResult<TModalKind, TMeta>): void {
    const waiters = this.closeWaitersByUid.get(modalUid);
    if (!waiters) return;
    this.closeWaitersByUid.delete(modalUid);
    for (const resolve of waiters) {
      resolve(result);
    }
  }

  private commitSnapshot(): void {
    this.cachedSnapshot = this.computeSnapshot();
    for (const listener of this.snapshotListeners) {
      listener(this.cachedSnapshot);
    }
  }

  private computeSnapshot(): ModalStackSnapshot<TModalKind, TMeta> {
    let activeTopUid: string | null = null;
    let highestZIndex = this.baseZIndex;
    const reducedMotion = this.shouldShortCircuitMotion();

    for (const uid of this.orderedUids) {
      const rec = this.recordsByUid.get(uid)!;
      if (rec.zIndex > highestZIndex) {
        highestZIndex = rec.zIndex;
      }
      if (rec.phase !== 'closing') {
        activeTopUid = uid;
      }
    }

    const entries: ModalStackEntry<TModalKind, TMeta>[] = [];
    const activeEntries: ModalStackEntry<TModalKind, TMeta>[] = [];
    const nextEntryMap = new Map<string, ModalStackEntry<TModalKind, TMeta>>();
    let obscuresBackground = false;

    for (const uid of this.orderedUids) {
      const rec = this.recordsByUid.get(uid)!;
      const isClosing = rec.phase === 'closing';
      const isActiveTop = !isClosing && uid === activeTopUid;
      const isSimplified = this.simplifyNonTop && !isClosing && !isActiveTop;
      const activeOrder = isClosing ? INACTIVE_ORDER_SENTINEL : activeEntries.length;
      const motion = resolveModalMotionPreset(rec.motionInput, {
        defaultPreset: this.defaultMotionPreset,
        reducedMotion
      });

      const entry: ModalStackEntry<TModalKind, TMeta> = Object.freeze({
        modalUid: rec.modalUid,
        kind: rec.kind,
        phase: rec.phase,
        slot: rec.slot,
        zIndex: rec.zIndex,
        backdropZIndex: rec.backdropZIndex,
        contentZIndex: rec.contentZIndex,
        dismissMode: rec.dismissMode,
        obscuresBackground: rec.obscuresBackground,
        isActiveTop,
        isSimplified,
        activeOrder,
        motion,
        meta: rec.meta
      });

      entries.push(entry);
      nextEntryMap.set(uid, entry);
      if (!isClosing) {
        activeEntries.push(entry);
        if (rec.obscuresBackground) {
          obscuresBackground = true;
        }
      }
    }

    this.cachedEntriesByUid = nextEntryMap;
    const activeTop = activeTopUid ? (nextEntryMap.get(activeTopUid) ?? null) : null;

    return Object.freeze({
      entries: Object.freeze(entries),
      activeEntries: Object.freeze(activeEntries),
      activeTop,
      totalCount: entries.length,
      activeCount: activeEntries.length,
      hasOpenModals: activeEntries.length > 0,
      obscuresBackground,
      highestZIndex
    });
  }

  private emitLifecycleEvent(
    type: ModalLifecycleEventType,
    entry: ModalStackEntry<TModalKind, TMeta> | null,
    reason?: ModalCloseReason,
    deferCloseFactory?: () => () => void
  ): void {
    const listeners = this.lifecycleListeners.get(type);
    if (!listeners || listeners.size === 0) return;

    const event: ModalLifecycleEvent<TModalKind, TMeta> = {
      type,
      entry,
      reason,
      snapshot: this.cachedSnapshot,
      deferClose: deferCloseFactory ?? (() => noopDeferDone)
    };

    for (const listener of listeners) {
      listener(event);
    }
  }
}

export function createModalStack<TModalKind extends string = string, TMeta = undefined>(
  config: ModalStackConfig<TModalKind> = {}
): ModalStackManager<TModalKind, TMeta> {
  return new ModalStackManager<TModalKind, TMeta>(config);
}
