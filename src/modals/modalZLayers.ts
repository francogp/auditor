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
export const CANONICAL_Z_LAYERS = Object.freeze({
  BASE: 0,
  LOW: 50,
  CONTENT: 100,
  HEADER: 500,
  SIDEBAR: 800,
  HUD: 1000,
  NAVIGATION: 5000,
  DROPDOWN: 7000,
  OVERLAY: 10000,
  MODAL: 11000,
  MODAL_STEP: 10,
  TOOLTIP: 15000,
  TOAST: 20000,
  MAX: 100000,
  CRITICAL: 999999
} as const);

export type CanonicalZLayerKey = keyof typeof CANONICAL_Z_LAYERS;

export type ModalZLayerScale = Readonly<Record<CanonicalZLayerKey, number>>;

export type CustomModalZLayers = Readonly<Partial<Record<CanonicalZLayerKey, number>>>;

/**
 * Merges consumer-provided Z-Layer overrides onto `CANONICAL_Z_LAYERS`
 * without mutating the canonical defaults.
 */
export function resolveModalZLayers(overrides?: CustomModalZLayers): ModalZLayerScale {
  if (!overrides) {
    return CANONICAL_Z_LAYERS;
  }
  return Object.freeze({
    ...CANONICAL_Z_LAYERS,
    ...overrides
  });
}

export const MODAL_CSS_VAR_NAMES = [
  '--modal-z',
  '--modal-backdrop-z',
  '--modal-content-z'
] as const;

export type ModalCssVarName = (typeof MODAL_CSS_VAR_NAMES)[number];

export type ModalCssVars = Readonly<Record<ModalCssVarName, string>>;

export type CustomModalCssVarName =
  | `--${string}-z`
  | `--${string}-backdrop-z`
  | `--${string}-content-z`;

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

const DEFAULT_CSS_VAR_NAMESPACE = 'modal';

/**
 * Converts computed modal numeric layers into CSS custom properties so
 * stylesheets consume `var(--modal-z, var(--z-modal))` (or custom tokens)
 * without hardcoded numeric z-index literals.
 */
export function resolveModalCssVars(layers: ModalLayerValues): ModalCssVars;
export function resolveModalCssVars(
  layers: ModalLayerValues,
  options?: ModalCssVarsOptions
): CustomModalCssVars;
export function resolveModalCssVars(
  layers: ModalLayerValues,
  options?: ModalCssVarsOptions
): CustomModalCssVars {
  const rawPrefix = options?.prefix?.trim();
  const namespace =
    rawPrefix && rawPrefix.length > 0
      ? rawPrefix.startsWith('--')
        ? rawPrefix.slice(2)
        : rawPrefix
      : DEFAULT_CSS_VAR_NAMESPACE;
  const prefix: `--${string}` = `--${namespace}`;

  const result: Partial<Record<CustomModalCssVarName, string>> = {
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
export function resolveModalDomIds(baseId: string): ModalDomIds {
  const normalized = baseId.trim();
  if (normalized.length === 0) {
    throw new Error('resolveModalDomIds requires a non-empty baseId');
  }
  return Object.freeze({
    modalId: normalized,
    titleId: `${normalized}-title`,
    bodyId: `${normalized}-body`,
    closeButtonId: `${normalized}-close-btn`
  });
}
