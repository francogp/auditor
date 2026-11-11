/**
 * src/modals/index.ts
 *
 * Public browser-safe entrypoint for `@francogp/auditor/modals`.
 * Zero Node.js built-ins or UI framework runtime dependencies.
 */

export {
  CANONICAL_Z_LAYERS,
  MODAL_CSS_VAR_NAMES,
  resolveModalCssVars,
  resolveModalDomIds,
  resolveModalZLayers,
  type CanonicalZLayerKey,
  type CustomModalCssVarName,
  type CustomModalCssVars,
  type CustomModalZLayers,
  type ModalCssVarName,
  type ModalCssVars,
  type ModalCssVarsOptions,
  type ModalDomIds,
  type ModalLayerValues,
  type ModalZLayerScale
} from './modalZLayers.ts';

export {
  DEFAULT_MODAL_ENTER_CSS_EASING,
  DEFAULT_MODAL_ENTER_EASE,
  DEFAULT_MODAL_MOTION_PRESETS,
  MODAL_CONTENT_POSITIONS,
  MODAL_DISPLAY_MODES,
  MODAL_FLEX_ALIGNMENTS,
  MODAL_MOTION_PRESET_NAMES,
  MODAL_OVERSCROLL_STRATEGIES,
  MODAL_POINTER_EVENTS_MODES,
  MODAL_POSITION_STRATEGIES,
  MODAL_RESOLVED_MOTION_NAMES,
  MODAL_SURFACE_PLACEMENTS,
  resolveModalMotionPreset,
  resolveModalPlacementMotionPreset,
  resolveModalStructuralStyles,
  type ModalContentPosition,
  type ModalDisplayMode,
  type ModalFlexAlignment,
  type ModalKeyframeState,
  type ModalMotionInput,
  type ModalMotionOverrides,
  type ModalMotionPreset,
  type ModalMotionPresetName,
  type ModalOverscrollStrategy,
  type ModalPhaseTiming,
  type ModalPointerEventsMode,
  type ModalPositionStrategy,
  type ModalPreventedMotionConfig,
  type ModalResolvedMotionName,
  type ModalResolvedSurfaceStyles,
  type ModalStructuralStyleConfig,
  type ModalSurfacePlacement,
  type ResolveMotionOptions
} from './modalMotionPresets.ts';

export {
  GSAP_OVERWRITE_MODES,
  MODAL_WAAPI_FILL_MODES,
  ModalAnimationController,
  createGsapModalDriver,
  createWaapiModalDriver,
  type GsapContextLike,
  type GsapEngineLike,
  type GsapOverwriteMode,
  type GsapTweenVars,
  type ModalAnimatePhaseParams,
  type ModalAnimatePreventedParams,
  type ModalAnimationControllerConfig,
  type ModalAnimationDriver,
  type ModalSurfaceElements,
  type ModalWaapiFillMode,
  type ModalWaapiKeyframe
} from './modalAnimationDrivers.ts';

export {
  MODAL_CLOSE_REASONS,
  MODAL_DISMISS_MODES,
  MODAL_LIFECYCLE_EVENTS,
  MODAL_PHASES,
  MODAL_SINGLETON_POLICIES,
  type ModalCeilingDiagnostic,
  type ModalClearAllOptions,
  type ModalCloseAttemptContext,
  type ModalCloseReason,
  type ModalCloseResult,
  type ModalDismissMode,
  type ModalGuardResult,
  type ModalLifecycleEvent,
  type ModalLifecycleEventType,
  type ModalLifecycleListener,
  type ModalLookupOptions,
  type ModalOpenOptions,
  type ModalPhase,
  type ModalSingletonPolicy,
  type ModalSnapshotListener,
  type ModalStackConfig,
  type ModalStackEntry,
  type ModalStackSnapshot
} from './modalStackTypes.ts';

export { createModalStack, ModalStackManager } from './modalStackManager.ts';

export {
  createBackdropPointerGuard,
  isEditableEventTarget,
  ModalDomController,
  type BackdropPointerGuard,
  type BackdropPointerGuardOptions,
  type ModalBackNavigationConfig,
  type ModalDomControllerConfig,
  type ModalDomTargetLike,
  type ModalPointerLikeEvent
} from './modalDomController.ts';

export {
  createModalSequenceQueue,
  ModalSequenceQueue,
  type ModalSequenceQueueConfig,
  type ModalSequenceTask
} from './modalSequenceQueue.ts';
