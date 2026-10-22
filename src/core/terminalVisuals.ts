/**
 * packages/auditor/src/core/terminalVisuals.ts
 *
 * Terminal monospace display width calculation, visual padding, and visual truncation
 * supporting ANSI escapes, wide emojis, and single-width glyphs.
 */

import stringWidth from 'string-width';

export { default as stringWidth } from 'string-width';

export const TEXT_ALIGNMENTS = ['left', 'right', 'center'] as const;
export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];

export function padVisual(str: string, targetWidth: number, align: TextAlignment = 'left'): string {
  const currentWidth = stringWidth(str);
  const diff = targetWidth - currentWidth;
  if (diff <= 0) return str;
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

export function truncateVisual(str: string, maxWidth: number): string {
  if (stringWidth(str) <= maxWidth) return str;
  let result = '';
  const ellipsis = '…';
  const target = maxWidth - 1;
  for (const char of str) {
    if (stringWidth(result + char) > target) break;
    result += char;
  }
  return result + ellipsis;
}
