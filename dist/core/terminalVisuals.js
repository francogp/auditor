import stringWidth from "string-width";
//#region src/core/terminalVisuals.ts
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
function getVisualWidth(str) {
	return stringWidth(str);
}
const TEXT_ALIGNMENTS = [
	"left",
	"right",
	"center"
];
function padVisual(str, targetWidth, align = "left") {
	const diff = targetWidth - getVisualWidth(str);
	if (diff <= 0) return str;
	if (align === "right") return " ".repeat(diff) + str;
	if (align === "center") {
		const leftPad = Math.floor(diff / 2);
		const rightPad = diff - leftPad;
		return " ".repeat(leftPad) + str + " ".repeat(rightPad);
	}
	return str + " ".repeat(diff);
}
function truncateVisual(str, maxWidth) {
	if (getVisualWidth(str) <= maxWidth) return str;
	let result = "";
	const ellipsis = "…";
	const target = maxWidth - 1;
	for (const char of str) {
		if (getVisualWidth(result + char) > target) break;
		result += char;
	}
	return result + ellipsis;
}
//#endregion
export { TEXT_ALIGNMENTS, getVisualWidth, padVisual, truncateVisual };
