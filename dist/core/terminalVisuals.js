import stringWidth, { default as stringWidth$1 } from "string-width";
//#region src/core/terminalVisuals.ts
/**
* packages/auditor/src/core/terminalVisuals.ts
*
* Terminal monospace display width calculation, visual padding, and visual truncation
* supporting ANSI escapes, wide emojis, and single-width glyphs.
*/
const TEXT_ALIGNMENTS = [
	"left",
	"right",
	"center"
];
function padVisual(str, targetWidth, align = "left") {
	const diff = targetWidth - stringWidth$1(str);
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
	if (stringWidth$1(str) <= maxWidth) return str;
	let result = "";
	const ellipsis = "…";
	const target = maxWidth - 1;
	for (const char of str) {
		if (stringWidth$1(result + char) > target) break;
		result += char;
	}
	return result + ellipsis;
}
//#endregion
export { TEXT_ALIGNMENTS, padVisual, stringWidth, truncateVisual };
