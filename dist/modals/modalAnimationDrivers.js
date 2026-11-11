import { addToSetMap } from "./modalInternalUtils.js";
import { DEFAULT_MODAL_ENTER_CSS_EASING, DEFAULT_MODAL_ENTER_EASE } from "./modalMotionPresets.js";
// src/modals/modalAnimationDrivers.ts
/**
* src/modals/modalAnimationDrivers.ts
*
* Pluggable browser-safe animation drivers (Web Animations API default and
* dependency-injected GSAP adapter with `gsap.context()` cleanup) plus the
* `ModalAnimationController` lifecycle bridge.
*/
const MS_PER_SECOND = 1e3;
const MODAL_WAAPI_FILL_MODES = ["forwards", "none"];
const GSAP_OVERWRITE_MODES = ["auto"];
function isWaapiElement(candidate) {
	return typeof candidate === "object" && candidate !== null && "animate" in candidate && typeof candidate.animate === "function";
}
function formatCssOffset(value) {
	if (value === void 0 || value === 0) return "0px";
	return typeof value === "number" ? `${value}px` : value;
}
function toWaapiKeyframe(state) {
	return {
		opacity: state.opacity ?? 1,
		transform: `translate3d(${formatCssOffset(state.x)}, ${formatCssOffset(state.y)}, 0) scale(${state.scale ?? 1})`
	};
}
/**
* Default zero-dependency browser Web Animations API driver.
* Gracefully completes synchronously in SSR or headless test environments without WAAPI.
*/
function createWaapiModalDriver() {
	const activeAnimationsByUid = /* @__PURE__ */ new Map();
	const trackAnimation = (modalUid, anim) => {
		addToSetMap(activeAnimationsByUid, modalUid, anim);
	};
	const cancelTracked = (modalUid) => {
		const bucket = activeAnimationsByUid.get(modalUid);
		if (!bucket) return;
		activeAnimationsByUid.delete(modalUid);
		for (const anim of bucket) anim.cancel();
	};
	const runWaapiPhaseTransition = (params) => {
		cancelTracked(params.modalUid);
		const durationMs = Math.max(0, params.durationSec * MS_PER_SECOND);
		if (durationMs === 0 || !isWaapiElement(params.elements.panel)) {
			params.onComplete();
			return;
		}
		if (isWaapiElement(params.elements.backdrop)) {
			const backdropAnim = params.elements.backdrop.animate([toWaapiKeyframe(params.backdropFrames[0]), toWaapiKeyframe(params.backdropFrames[1])], {
				duration: durationMs,
				easing: params.cssEasing,
				fill: "forwards"
			});
			trackAnimation(params.modalUid, backdropAnim);
		}
		let finished = false;
		const settle = () => {
			if (finished) return;
			finished = true;
			params.onComplete();
		};
		const panelAnim = params.elements.panel.animate([toWaapiKeyframe(params.panelFrames[0]), toWaapiKeyframe(params.panelFrames[1])], {
			duration: durationMs,
			easing: params.cssEasing,
			fill: "forwards"
		});
		panelAnim.onfinish = settle;
		panelAnim.oncancel = settle;
		trackAnimation(params.modalUid, panelAnim);
	};
	return {
		animateOpen({ modalUid, elements, preset, onComplete }) {
			runWaapiPhaseTransition({
				modalUid,
				elements,
				backdropFrames: [preset.backdropFrom, preset.backdropTo],
				panelFrames: [preset.panelFrom, preset.panelTo],
				durationSec: preset.enter.durationSec,
				cssEasing: preset.enter.cssEasing,
				onComplete
			});
		},
		animateClose({ modalUid, elements, preset, onComplete }) {
			runWaapiPhaseTransition({
				modalUid,
				elements,
				backdropFrames: [preset.backdropTo, preset.backdropExitTo],
				panelFrames: [preset.panelTo, preset.panelExitTo],
				durationSec: preset.exit.durationSec,
				cssEasing: preset.exit.cssEasing,
				onComplete
			});
		},
		animatePrevented({ modalUid, elements, preset }) {
			if (!preset.prevented.enabled || preset.prevented.durationSec <= 0 || preset.prevented.cycles <= 0 || !isWaapiElement(elements.panel)) return;
			const offset = preset.prevented.offsetPx;
			const frames = [{ transform: "translate3d(0px, 0, 0)" }];
			for (let i = 0; i < preset.prevented.cycles; i++) {
				frames.push({ transform: `translate3d(-${offset}px, 0, 0)` });
				frames.push({ transform: `translate3d(${offset}px, 0, 0)` });
			}
			frames.push({ transform: "translate3d(0px, 0, 0)" });
			const shakeAnim = elements.panel.animate(frames, {
				duration: Math.max(0, preset.prevented.durationSec * MS_PER_SECOND),
				easing: DEFAULT_MODAL_ENTER_CSS_EASING,
				fill: "none"
			});
			trackAnimation(modalUid, shakeAnim);
		},
		cleanup(modalUid) {
			cancelTracked(modalUid);
		}
	};
}
/**
* Dependency-injected GSAP animation driver adhering to `/gsap-frameworks`:
* scopes all tweens per modal via `gsap.context()` and calls `ctx.revert()` on `close-end`.
*/
function createGsapModalDriver(gsapEngine) {
	const contextsByUid = /* @__PURE__ */ new Map();
	const replaceScoped = (modalUid, scope, fn) => {
		if (!gsapEngine.context) {
			fn();
			return;
		}
		const existing = contextsByUid.get(modalUid);
		if (existing) existing.revert();
		const ctx = gsapEngine.context(fn, scope);
		contextsByUid.set(modalUid, ctx);
	};
	const appendScoped = (modalUid, scope, fn) => {
		if (!gsapEngine.context) {
			fn();
			return;
		}
		const ctx = gsapEngine.context(fn, scope);
		const prev = contextsByUid.get(modalUid);
		contextsByUid.set(modalUid, prev ? { revert() {
			ctx.revert();
			prev.revert();
		} } : ctx);
	};
	return {
		animateOpen({ modalUid, elements, preset, onComplete }) {
			if (preset.enter.durationSec <= 0 || !elements.panel) {
				onComplete();
				return;
			}
			replaceScoped(modalUid, elements.container ?? elements.panel, () => {
				if (elements.backdrop) gsapEngine.fromTo(elements.backdrop, preset.backdropFrom, {
					...preset.backdropTo,
					duration: preset.enter.durationSec,
					ease: preset.enter.ease,
					overwrite: "auto"
				});
				gsapEngine.fromTo(elements.panel, preset.panelFrom, {
					...preset.panelTo,
					duration: preset.enter.durationSec,
					ease: preset.enter.ease,
					overwrite: "auto",
					onComplete
				});
			});
		},
		animateClose({ modalUid, elements, preset, onComplete }) {
			if (preset.exit.durationSec <= 0 || !elements.panel) {
				onComplete();
				return;
			}
			appendScoped(modalUid, elements.container ?? elements.panel, () => {
				if (elements.backdrop) gsapEngine.to(elements.backdrop, {
					...preset.backdropExitTo,
					duration: preset.exit.durationSec,
					ease: preset.exit.ease,
					overwrite: "auto"
				});
				gsapEngine.to(elements.panel, {
					...preset.panelExitTo,
					duration: preset.exit.durationSec,
					ease: preset.exit.ease,
					overwrite: "auto",
					onComplete
				});
			});
		},
		animatePrevented({ modalUid, elements, preset }) {
			if (!preset.prevented.enabled || !elements.panel || preset.prevented.durationSec <= 0 || preset.prevented.cycles <= 0) return;
			const halfOscillations = preset.prevented.cycles * 2;
			const legDuration = preset.prevented.durationSec / (halfOscillations + 1);
			appendScoped(modalUid, elements.container ?? elements.panel, () => {
				gsapEngine.fromTo(elements.panel, { x: -preset.prevented.offsetPx }, {
					x: preset.prevented.offsetPx,
					duration: legDuration,
					repeat: halfOscillations - 1,
					yoyo: true,
					ease: DEFAULT_MODAL_ENTER_EASE,
					overwrite: "auto",
					onComplete: () => {
						gsapEngine.to(elements.panel, {
							x: 0,
							duration: legDuration,
							ease: DEFAULT_MODAL_ENTER_EASE,
							overwrite: "auto"
						});
					}
				});
			});
		},
		cleanup(modalUid) {
			const ctx = contextsByUid.get(modalUid);
			if (ctx) {
				contextsByUid.delete(modalUid);
				ctx.revert();
			}
		}
	};
}
/**
* Coordinates lifecycle events from `ModalStackManager` (`open-start`, `close-start`,
* `close-prevented`, `close-end`) with any pluggable `ModalAnimationDriver`.
*/
var ModalAnimationController = class {
	stack;
	driver;
	surfacesByUid = /* @__PURE__ */ new Map();
	unsubscribers = [];
	constructor(config) {
		this.stack = config.stack;
		this.driver = config.driver ?? createWaapiModalDriver();
		this.unsubscribers.push(this.stack.on("open-start", (event) => {
			if (!event.entry) return;
			this.runOpenIfBound(event.entry);
		}), this.stack.on("close-start", (event) => {
			if (!event.entry) return;
			const elements = this.surfacesByUid.get(event.entry.modalUid);
			if (!elements) return;
			const latestEntry = this.stack.getByUid(event.entry.modalUid) ?? event.entry;
			const done = event.deferClose();
			this.driver.animateClose({
				modalUid: latestEntry.modalUid,
				elements,
				preset: latestEntry.motion,
				onComplete: done
			});
		}), this.stack.on("close-prevented", (event) => {
			if (!event.entry || !this.driver.animatePrevented) return;
			const elements = this.surfacesByUid.get(event.entry.modalUid);
			if (!elements) return;
			const latestEntry = this.stack.getByUid(event.entry.modalUid) ?? event.entry;
			this.driver.animatePrevented({
				modalUid: latestEntry.modalUid,
				elements,
				preset: latestEntry.motion
			});
		}), this.stack.on("close-end", (event) => {
			if (!event.entry) return;
			this.cleanupModal(event.entry.modalUid);
		}));
	}
	/**
	* Registers the rendered DOM elements for a modal instance (optionally applying
	* child-component declarative `motion` or `patch` overrides). If the modal is
	* currently in its `'opening'` phase, immediately triggers the entrance animation.
	*/
	bindSurface(modalUid, elements, options) {
		this.surfacesByUid.set(modalUid, elements);
		if (options?.patch || options?.motion !== void 0) {
			const mergedPatch = options.motion !== void 0 ? {
				...options.patch,
				motion: options.motion
			} : options.patch;
			this.stack.updateEntry(modalUid, mergedPatch);
		}
		const currentEntry = this.stack.getByUid(modalUid);
		if (currentEntry && currentEntry.phase === "opening") this.runOpenIfBound(currentEntry);
		return () => {
			this.cleanupModal(modalUid);
		};
	}
	dispose() {
		for (const unsub of this.unsubscribers) unsub();
		this.unsubscribers.length = 0;
		for (const uid of Array.from(this.surfacesByUid.keys())) this.cleanupModal(uid);
	}
	runOpenIfBound(entry) {
		const elements = this.surfacesByUid.get(entry.modalUid);
		if (!elements) return;
		this.driver.animateOpen({
			modalUid: entry.modalUid,
			elements,
			preset: entry.motion,
			onComplete: () => {
				this.stack.completeOpen(entry.modalUid);
			}
		});
	}
	cleanupModal(modalUid) {
		this.surfacesByUid.delete(modalUid);
		this.driver.cleanup?.(modalUid);
	}
};
export { GSAP_OVERWRITE_MODES, MODAL_WAAPI_FILL_MODES, ModalAnimationController, createGsapModalDriver, createWaapiModalDriver };
