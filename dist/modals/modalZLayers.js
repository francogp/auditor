// src/modals/modalZLayers.ts
/**
* src/modals/modalZLayers.ts
*
* Default customizable browser-safe Z-Layers scale, CSS custom property bridge,
* and W3C ARIA deterministic DOM identifier generator for modal stacks.
* Zero Node.js or framework runtime dependencies.
*/
/**
* Canonical default Z-Layers scale. Acts strictly as the overridable default;
* consumers may supply custom scales via `resolveModalZLayers(customZLayers)`
* or `createModalStack({ zLayers, baseZIndex, stepZIndex, ceilingZIndex })`.
*/
const CANONICAL_Z_LAYERS = Object.freeze({
	BASE: 0,
	LOW: 50,
	CONTENT: 100,
	HEADER: 500,
	SIDEBAR: 800,
	HUD: 1e3,
	NAVIGATION: 5e3,
	DROPDOWN: 7e3,
	OVERLAY: 1e4,
	MODAL: 11e3,
	MODAL_STEP: 10,
	TOOLTIP: 15e3,
	TOAST: 2e4,
	MAX: 1e5,
	CRITICAL: 999999
});
function resolveModalZLayers(overrides) {
	if (!overrides) return CANONICAL_Z_LAYERS;
	const definedEntries = Object.entries(overrides).filter((entry) => typeof entry[1] === "number" && Number.isFinite(entry[1]));
	if (definedEntries.length === 0) return CANONICAL_Z_LAYERS;
	return Object.freeze({
		...CANONICAL_Z_LAYERS,
		...Object.fromEntries(definedEntries)
	});
}
const MODAL_CSS_VAR_NAMES = [
	"--modal-z",
	"--modal-backdrop-z",
	"--modal-content-z"
];
const DEFAULT_CSS_VAR_NAMESPACE = "modal";
function resolveModalCssVars(layers, options) {
	const rawPrefix = options?.prefix?.trim();
	const prefix = `--${rawPrefix && rawPrefix.length > 0 ? rawPrefix.startsWith("--") ? rawPrefix.slice(2) : rawPrefix : DEFAULT_CSS_VAR_NAMESPACE}`;
	const result = {
		[`${prefix}-z`]: String(layers.zIndex),
		[`${prefix}-backdrop-z`]: String(layers.backdropZIndex),
		[`${prefix}-content-z`]: String(layers.contentZIndex)
	};
	return Object.freeze(result);
}
/**
* Resolves deterministic accessible DOM element IDs for a modal card,
* its ARIA title/body labels, and its close control (`${baseId}-close-btn`).
*/
function resolveModalDomIds(baseId) {
	const normalized = baseId.trim();
	if (normalized.length === 0) throw new Error("resolveModalDomIds requires a non-empty baseId");
	return Object.freeze({
		modalId: normalized,
		titleId: `${normalized}-title`,
		bodyId: `${normalized}-body`,
		closeButtonId: `${normalized}-close-btn`
	});
}
export { CANONICAL_Z_LAYERS, MODAL_CSS_VAR_NAMES, resolveModalCssVars, resolveModalDomIds, resolveModalZLayers };
