/**
 * src/modals/modalStackTypes.ts
 *
 * Canonical domain types for framework-agnostic LIFO modal stack governance,
 * customizable z-index allocation, dismissal policies, and animation handshakes.
 */

import type { ModalMotionInput, ModalMotionPreset } from './modalMotionPresets.ts';
import type { CustomModalZLayers, ModalZLayerScale } from './modalZLayers.ts';

export const MODAL_PHASES = ['opening', 'open', 'closing'] as const;
export type ModalPhase = (typeof MODAL_PHASES)[number];

export const MODAL_DISMISS_MODES = ['any', 'closerequest', 'none'] as const;
export type ModalDismissMode = (typeof MODAL_DISMISS_MODES)[number];

export const MODAL_CLOSE_REASONS = [
  'escape',
  'backdrop',
  'close-button',
  'programmatic',
  'back-navigation',
  'replace',
  'clear-all'
] as const;
export type ModalCloseReason = (typeof MODAL_CLOSE_REASONS)[number];

export const MODAL_SINGLETON_POLICIES = [
  'allow-multiple',
  'focus-existing',
  'replace-existing',
  'ignore-new'
] as const;
export type ModalSingletonPolicy = (typeof MODAL_SINGLETON_POLICIES)[number];

export const MODAL_LIFECYCLE_EVENTS = [
  'open-start',
  'open-end',
  'updated',
  'close-start',
  'close-end',
  'close-prevented',
  'reordered',
  'stack-empty'
] as const;
export type ModalLifecycleEventType = (typeof MODAL_LIFECYCLE_EVENTS)[number];

export type ModalGuardResult = boolean | Promise<boolean>;

export interface ModalStackEntry<TModalKind extends string = string, TMeta = undefined> {
  readonly modalUid: string;
  readonly kind: TModalKind;
  readonly phase: ModalPhase;
  readonly slot: number;
  readonly zIndex: number;
  readonly backdropZIndex: number;
  readonly contentZIndex: number;
  readonly dismissMode: ModalDismissMode;
  readonly obscuresBackground: boolean;
  readonly isActiveTop: boolean;
  readonly isSimplified: boolean;
  readonly activeOrder: number;
  readonly motion: ModalMotionPreset;
  readonly meta: TMeta;
}

export interface ModalStackSnapshot<TModalKind extends string = string, TMeta = undefined> {
  readonly entries: readonly ModalStackEntry<TModalKind, TMeta>[];
  readonly activeEntries: readonly ModalStackEntry<TModalKind, TMeta>[];
  readonly activeTop: ModalStackEntry<TModalKind, TMeta> | null;
  readonly totalCount: number;
  readonly activeCount: number;
  readonly hasOpenModals: boolean;
  readonly obscuresBackground: boolean;
  readonly highestZIndex: number;
}

export interface ModalCloseAttemptContext<TModalKind extends string = string, TMeta = undefined> {
  readonly entry: ModalStackEntry<TModalKind, TMeta>;
  readonly reason: ModalCloseReason;
}

export interface ModalCloseResult<TModalKind extends string = string, TMeta = undefined> {
  readonly modalUid: string;
  readonly kind: TModalKind;
  readonly reason: ModalCloseReason;
  readonly meta: TMeta;
}

export interface ModalCeilingDiagnostic<TModalKind extends string = string> {
  readonly modalUid: string;
  readonly kind: TModalKind;
  readonly slot: number;
  readonly zIndex: number;
  readonly ceilingZIndex: number;
}

export interface ModalLifecycleEvent<TModalKind extends string = string, TMeta = undefined> {
  readonly type: ModalLifecycleEventType;
  readonly entry: ModalStackEntry<TModalKind, TMeta> | null;
  readonly reason?: ModalCloseReason;
  readonly snapshot: ModalStackSnapshot<TModalKind, TMeta>;
  deferClose(): () => void;
}

export interface ModalOpenOptions<TModalKind extends string = string, TMeta = undefined> {
  readonly kind: TModalKind;
  readonly modalUid?: string;
  readonly meta?: TMeta;
  readonly customZIndex?: number;
  readonly zIndexOffset?: number;
  readonly dismissMode?: ModalDismissMode;
  readonly singletonPolicy?: ModalSingletonPolicy;
  readonly obscuresBackground?: boolean;
  readonly motion?: ModalMotionInput;
  readonly animatedClose?: boolean;
  readonly holdClosingUntilFinalized?: boolean;
  readonly openTimeoutMs?: number;
  readonly closeTimeoutMs?: number;
  readonly canClose?: (context: ModalCloseAttemptContext<TModalKind, TMeta>) => ModalGuardResult;
  readonly onCloseAnimation?: (entry: ModalStackEntry<TModalKind, TMeta>, done: () => void) => void;
}

export interface ModalOpenResult<TModalKind extends string = string, TMeta = undefined> {
  readonly entry: ModalStackEntry<TModalKind, TMeta>;
  readonly created: boolean;
}

export interface ModalEntryPatch<TModalKind extends string = string, TMeta = undefined> {
  readonly meta?: TMeta;
  readonly customZIndex?: number;
  readonly zIndexOffset?: number;
  readonly dismissMode?: ModalDismissMode;
  readonly obscuresBackground?: boolean;
  readonly motion?: ModalMotionInput;
  readonly canClose?: (context: ModalCloseAttemptContext<TModalKind, TMeta>) => ModalGuardResult;
}

export interface ModalTimerDriver {
  schedule(delayMs: number, callback: () => void): () => void;
}

export interface ModalStackConfig<TModalKind extends string = string> {
  readonly zLayers?: CustomModalZLayers;
  readonly baseZIndex?: number;
  readonly stepZIndex?: number;
  readonly backdropOffset?: number;
  readonly contentOffset?: number;
  readonly ceilingZIndex?: number | null;
  readonly defaultDismissMode?: ModalDismissMode;
  readonly defaultSingletonPolicy?: ModalSingletonPolicy;
  readonly defaultObscuresBackground?: boolean;
  readonly defaultMotion?: ModalMotionInput;
  readonly simplifyNonTop?: boolean;
  readonly animatedClose?: boolean;
  readonly holdClosingUntilFinalized?: boolean;
  readonly instantOnReducedMotion?: boolean;
  readonly openTimeoutMs?: number;
  readonly closeTimeoutMs?: number;
  readonly isReducedMotion?: () => boolean;
  readonly uidFactory?: () => string;
  readonly timerDriver?: ModalTimerDriver;
  readonly onCeilingExceeded?: (diagnostic: ModalCeilingDiagnostic<TModalKind>) => void;
}

export interface ModalLookupOptions {
  readonly includeClosing?: boolean;
}

export interface ModalClearAllOptions {
  readonly immediate?: boolean;
  readonly reason?: ModalCloseReason;
}

export type ModalSnapshotListener<TModalKind extends string = string, TMeta = undefined> = (
  snapshot: ModalStackSnapshot<TModalKind, TMeta>
) => void;

export type ModalLifecycleListener<TModalKind extends string = string, TMeta = undefined> = (
  event: ModalLifecycleEvent<TModalKind, TMeta>
) => void;

export interface ModalStackController<TModalKind extends string = string, TMeta = undefined> {
  readonly __v_skip?: boolean;
  getZLayers(): ModalZLayerScale;
  getDefaultMotionPreset(): ModalMotionPreset;
  setReducedMotionProvider(provider: (() => boolean) | undefined): void;
  getSnapshot(): ModalStackSnapshot<TModalKind, TMeta>;
  getByUid(modalUid: string): ModalStackEntry<TModalKind, TMeta> | undefined;
  hasUid(modalUid: string, options?: ModalLookupOptions): boolean;
  hasKind(kind: TModalKind, options?: ModalLookupOptions): boolean;
  getLatestByKind(
    kind: TModalKind,
    options?: ModalLookupOptions
  ): ModalStackEntry<TModalKind, TMeta> | undefined;
  isActiveTop(modalUid: string): boolean;
  subscribe(listener: ModalSnapshotListener<TModalKind, TMeta>): () => void;
  on(
    eventType: ModalLifecycleEventType,
    listener: ModalLifecycleListener<TModalKind, TMeta>
  ): () => void;
  tryOpen(options: ModalOpenOptions<TModalKind, TMeta>): ModalOpenResult<TModalKind, TMeta>;
  open(options: ModalOpenOptions<TModalKind, TMeta>): ModalStackEntry<TModalKind, TMeta>;
  updateEntry(
    modalUid: string,
    patch: ModalEntryPatch<TModalKind, TMeta>
  ): ModalStackEntry<TModalKind, TMeta> | undefined;
  completeOpen(modalUid: string): boolean;
  bringToFront(modalUid: string): ModalStackEntry<TModalKind, TMeta> | undefined;
  requestClose(modalUid: string, reason?: ModalCloseReason): boolean;
  requestCloseAsync(modalUid: string, reason?: ModalCloseReason): Promise<boolean>;
  closeTop(reason?: ModalCloseReason): boolean;
  closeTopAsync(reason?: ModalCloseReason): Promise<boolean>;
  closeByKind(kind: TModalKind, reason?: ModalCloseReason): number;
  closeLatestByKind(kind: TModalKind, reason?: ModalCloseReason): boolean;
  finalizeClose(modalUid: string): boolean;
  forceClose(modalUid: string, reason?: ModalCloseReason): boolean;
  clearAll(options?: ModalClearAllOptions): void;
  waitForClose(modalUid: string): Promise<ModalCloseResult<TModalKind, TMeta>>;
  dispose(): void;
}
