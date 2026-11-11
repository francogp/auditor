import { ModalStackController } from "./modalStackTypes.js";
export interface ModalEventListenerOptions {
  readonly capture?: boolean;
}
export interface ModalPointerLikeEvent {
  readonly button: number;
  readonly target: unknown;
  readonly currentTarget: unknown;
}
export interface BackdropPointerGuardOptions<TModalKind extends string = string, TMeta = undefined> {
  readonly stack: ModalStackController<TModalKind, TMeta>;
  readonly getModalUid: () => string;
  readonly isBackdropTarget?: (event: ModalPointerLikeEvent) => boolean;
}
export interface BackdropPointerGuard {
  onPointerDown(event: ModalPointerLikeEvent): void;
  onPointerUp(event: ModalPointerLikeEvent): boolean;
  onPointerCancel(): void;
  reset(): void;
}
export interface ModalBackNavigationConfig {
  readonly enabled: boolean;
  readonly guardStateKey?: string;
  readonly blockMouseSideButtons?: boolean;
  readonly blockBrowserShortcuts?: boolean;
  readonly blockBackspaceOutsideInputs?: boolean;
  readonly onBeforePopStateDismiss?: () => boolean;
  readonly onUnhandledPopState?: () => boolean | void;
}
export interface ModalDomTargetLike {
  addEventListener(type: string, listener: (event: Event) => void, options?: boolean | ModalEventListenerOptions): void;
  removeEventListener(type: string, listener: (event: Event) => void, options?: boolean | ModalEventListenerOptions): void;
  readonly history?: {
    readonly state?: unknown;
    pushState(data: unknown, unused: string, url?: string): void;
  };
  readonly location?: {
    readonly href: string;
  };
  matchMedia?: (query: string) => {
    readonly matches: boolean;
  };
}
export interface ModalDomControllerConfig<TModalKind extends string = string, TMeta = undefined> {
  readonly stack: ModalStackController<TModalKind, TMeta>;
  readonly target?: ModalDomTargetLike;
  readonly preventDefaultOnEscape?: boolean;
  readonly syncReducedMotion?: boolean;
  readonly backNavigation?: ModalBackNavigationConfig;
}
export declare function isEditableEventTarget(target: unknown): boolean;
/**
 * Requires both pointerdown and pointerup with the primary button on the backdrop
 * while the modal is activeTop, preventing text-selection drag releases from closing modals.
 */
export declare function createBackdropPointerGuard<TModalKind extends string = string, TMeta = undefined>(options: BackdropPointerGuardOptions<TModalKind, TMeta>): BackdropPointerGuard;
export declare class ModalDomController<TModalKind extends string = string, TMeta = undefined> {
  readonly __v_skip?: boolean;
  private readonly stack;
  private readonly target;
  private readonly preventDefaultOnEscape;
  private readonly backNavigation;
  private disposed;
  private readonly boundEscapeKeydown;
  private readonly boundBackNavKeydown;
  private readonly boundPopState;
  private readonly boundMouseSideButton;
  constructor(config: ModalDomControllerConfig<TModalKind, TMeta>);
  dispose(): void;
  private attachListeners;
  private pushHistoryTrap;
  private handleEscapeKeydown;
  private handleBackNavKeydown;
  private handlePopState;
  private handleMouseSideButton;
}