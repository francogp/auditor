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
export declare const CANONICAL_Z_LAYERS: Readonly<{
  readonly BASE: 0;
  readonly LOW: 50;
  readonly CONTENT: 100;
  readonly HEADER: 500;
  readonly SIDEBAR: 800;
  readonly HUD: 1000;
  readonly NAVIGATION: 5000;
  readonly DROPDOWN: 7000;
  readonly OVERLAY: 10000;
  readonly MODAL: 11000;
  readonly MODAL_STEP: 10;
  readonly TOOLTIP: 15000;
  readonly TOAST: 20000;
  readonly MAX: 100000;
  readonly CRITICAL: 999999;
}>;
export type CanonicalZLayerKey = keyof typeof CANONICAL_Z_LAYERS;
export type ModalZLayerScale = Readonly<Record<CanonicalZLayerKey, number>>;
export type CustomModalZLayers = Readonly<Partial<Record<CanonicalZLayerKey, number>>>;
export type ModalZLayerOverrides<TOverrides> = { readonly [K in keyof TOverrides]: K extends CanonicalZLayerKey ? number | undefined : number; };
/**
 * Merges consumer-provided Z-Layer overrides (including custom domain keys such
 * as `MAP_FLOOR` or `MAP_SPAWNS`) onto `CANONICAL_Z_LAYERS` without mutating
 * the canonical defaults.
 */
export declare function resolveModalZLayers(): ModalZLayerScale;
export declare function resolveModalZLayers<const TOverrides extends ModalZLayerOverrides<TOverrides>>(overrides: TOverrides): Readonly<ModalZLayerScale & { readonly [K in keyof TOverrides]: number; }>;
export declare function resolveModalZLayers(overrides?: CustomModalZLayers): ModalZLayerScale;
export declare const MODAL_CSS_VAR_NAMES: readonly ["--modal-z", "--modal-backdrop-z", "--modal-content-z"];
export type ModalCssVarName = (typeof MODAL_CSS_VAR_NAMES)[number];
export type ModalCssVars = Readonly<Record<ModalCssVarName, string>>;
export type CustomModalCssVarName = `--${string}-z` | `--${string}-backdrop-z` | `--${string}-content-z`;
export type CustomModalCssVars = Readonly<Partial<Record<CustomModalCssVarName, string>>>;
export interface ModalCssVarsOptions {
  /**
   * Custom CSS custom property prefix (default: `'--modal'`).
   * Produces `${prefix}-z`, `${prefix}-backdrop-z`, and `${prefix}-content-z`.
   */
  readonly prefix?: string;
}
export interface ModalLayerValues {
  readonly zIndex: number;
  readonly backdropZIndex: number;
  readonly contentZIndex: number;
}
export interface ModalDomIds {
  readonly modalId: string;
  readonly titleId: string;
  readonly bodyId: string;
  readonly closeButtonId: string;
}
/**
 * Converts computed modal numeric layers into CSS custom properties so
 * stylesheets consume `var(--modal-z, var(--z-modal))` (or custom tokens)
 * without hardcoded numeric z-index literals.
 */
export declare function resolveModalCssVars(layers: ModalLayerValues): ModalCssVars;
export declare function resolveModalCssVars(layers: ModalLayerValues, options?: ModalCssVarsOptions): CustomModalCssVars;
/**
 * Resolves deterministic accessible DOM element IDs for a modal card,
 * its ARIA title/body labels, and its close control (`${baseId}-close-btn`).
 */
export declare function resolveModalDomIds(baseId: string): ModalDomIds;