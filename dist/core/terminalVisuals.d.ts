import stringWidth from "string-width";
export declare const TEXT_ALIGNMENTS: readonly ["left", "right", "center"];
export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];
export declare function padVisual(str: string, targetWidth: number, align?: TextAlignment): string;
export declare function truncateVisual(str: string, maxWidth: number): string;
export { stringWidth };