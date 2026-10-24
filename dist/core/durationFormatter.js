// src/core/durationFormatter.ts
/**
* packages/auditor/src/core/durationFormatter.ts
*
* Universal duration and number formatting using native ECMAScript Intl.NumberFormat.
* Standardizes Spanish thousands separators (dots), decimal commas, and space before 'ms'.
*/
const DURATION_PAD_LENGTH = 10;
const nativeNumberFormatter = new Intl.NumberFormat("es-AR", {
	useGrouping: "always",
	maximumFractionDigits: 1
});
/**
* Formats a number with standard Spanish thousands separators (dots) and decimal comma.
* Uses native ECMAScript Intl.NumberFormat.
* Examples: 0 -> '0', 450 -> '450', 1240 -> '1.240', 56814 -> '56.814', 53510.5 -> '53.510,5'
*/
function formatNumber(num) {
	if (!Number.isFinite(num)) return String(num);
	return nativeNumberFormatter.format(num);
}
const MIN_CANONICAL_DURATION_MS = .05;
/**
* Formats duration in milliseconds with Spanish thousands separators, optional decimal comma,
* and a standard whitespace before 'ms'.
* Examples: 450 -> '450 ms', 2140 -> '2.140 ms', 56814 -> '56.814 ms', 53510.5 -> '53.510,5 ms'
*/
function formatDurationMs(ms) {
	if (ms > 0 && ms < .05) return "<0,1 ms";
	return `${formatNumber(ms)} ms`;
}
function formatDuration(ms) {
	return formatDurationMs(ms).padStart(10);
}
export { DURATION_PAD_LENGTH, MIN_CANONICAL_DURATION_MS, formatDuration, formatDurationMs, formatNumber };
