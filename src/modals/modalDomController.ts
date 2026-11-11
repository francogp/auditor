/**
 * src/modals/modalDomController.ts
 *
 * Optional, framework-agnostic browser DOM adapter for ModalStackManager:
 * - Single global Escape key router respecting defaultPrevented and IME composition
 * - Two-step backdrop pointer guard preventing accidental drag-selection dismissal
 * - Configurable history back-navigation trap, mouse side-button blocker, and
 *   editable-aware Backspace guard
 * - Automatic prefers-reduced-motion media query synchronization
 */

import { createDomainSet } from '../core/domainCollections.ts';
import type { ModalStackManager } from './modalStackManager.ts';

const PRIMARY_POINTER_BUTTON = 0;
const MOUSE_BACK_BUTTON = 3;
const MOUSE_FORWARD_BUTTON = 4;
const DEFAULT_HISTORY_GUARD_KEY = 'modalBackGuard';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const EDITABLE_TAG_NAMES = createDomainSet(['input', 'textarea', 'select'] as const);
const BROWSER_HISTORY_KEYS = createDomainSet(['BrowserBack', 'BrowserForward'] as const);
const ALT_HISTORY_ARROW_KEYS = createDomainSet(['ArrowLeft', 'ArrowRight'] as const);

export interface ModalPointerLikeEvent {
  readonly button: number;
  readonly target: unknown;
  readonly currentTarget: unknown;
}

export interface BackdropPointerGuardOptions<
  TModalKind extends string = string,
  TMeta = undefined
> {
  readonly stack: ModalStackManager<TModalKind, TMeta>;
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
}

export interface ModalDomTargetLike {
  addEventListener(type: string, listener: (event: Event) => void, options?: boolean): void;
  removeEventListener(type: string, listener: (event: Event) => void, options?: boolean): void;
  readonly history?: {
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
  readonly stack: ModalStackManager<TModalKind, TMeta>;
  readonly target?: ModalDomTargetLike;
  readonly preventDefaultOnEscape?: boolean;
  readonly syncReducedMotion?: boolean;
  readonly backNavigation?: ModalBackNavigationConfig;
}

interface EditableElementCandidate {
  readonly tagName?: unknown;
  readonly isContentEditable?: unknown;
  readonly getAttribute?: (qualifiedName: string) => string | null;
}

function defaultIsBackdropTarget(event: ModalPointerLikeEvent): boolean {
  return event.target !== null && event.target === event.currentTarget;
}

export function isEditableEventTarget(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) {
    return false;
  }
  const el = target as EditableElementCandidate;
  if (el.isContentEditable === true) {
    return true;
  }
  if (typeof el.getAttribute === 'function') {
    const contentEditableAttr = el.getAttribute('contenteditable');
    if (contentEditableAttr === '' || contentEditableAttr === 'true') {
      return true;
    }
  }
  if (typeof el.tagName === 'string') {
    return EDITABLE_TAG_NAMES.has(el.tagName.toLowerCase());
  }
  return false;
}

/**
 * Requires both pointerdown and pointerup with the primary button on the backdrop
 * while the modal is activeTop, preventing text-selection drag releases from closing modals.
 */
export function createBackdropPointerGuard<TModalKind extends string = string, TMeta = undefined>(
  options: BackdropPointerGuardOptions<TModalKind, TMeta>
): BackdropPointerGuard {
  const isBackdrop = options.isBackdropTarget ?? defaultIsBackdropTarget;
  let armedModalUid: string | null = null;

  return {
    onPointerDown(event: ModalPointerLikeEvent): void {
      const modalUid = options.getModalUid();
      if (
        event.button === PRIMARY_POINTER_BUTTON &&
        isBackdrop(event) &&
        options.stack.isActiveTop(modalUid)
      ) {
        armedModalUid = modalUid;
      } else {
        armedModalUid = null;
      }
    },
    onPointerUp(event: ModalPointerLikeEvent): boolean {
      const modalUid = options.getModalUid();
      const wasArmed = armedModalUid === modalUid;
      armedModalUid = null;
      if (
        !wasArmed ||
        event.button !== PRIMARY_POINTER_BUTTON ||
        !isBackdrop(event) ||
        !options.stack.isActiveTop(modalUid)
      ) {
        return false;
      }
      return options.stack.requestClose(modalUid, 'backdrop');
    },
    onPointerCancel(): void {
      armedModalUid = null;
    },
    reset(): void {
      armedModalUid = null;
    }
  };
}

function resolveDefaultDomTarget(): ModalDomTargetLike | undefined {
  if ('window' in globalThis && typeof globalThis.window === 'object' && globalThis.window) {
    return globalThis.window;
  }
  return undefined;
}

function shouldBlockHistoryKeyboardShortcut(
  event: KeyboardEvent,
  config: ModalBackNavigationConfig
): boolean {
  if (config.blockBrowserShortcuts !== false) {
    if (BROWSER_HISTORY_KEYS.has(event.key)) {
      return true;
    }
    if (event.altKey && ALT_HISTORY_ARROW_KEYS.has(event.key)) {
      return true;
    }
  }
  if (config.blockBackspaceOutsideInputs !== false && event.key === 'Backspace') {
    return !isEditableEventTarget(event.target);
  }
  return false;
}

export class ModalDomController<TModalKind extends string = string, TMeta = undefined> {
  private readonly stack: ModalStackManager<TModalKind, TMeta>;
  private readonly target: ModalDomTargetLike | undefined;
  private readonly preventDefaultOnEscape: boolean;
  private readonly backNavigation: ModalBackNavigationConfig | undefined;
  private disposed = false;

  private readonly boundKeydown: (event: Event) => void;
  private readonly boundPopState: (event: Event) => void;
  private readonly boundMouseSideButton: (event: Event) => void;

  public constructor(config: ModalDomControllerConfig<TModalKind, TMeta>) {
    this.stack = config.stack;
    this.target = config.target ?? resolveDefaultDomTarget();
    this.preventDefaultOnEscape = config.preventDefaultOnEscape ?? true;
    this.backNavigation = config.backNavigation?.enabled ? config.backNavigation : undefined;

    this.boundKeydown = (event: Event): void => {
      this.handleKeydown(event as KeyboardEvent);
    };
    this.boundPopState = (): void => {
      this.handlePopState();
    };
    this.boundMouseSideButton = (event: Event): void => {
      this.handleMouseSideButton(event as MouseEvent);
    };

    if ((config.syncReducedMotion ?? true) && this.target?.matchMedia) {
      const targetRef = this.target;
      this.stack.setReducedMotionProvider(
        () => targetRef.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false
      );
    }

    this.attachListeners();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.target) return;

    this.target.removeEventListener('keydown', this.boundKeydown);
    if (this.backNavigation) {
      this.target.removeEventListener('popstate', this.boundPopState);
      if (this.backNavigation.blockMouseSideButtons !== false) {
        this.target.removeEventListener('mouseup', this.boundMouseSideButton);
        this.target.removeEventListener('auxclick', this.boundMouseSideButton);
      }
    }
  }

  private attachListeners(): void {
    if (!this.target) return;

    this.target.addEventListener('keydown', this.boundKeydown);
    if (!this.backNavigation) return;

    this.pushHistoryTrap();
    this.target.addEventListener('popstate', this.boundPopState);
    if (this.backNavigation.blockMouseSideButtons !== false) {
      this.target.addEventListener('mouseup', this.boundMouseSideButton);
      this.target.addEventListener('auxclick', this.boundMouseSideButton);
    }
  }

  private pushHistoryTrap(): void {
    if (!this.target?.history || !this.backNavigation) return;
    const guardKey = this.backNavigation.guardStateKey ?? DEFAULT_HISTORY_GUARD_KEY;
    const currentHref = this.target.location?.href ?? '';
    this.target.history.pushState({ [guardKey]: true }, '', currentHref);
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing) {
      return;
    }

    if (event.key === 'Escape') {
      if (this.stack.getSnapshot().activeTop !== null) {
        if (this.preventDefaultOnEscape) {
          event.preventDefault();
        }
        this.stack.closeTop('escape');
      }
      return;
    }

    if (this.backNavigation && shouldBlockHistoryKeyboardShortcut(event, this.backNavigation)) {
      event.preventDefault();
    }
  }

  private handlePopState(): void {
    if (!this.backNavigation) return;
    this.pushHistoryTrap();
    if (this.backNavigation.onBeforePopStateDismiss?.()) {
      return;
    }
    if (this.stack.getSnapshot().activeTop !== null) {
      this.stack.closeTop('back-navigation');
    }
  }

  private handleMouseSideButton(event: MouseEvent): void {
    if (event.button === MOUSE_BACK_BUTTON || event.button === MOUSE_FORWARD_BUTTON) {
      event.preventDefault();
    }
  }
}
