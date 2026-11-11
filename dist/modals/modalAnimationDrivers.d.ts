import { ModalMotionInput, ModalMotionPreset } from "./modalMotionPresets.js";
import { ModalEntryPatch, ModalStackController } from "./modalStackTypes.js";
export declare const MODAL_WAAPI_FILL_MODES: readonly ["forwards", "none"];
export type ModalWaapiFillMode = (typeof MODAL_WAAPI_FILL_MODES)[number];
export declare const GSAP_OVERWRITE_MODES: readonly ["auto"];
export type GsapOverwriteMode = (typeof GSAP_OVERWRITE_MODES)[number];
export interface ModalSurfaceElements {
  readonly backdrop?: unknown;
  readonly panel?: unknown;
  readonly container?: unknown;
}
export interface ModalAnimatePhaseParams {
  readonly modalUid: string;
  readonly elements: ModalSurfaceElements;
  readonly preset: ModalMotionPreset;
  readonly onComplete: () => void;
}
export interface ModalAnimatePreventedParams {
  readonly modalUid: string;
  readonly elements: ModalSurfaceElements;
  readonly preset: ModalMotionPreset;
}
export interface ModalAnimationDriver {
  animateOpen(params: ModalAnimatePhaseParams): void;
  animateClose(params: ModalAnimatePhaseParams): void;
  animatePrevented?(params: ModalAnimatePreventedParams): void;
  cleanup?(modalUid: string): void;
}
export interface ModalWaapiKeyframe {
  readonly opacity?: number;
  readonly transform?: string;
}
/**
 * Default zero-dependency browser Web Animations API driver.
 * Gracefully completes synchronously in SSR or headless test environments without WAAPI.
 */
export declare function createWaapiModalDriver(): ModalAnimationDriver;
export interface GsapContextLike {
  revert(): void;
}
export interface GsapTweenVars {
  readonly opacity?: number;
  readonly scale?: number;
  readonly x?: number | string;
  readonly y?: number | string;
  readonly duration?: number;
  readonly ease?: string;
  readonly repeat?: number;
  readonly yoyo?: boolean;
  readonly overwrite?: GsapOverwriteMode | boolean;
  readonly onComplete?: () => void;
}
export type GsapTweenTarget = object | string | null;
export type GsapContextScope = Element | object | string;
export interface GsapEngineLike {
  fromTo(target: GsapTweenTarget, fromVars: GsapTweenVars, toVars: GsapTweenVars): unknown;
  to(target: GsapTweenTarget, toVars: GsapTweenVars): unknown;
  context?(setup: () => void, scope?: GsapContextScope): GsapContextLike;
}
/**
 * Dependency-injected GSAP animation driver adhering to `/gsap-frameworks`:
 * scopes all tweens per modal via `gsap.context()` and calls `ctx.revert()` on `close-end`.
 */
export declare function createGsapModalDriver(gsapEngine: GsapEngineLike): ModalAnimationDriver;
export interface ModalAnimationControllerConfig<TModalKind extends string = string, TMeta = undefined> {
  readonly stack: ModalStackController<TModalKind, TMeta>;
  readonly driver?: ModalAnimationDriver;
}
export interface ModalBindSurfaceOptions<TModalKind extends string = string, TMeta = undefined> {
  readonly motion?: ModalMotionInput;
  readonly patch?: ModalEntryPatch<TModalKind, TMeta>;
}
/**
 * Coordinates lifecycle events from `ModalStackManager` (`open-start`, `close-start`,
 * `close-prevented`, `close-end`) with any pluggable `ModalAnimationDriver`.
 */
export declare class ModalAnimationController<TModalKind extends string = string, TMeta = undefined> {
  readonly __v_skip?: boolean;
  private readonly stack;
  private readonly driver;
  private readonly surfacesByUid;
  private readonly unsubscribers;
  constructor(config: ModalAnimationControllerConfig<TModalKind, TMeta>);
  /**
   * Registers the rendered DOM elements for a modal instance (optionally applying
   * child-component declarative `motion` or `patch` overrides). If the modal is
   * currently in its `'opening'` phase, immediately triggers the entrance animation.
   */
  bindSurface(modalUid: string, elements: ModalSurfaceElements, options?: ModalBindSurfaceOptions<TModalKind, TMeta>): () => void;
  dispose(): void;
  private runOpenIfBound;
  private cleanupModal;
}