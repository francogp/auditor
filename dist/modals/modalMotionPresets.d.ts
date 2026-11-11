import { ModalStackEntry } from "./modalStackTypes.js";
import { ModalCssVars } from "./modalZLayers.js";
export declare const MODAL_MOTION_PRESET_NAMES: readonly ["scale-fade", "fade", "slide-up", "slide-down", "slide-left", "slide-right", "none"];
export type ModalMotionPresetName = (typeof MODAL_MOTION_PRESET_NAMES)[number];
export declare const MODAL_RESOLVED_MOTION_NAMES: readonly ["scale-fade", "fade", "slide-up", "slide-down", "slide-left", "slide-right", "none", "custom"];
export type ModalResolvedMotionName = (typeof MODAL_RESOLVED_MOTION_NAMES)[number];
export declare const MODAL_SURFACE_PLACEMENTS: readonly ["center", "top", "bottom", "down", "left", "right", "side-left", "side-right", "fullscreen"];
export type ModalSurfacePlacement = (typeof MODAL_SURFACE_PLACEMENTS)[number];
export declare const MODAL_POSITION_STRATEGIES: readonly ["fixed", "absolute"];
export type ModalPositionStrategy = (typeof MODAL_POSITION_STRATEGIES)[number];
export declare const MODAL_CONTENT_POSITIONS: readonly ["relative"];
export type ModalContentPosition = (typeof MODAL_CONTENT_POSITIONS)[number];
export declare const MODAL_DISPLAY_MODES: readonly ["flex", "grid"];
export type ModalDisplayMode = (typeof MODAL_DISPLAY_MODES)[number];
export declare const MODAL_FLEX_ALIGNMENTS: readonly ["center", "flex-start", "flex-end", "stretch"];
export type ModalFlexAlignment = (typeof MODAL_FLEX_ALIGNMENTS)[number];
export declare const MODAL_OVERSCROLL_STRATEGIES: readonly ["contain", "none", "auto"];
export type ModalOverscrollStrategy = (typeof MODAL_OVERSCROLL_STRATEGIES)[number];
export declare const MODAL_POINTER_EVENTS_MODES: readonly ["auto", "none"];
export type ModalPointerEventsMode = (typeof MODAL_POINTER_EVENTS_MODES)[number];
export declare const DEFAULT_MODAL_ENTER_EASE = "power2.out";
export declare const DEFAULT_MODAL_ENTER_CSS_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
export interface ModalKeyframeState {
  readonly opacity?: number;
  readonly scale?: number;
  readonly x?: number | string;
  readonly y?: number | string;
}
export interface ModalPhaseTiming {
  readonly durationSec: number;
  readonly ease: string;
  readonly cssEasing: string;
}
export interface ModalPreventedMotionConfig {
  readonly enabled: boolean;
  readonly offsetPx: number;
  readonly durationSec: number;
  readonly cycles: number;
}
export interface ModalMotionPreset {
  readonly name: ModalResolvedMotionName;
  readonly panelFrom: ModalKeyframeState;
  readonly panelTo: ModalKeyframeState;
  readonly panelExitTo: ModalKeyframeState;
  readonly backdropFrom: ModalKeyframeState;
  readonly backdropTo: ModalKeyframeState;
  readonly backdropExitTo: ModalKeyframeState;
  readonly enter: ModalPhaseTiming;
  readonly exit: ModalPhaseTiming;
  readonly prevented: ModalPreventedMotionConfig;
}
export interface ModalMotionOverrides {
  readonly basePreset?: ModalMotionPresetName;
  readonly panelFrom?: ModalKeyframeState;
  readonly panelTo?: ModalKeyframeState;
  readonly panelExitTo?: ModalKeyframeState;
  readonly backdropFrom?: ModalKeyframeState;
  readonly backdropTo?: ModalKeyframeState;
  readonly backdropExitTo?: ModalKeyframeState;
  readonly enter?: Partial<ModalPhaseTiming>;
  readonly exit?: Partial<ModalPhaseTiming>;
  readonly prevented?: Partial<ModalPreventedMotionConfig>;
}
export type ModalMotionInput = ModalMotionPresetName | ModalMotionOverrides;
export declare const DEFAULT_MODAL_MOTION_PRESETS: Readonly<Record<ModalMotionPresetName, ModalMotionPreset>>;
/**
 * Maps a declarative surface placement (`'center'`, `'down'`, `'top'`, `'left'`, `'side-right'`, `'fullscreen'`)
 * to its corresponding default `ModalMotionPresetName`.
 */
export declare function resolveModalPlacementMotionPreset(placement: ModalSurfacePlacement): ModalMotionPresetName;
export interface ResolveMotionOptions {
  readonly fallbackPreset?: ModalMotionPresetName;
  readonly defaultPreset?: ModalMotionPreset;
  readonly reducedMotion?: boolean;
}
/**
 * Resolves a complete, immutable ModalMotionPreset from either a preset name
 * or partial user overrides, collapsing spatial motion when reducedMotion is active.
 */
export declare function resolveModalMotionPreset(input?: ModalMotionInput, options?: ResolveMotionOptions): ModalMotionPreset;
export interface ModalStructuralStyleConfig {
  readonly position?: ModalPositionStrategy;
  readonly inset?: string;
  readonly display?: ModalDisplayMode;
  readonly alignItems?: ModalFlexAlignment;
  readonly justifyContent?: ModalFlexAlignment;
  readonly overscrollBehavior?: ModalOverscrollStrategy;
  readonly disablePointerWhenClosing?: boolean;
  readonly fallbackZIndexVar?: string;
  readonly backdropZIndexCss?: string;
  readonly contentZIndexCss?: string;
}
export interface ModalResolvedSurfaceStyles {
  readonly cssVars: ModalCssVars;
  readonly backdropStyle: {
    readonly position: ModalPositionStrategy;
    readonly inset: string;
    readonly display: ModalDisplayMode;
    readonly alignItems: ModalFlexAlignment;
    readonly justifyContent: ModalFlexAlignment;
    readonly overscrollBehavior: ModalOverscrollStrategy;
    readonly pointerEvents: ModalPointerEventsMode;
    readonly zIndex: string;
  };
  readonly contentStyle: {
    readonly position: ModalContentPosition;
    readonly pointerEvents: ModalPointerEventsMode;
    readonly zIndex: string;
  };
}
/**
 * Produces theme-agnostic structural layout styles (flex centering, scroll-chaining
 * containment, closing pointer pass-through, and CSS custom property z-index references)
 * with full developer override support and zero hardcoded colors or visual chrome.
 */
export declare function resolveModalStructuralStyles<TModalKind extends string, TMeta>(entry: ModalStackEntry<TModalKind, TMeta>, overrides?: ModalStructuralStyleConfig): ModalResolvedSurfaceStyles;