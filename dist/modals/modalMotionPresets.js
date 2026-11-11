import { resolveModalCssVars } from "./modalZLayers.js";
// src/modals/modalMotionPresets.ts
const MODAL_MOTION_PRESET_NAMES = [
	"scale-fade",
	"fade",
	"slide-up",
	"slide-down",
	"slide-left",
	"slide-right",
	"none"
];
const MODAL_RESOLVED_MOTION_NAMES = [...MODAL_MOTION_PRESET_NAMES, "custom"];
const MODAL_SURFACE_PLACEMENTS = [
	"center",
	"top",
	"bottom",
	"down",
	"left",
	"right",
	"side-left",
	"side-right",
	"fullscreen"
];
const MODAL_POSITION_STRATEGIES = ["fixed", "absolute"];
const MODAL_CONTENT_POSITIONS = ["relative"];
const MODAL_DISPLAY_MODES = ["flex", "grid"];
const MODAL_FLEX_ALIGNMENTS = [
	"center",
	"flex-start",
	"flex-end",
	"stretch"
];
const MODAL_OVERSCROLL_STRATEGIES = [
	"contain",
	"none",
	"auto"
];
const MODAL_POINTER_EVENTS_MODES = ["auto", "none"];
const DEFAULT_ENTER_DURATION_SEC = .22;
const DEFAULT_EXIT_DURATION_SEC = .18;
const DEFAULT_SLIDE_ENTER_DURATION_SEC = .26;
const DEFAULT_SLIDE_EXIT_DURATION_SEC = .2;
const DEFAULT_INITIAL_SCALE = .96;
const DEFAULT_EXIT_SCALE = .97;
const DEFAULT_SCALE_Y_OFFSET_PX = 10;
const DEFAULT_SHAKE_OFFSET_PX = 6;
const DEFAULT_SHAKE_DURATION_SEC = .24;
const DEFAULT_SHAKE_CYCLES = 2;
const DEFAULT_MODAL_ENTER_EASE = "power2.out";
const DEFAULT_MODAL_ENTER_CSS_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const DEFAULT_EXIT_EASE = "power2.in";
const DEFAULT_EXIT_CSS_EASING = "cubic-bezier(0.4, 0, 1, 1)";
const LINEAR_CSS_EASING = "linear";
const DEFAULT_FALLBACK_Z_INDEX_VAR = "var(--z-modal)";
const DEFAULT_PREVENTED_SHAKE = Object.freeze({
	enabled: true,
	offsetPx: DEFAULT_SHAKE_OFFSET_PX,
	durationSec: DEFAULT_SHAKE_DURATION_SEC,
	cycles: DEFAULT_SHAKE_CYCLES
});
const DISABLED_PREVENTED_SHAKE = Object.freeze({
	enabled: false,
	offsetPx: 0,
	durationSec: 0,
	cycles: 0
});
const STANDARD_BACKDROP_FROM = Object.freeze({ opacity: 0 });
const STANDARD_BACKDROP_TO = Object.freeze({ opacity: 1 });
const RESTING_PANEL_STATE = Object.freeze({
	opacity: 1,
	scale: 1,
	x: 0,
	y: 0
});
const STANDARD_ENTER_TIMING = Object.freeze({
	durationSec: DEFAULT_ENTER_DURATION_SEC,
	ease: DEFAULT_MODAL_ENTER_EASE,
	cssEasing: DEFAULT_MODAL_ENTER_CSS_EASING
});
const STANDARD_EXIT_TIMING = Object.freeze({
	durationSec: DEFAULT_EXIT_DURATION_SEC,
	ease: DEFAULT_EXIT_EASE,
	cssEasing: DEFAULT_EXIT_CSS_EASING
});
const SLIDE_ENTER_TIMING = Object.freeze({
	durationSec: DEFAULT_SLIDE_ENTER_DURATION_SEC,
	ease: DEFAULT_MODAL_ENTER_EASE,
	cssEasing: DEFAULT_MODAL_ENTER_CSS_EASING
});
const SLIDE_EXIT_TIMING = Object.freeze({
	durationSec: DEFAULT_SLIDE_EXIT_DURATION_SEC,
	ease: DEFAULT_EXIT_EASE,
	cssEasing: DEFAULT_EXIT_CSS_EASING
});
const INSTANT_TIMING = Object.freeze({
	durationSec: 0,
	ease: "none",
	cssEasing: LINEAR_CSS_EASING
});
const DEFAULT_MODAL_MOTION_PRESETS = Object.freeze({
	"scale-fade": Object.freeze({
		name: "scale-fade",
		panelFrom: Object.freeze({
			opacity: 0,
			scale: DEFAULT_INITIAL_SCALE,
			x: 0,
			y: DEFAULT_SCALE_Y_OFFSET_PX
		}),
		panelTo: RESTING_PANEL_STATE,
		panelExitTo: Object.freeze({
			opacity: 0,
			scale: DEFAULT_EXIT_SCALE,
			x: 0,
			y: DEFAULT_SCALE_Y_OFFSET_PX
		}),
		backdropFrom: STANDARD_BACKDROP_FROM,
		backdropTo: STANDARD_BACKDROP_TO,
		backdropExitTo: STANDARD_BACKDROP_FROM,
		enter: STANDARD_ENTER_TIMING,
		exit: STANDARD_EXIT_TIMING,
		prevented: DEFAULT_PREVENTED_SHAKE
	}),
	fade: Object.freeze({
		name: "fade",
		panelFrom: Object.freeze({
			opacity: 0,
			scale: 1,
			x: 0,
			y: 0
		}),
		panelTo: RESTING_PANEL_STATE,
		panelExitTo: Object.freeze({
			opacity: 0,
			scale: 1,
			x: 0,
			y: 0
		}),
		backdropFrom: STANDARD_BACKDROP_FROM,
		backdropTo: STANDARD_BACKDROP_TO,
		backdropExitTo: STANDARD_BACKDROP_FROM,
		enter: STANDARD_ENTER_TIMING,
		exit: STANDARD_EXIT_TIMING,
		prevented: DEFAULT_PREVENTED_SHAKE
	}),
	"slide-up": Object.freeze({
		name: "slide-up",
		panelFrom: Object.freeze({
			opacity: 0,
			scale: 1,
			x: 0,
			y: "100%"
		}),
		panelTo: RESTING_PANEL_STATE,
		panelExitTo: Object.freeze({
			opacity: 0,
			scale: 1,
			x: 0,
			y: "100%"
		}),
		backdropFrom: STANDARD_BACKDROP_FROM,
		backdropTo: STANDARD_BACKDROP_TO,
		backdropExitTo: STANDARD_BACKDROP_FROM,
		enter: SLIDE_ENTER_TIMING,
		exit: SLIDE_EXIT_TIMING,
		prevented: DEFAULT_PREVENTED_SHAKE
	}),
	"slide-down": Object.freeze({
		name: "slide-down",
		panelFrom: Object.freeze({
			opacity: 0,
			scale: 1,
			x: 0,
			y: "-100%"
		}),
		panelTo: RESTING_PANEL_STATE,
		panelExitTo: Object.freeze({
			opacity: 0,
			scale: 1,
			x: 0,
			y: "-100%"
		}),
		backdropFrom: STANDARD_BACKDROP_FROM,
		backdropTo: STANDARD_BACKDROP_TO,
		backdropExitTo: STANDARD_BACKDROP_FROM,
		enter: SLIDE_ENTER_TIMING,
		exit: SLIDE_EXIT_TIMING,
		prevented: DEFAULT_PREVENTED_SHAKE
	}),
	"slide-left": Object.freeze({
		name: "slide-left",
		panelFrom: Object.freeze({
			opacity: 0,
			scale: 1,
			x: "-100%",
			y: 0
		}),
		panelTo: RESTING_PANEL_STATE,
		panelExitTo: Object.freeze({
			opacity: 0,
			scale: 1,
			x: "-100%",
			y: 0
		}),
		backdropFrom: STANDARD_BACKDROP_FROM,
		backdropTo: STANDARD_BACKDROP_TO,
		backdropExitTo: STANDARD_BACKDROP_FROM,
		enter: SLIDE_ENTER_TIMING,
		exit: SLIDE_EXIT_TIMING,
		prevented: DEFAULT_PREVENTED_SHAKE
	}),
	"slide-right": Object.freeze({
		name: "slide-right",
		panelFrom: Object.freeze({
			opacity: 0,
			scale: 1,
			x: "100%",
			y: 0
		}),
		panelTo: RESTING_PANEL_STATE,
		panelExitTo: Object.freeze({
			opacity: 0,
			scale: 1,
			x: "100%",
			y: 0
		}),
		backdropFrom: STANDARD_BACKDROP_FROM,
		backdropTo: STANDARD_BACKDROP_TO,
		backdropExitTo: STANDARD_BACKDROP_FROM,
		enter: SLIDE_ENTER_TIMING,
		exit: SLIDE_EXIT_TIMING,
		prevented: DEFAULT_PREVENTED_SHAKE
	}),
	none: Object.freeze({
		name: "none",
		panelFrom: RESTING_PANEL_STATE,
		panelTo: RESTING_PANEL_STATE,
		panelExitTo: RESTING_PANEL_STATE,
		backdropFrom: STANDARD_BACKDROP_TO,
		backdropTo: STANDARD_BACKDROP_TO,
		backdropExitTo: STANDARD_BACKDROP_TO,
		enter: INSTANT_TIMING,
		exit: INSTANT_TIMING,
		prevented: DISABLED_PREVENTED_SHAKE
	})
});
const PLACEMENT_TO_PRESET_MAP = Object.freeze({
	center: "scale-fade",
	top: "slide-down",
	bottom: "slide-up",
	down: "slide-up",
	left: "slide-left",
	"side-left": "slide-left",
	right: "slide-right",
	"side-right": "slide-right",
	fullscreen: "fade"
});
/**
* Maps a declarative surface placement (`'center'`, `'down'`, `'top'`, `'left'`, `'side-right'`, `'fullscreen'`)
* to its corresponding default `ModalMotionPresetName`.
*/
function resolveModalPlacementMotionPreset(placement) {
	return PLACEMENT_TO_PRESET_MAP[placement];
}
/**
* Resolves a complete, immutable ModalMotionPreset from either a preset name
* or partial user overrides, collapsing spatial motion when reducedMotion is active.
*/
function resolveModalMotionPreset(input, options = {}) {
	if (options.reducedMotion) return DEFAULT_MODAL_MOTION_PRESETS.none;
	const fallbackName = options.fallbackPreset ?? "scale-fade";
	const fallbackBase = options.defaultPreset ?? DEFAULT_MODAL_MOTION_PRESETS[fallbackName];
	if (input === void 0) return fallbackBase;
	if (typeof input === "string") return DEFAULT_MODAL_MOTION_PRESETS[input];
	const base = input.basePreset ? DEFAULT_MODAL_MOTION_PRESETS[input.basePreset] : fallbackBase;
	return Object.freeze({
		name: "custom",
		panelFrom: Object.freeze({
			...base.panelFrom,
			...input.panelFrom
		}),
		panelTo: Object.freeze({
			...base.panelTo,
			...input.panelTo
		}),
		panelExitTo: Object.freeze({
			...base.panelExitTo,
			...input.panelExitTo ?? input.panelFrom
		}),
		backdropFrom: Object.freeze({
			...base.backdropFrom,
			...input.backdropFrom
		}),
		backdropTo: Object.freeze({
			...base.backdropTo,
			...input.backdropTo
		}),
		backdropExitTo: Object.freeze({
			...base.backdropExitTo,
			...input.backdropExitTo ?? input.backdropFrom
		}),
		enter: Object.freeze({
			...base.enter,
			...input.enter
		}),
		exit: Object.freeze({
			...base.exit,
			...input.exit
		}),
		prevented: Object.freeze({
			...base.prevented,
			...input.prevented
		})
	});
}
/**
* Produces theme-agnostic structural layout styles (flex centering, scroll-chaining
* containment, closing pointer pass-through, and CSS custom property z-index references)
* with full developer override support and zero hardcoded colors or visual chrome.
*/
function resolveModalStructuralStyles(entry, overrides = {}) {
	const cssVars = resolveModalCssVars(entry);
	const pointerEvents = (overrides.disablePointerWhenClosing ?? true) && entry.phase === "closing" ? "none" : "auto";
	const fallbackVar = overrides.fallbackZIndexVar ?? DEFAULT_FALLBACK_Z_INDEX_VAR;
	return Object.freeze({
		cssVars,
		backdropStyle: Object.freeze({
			position: overrides.position ?? "fixed",
			inset: overrides.inset ?? "0",
			display: overrides.display ?? "flex",
			alignItems: overrides.alignItems ?? "center",
			justifyContent: overrides.justifyContent ?? "center",
			overscrollBehavior: overrides.overscrollBehavior ?? "contain",
			pointerEvents,
			zIndex: overrides.backdropZIndexCss ?? `var(--modal-backdrop-z, ${fallbackVar})`
		}),
		contentStyle: Object.freeze({
			position: "relative",
			pointerEvents,
			zIndex: overrides.contentZIndexCss ?? `var(--modal-content-z, ${fallbackVar})`
		})
	});
}
export { DEFAULT_MODAL_ENTER_CSS_EASING, DEFAULT_MODAL_ENTER_EASE, DEFAULT_MODAL_MOTION_PRESETS, MODAL_CONTENT_POSITIONS, MODAL_DISPLAY_MODES, MODAL_FLEX_ALIGNMENTS, MODAL_MOTION_PRESET_NAMES, MODAL_OVERSCROLL_STRATEGIES, MODAL_POINTER_EVENTS_MODES, MODAL_POSITION_STRATEGIES, MODAL_RESOLVED_MOTION_NAMES, MODAL_SURFACE_PLACEMENTS, resolveModalMotionPreset, resolveModalPlacementMotionPreset, resolveModalStructuralStyles };
