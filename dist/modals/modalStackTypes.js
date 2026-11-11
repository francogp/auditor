// src/modals/modalStackTypes.ts
const MODAL_PHASES = [
	"opening",
	"open",
	"closing"
];
const MODAL_DISMISS_MODES = [
	"any",
	"closerequest",
	"none"
];
const MODAL_CLOSE_REASONS = [
	"escape",
	"backdrop",
	"close-button",
	"programmatic",
	"back-navigation",
	"replace",
	"clear-all"
];
const MODAL_SINGLETON_POLICIES = [
	"allow-multiple",
	"focus-existing",
	"replace-existing",
	"ignore-new"
];
const MODAL_LIFECYCLE_EVENTS = [
	"open-start",
	"open-end",
	"close-start",
	"close-end",
	"close-prevented",
	"reordered",
	"stack-empty"
];
export { MODAL_CLOSE_REASONS, MODAL_DISMISS_MODES, MODAL_LIFECYCLE_EVENTS, MODAL_PHASES, MODAL_SINGLETON_POLICIES };
