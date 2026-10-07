/**
 * packages/auditor/src/core/terminalVisuals.ts
 *
 * Terminal monospace display width calculation, visual padding, and visual truncation
 * supporting ANSI escapes, wide emojis, and single-width glyphs.
 */
/**
 * Calculates the visual monospace terminal display width of a string,
 * correctly handling ANSI escapes, wide emojis (❌, ✅, ⚠️, ℹ️), and single-width glyphs (…).
 */
export declare function getVisualWidth(str: string): number;
export declare const TEXT_ALIGNMENTS: readonly ["left", "right", "center"];
export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];
export declare function padVisual(str: string, targetWidth: number, align?: TextAlignment): string;
export declare function truncateVisual(str: string, maxWidth: number): string;
//# sourceMappingURL=terminalVisuals.d.ts.map