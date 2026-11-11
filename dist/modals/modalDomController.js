import { createDomainSet } from "../core/domainCollections.js";
// src/modals/modalDomController.ts
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
const PRIMARY_POINTER_BUTTON = 0;
const MOUSE_BACK_BUTTON = 3;
const MOUSE_FORWARD_BUTTON = 4;
const DEFAULT_HISTORY_GUARD_KEY = "modalBackGuard";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const EDITABLE_TAG_NAMES = createDomainSet([
	"input",
	"textarea",
	"select"
]);
const BROWSER_HISTORY_KEYS = createDomainSet(["BrowserBack", "BrowserForward"]);
const ALT_HISTORY_ARROW_KEYS = createDomainSet(["ArrowLeft", "ArrowRight"]);
function defaultIsBackdropTarget(event) {
	return event.target !== null && event.target === event.currentTarget;
}
function isEditableEventTarget(target) {
	if (typeof target !== "object" || target === null) return false;
	const el = target;
	if (el.isContentEditable === true) return true;
	if (typeof el.getAttribute === "function") {
		const contentEditableAttr = el.getAttribute("contenteditable");
		if (contentEditableAttr === "" || contentEditableAttr === "true") return true;
	}
	if (typeof el.tagName === "string") return EDITABLE_TAG_NAMES.has(el.tagName.toLowerCase());
	return false;
}
/**
* Requires both pointerdown and pointerup with the primary button on the backdrop
* while the modal is activeTop, preventing text-selection drag releases from closing modals.
*/
function createBackdropPointerGuard(options) {
	const isBackdrop = options.isBackdropTarget ?? defaultIsBackdropTarget;
	let armedModalUid = null;
	return {
		onPointerDown(event) {
			const modalUid = options.getModalUid();
			if (event.button === PRIMARY_POINTER_BUTTON && isBackdrop(event) && options.stack.isActiveTop(modalUid)) armedModalUid = modalUid;
			else armedModalUid = null;
		},
		onPointerUp(event) {
			const modalUid = options.getModalUid();
			const wasArmed = armedModalUid === modalUid;
			armedModalUid = null;
			if (!wasArmed || event.button !== PRIMARY_POINTER_BUTTON || !isBackdrop(event) || !options.stack.isActiveTop(modalUid)) return false;
			return options.stack.requestClose(modalUid, "backdrop");
		},
		onPointerCancel() {
			armedModalUid = null;
		},
		reset() {
			armedModalUid = null;
		}
	};
}
function resolveDefaultDomTarget() {
	if ("window" in globalThis && typeof globalThis.window === "object" && globalThis.window) return globalThis.window;
}
function shouldBlockHistoryKeyboardShortcut(event, config) {
	if (config.blockBrowserShortcuts !== false) {
		if (BROWSER_HISTORY_KEYS.has(event.key)) return true;
		if (event.altKey && ALT_HISTORY_ARROW_KEYS.has(event.key)) return true;
	}
	if (config.blockBackspaceOutsideInputs !== false && event.key === "Backspace") return !isEditableEventTarget(event.target);
	return false;
}
var ModalDomController = class {
	stack;
	target;
	preventDefaultOnEscape;
	backNavigation;
	disposed = false;
	boundKeydown;
	boundPopState;
	boundMouseSideButton;
	constructor(config) {
		this.stack = config.stack;
		this.target = config.target ?? resolveDefaultDomTarget();
		this.preventDefaultOnEscape = config.preventDefaultOnEscape ?? true;
		this.backNavigation = config.backNavigation?.enabled ? config.backNavigation : void 0;
		this.boundKeydown = (event) => {
			this.handleKeydown(event);
		};
		this.boundPopState = () => {
			this.handlePopState();
		};
		this.boundMouseSideButton = (event) => {
			this.handleMouseSideButton(event);
		};
		if ((config.syncReducedMotion ?? true) && this.target?.matchMedia) {
			const targetRef = this.target;
			this.stack.setReducedMotionProvider(() => targetRef.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false);
		}
		this.attachListeners();
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		if (!this.target) return;
		this.target.removeEventListener("keydown", this.boundKeydown);
		if (this.backNavigation) {
			this.target.removeEventListener("popstate", this.boundPopState);
			if (this.backNavigation.blockMouseSideButtons !== false) {
				this.target.removeEventListener("mouseup", this.boundMouseSideButton);
				this.target.removeEventListener("auxclick", this.boundMouseSideButton);
			}
		}
	}
	attachListeners() {
		if (!this.target) return;
		this.target.addEventListener("keydown", this.boundKeydown);
		if (!this.backNavigation) return;
		this.pushHistoryTrap();
		this.target.addEventListener("popstate", this.boundPopState);
		if (this.backNavigation.blockMouseSideButtons !== false) {
			this.target.addEventListener("mouseup", this.boundMouseSideButton);
			this.target.addEventListener("auxclick", this.boundMouseSideButton);
		}
	}
	pushHistoryTrap() {
		if (!this.target?.history || !this.backNavigation) return;
		const guardKey = this.backNavigation.guardStateKey ?? DEFAULT_HISTORY_GUARD_KEY;
		const currentHref = this.target.location?.href ?? "";
		this.target.history.pushState({ [guardKey]: true }, "", currentHref);
	}
	handleKeydown(event) {
		if (event.defaultPrevented || event.isComposing) return;
		if (event.key === "Escape") {
			if (this.stack.getSnapshot().activeTop !== null) {
				if (this.preventDefaultOnEscape) event.preventDefault();
				this.stack.closeTop("escape");
			}
			return;
		}
		if (this.backNavigation && shouldBlockHistoryKeyboardShortcut(event, this.backNavigation)) event.preventDefault();
	}
	handlePopState() {
		if (!this.backNavigation) return;
		this.pushHistoryTrap();
		if (this.backNavigation.onBeforePopStateDismiss?.()) return;
		if (this.stack.getSnapshot().activeTop !== null) this.stack.closeTop("back-navigation");
	}
	handleMouseSideButton(event) {
		if (event.button === MOUSE_BACK_BUTTON || event.button === MOUSE_FORWARD_BUTTON) event.preventDefault();
	}
};
export { ModalDomController, createBackdropPointerGuard, isEditableEventTarget };
