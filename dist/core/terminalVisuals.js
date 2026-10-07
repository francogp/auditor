/**
 * packages/auditor/src/core/terminalVisuals.ts
 *
 * Terminal monospace display width calculation, visual padding, and visual truncation
 * supporting ANSI escapes, wide emojis, and single-width glyphs.
 */
import { stripVTControlCharacters } from 'node:util';
/**
 * Calculates the visual monospace terminal display width of a string,
 * correctly handling ANSI escapes, wide emojis (❌, ✅, ⚠️, ℹ️), and single-width glyphs (…).
 */
export function getVisualWidth(str) {
    const clean = stripVTControlCharacters(str);
    let width = 0;
    for (const char of clean) {
        const cp = char.codePointAt(0) ?? 0;
        if (cp === 0xfe0f || cp === 0xfe0e)
            continue;
        if ((cp >= 0x2600 && cp <= 0x27bf) ||
            cp === 0x2139 ||
            (cp >= 0x1f300 && cp <= 0x1f9ff)) {
            width += 2;
        }
        else {
            width += 1;
        }
    }
    return width;
}
export const TEXT_ALIGNMENTS = ['left', 'right', 'center'];
export function padVisual(str, targetWidth, align = 'left') {
    const currentWidth = getVisualWidth(str);
    const diff = targetWidth - currentWidth;
    if (diff <= 0)
        return str;
    if (align === 'right') {
        return ' '.repeat(diff) + str;
    }
    if (align === 'center') {
        const leftPad = Math.floor(diff / 2);
        const rightPad = diff - leftPad;
        return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
    }
    return str + ' '.repeat(diff);
}
export function truncateVisual(str, maxWidth) {
    if (getVisualWidth(str) <= maxWidth)
        return str;
    let result = '';
    const ellipsis = '…';
    const target = maxWidth - 1;
    for (const char of str) {
        if (getVisualWidth(result + char) > target)
            break;
        result += char;
    }
    return result + ellipsis;
}
//# sourceMappingURL=terminalVisuals.js.map