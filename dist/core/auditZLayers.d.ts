/**
 * packages/auditor/src/core/auditZLayers.ts
 *
 * Z-Layers resolution helpers, TypeScript parser, and canonical default layer map.
 */
/**
 * Resolves the primary SCSS file path for Z-Layers from config or stylesRoots.
 */
export declare function resolveZLayersScssPath(projectRoot?: string): string | undefined;
/**
 * Canonical fallback Z-Layers scale matching framework standards.
 */
export declare const Z_LAYERS: Readonly<Record<string, number>>;
/**
 * Resolves the effective Z-Layers dictionary from config.styles.zLayers,
 * or by parsing the TypeScript file defined in config.styles.zLayersTsFile or config.domain.zLayersFile,
 * or falls back to the default Z_LAYERS.
 */
export declare function getEffectiveZLayers(projectRoot?: string): Record<string, number>;
//# sourceMappingURL=auditZLayers.d.ts.map