//#region src/core/durationFormatter.d.ts
/**
 * packages/auditor/src/core/durationFormatter.ts
 *
 * Universal duration and number formatting using native ECMAScript Intl.NumberFormat.
 * Standardizes Spanish thousands separators (dots), decimal commas, and space before 'ms'.
 */
export declare const DURATION_PAD_LENGTH = 10;
/**
 * Formats a number with standard Spanish thousands separators (dots) and decimal comma.
 * Uses native ECMAScript Intl.NumberFormat.
 * Examples: 0 -> '0', 450 -> '450', 1240 -> '1.240', 56814 -> '56.814', 53510.5 -> '53.510,5'
 */
export declare function formatNumber(num: number): string;
export declare const MIN_CANONICAL_DURATION_MS = 0.05;
/**
 * Formats duration in milliseconds with Spanish thousands separators, optional decimal comma,
 * and a standard whitespace before 'ms'.
 * Examples: 450 -> '450 ms', 2140 -> '2.140 ms', 56814 -> '56.814 ms', 53510.5 -> '53.510,5 ms'
 */
export declare function formatDurationMs(ms: number): string;
export declare function formatDuration(ms: number): string;
//#endregion