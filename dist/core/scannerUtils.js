/**
 * packages/auditor/src/core/scannerUtils.ts
 *
 * Lightweight lexical scanning utilities for advancing past strings, comments, and balanced delimiters.
 */
/**
 * Advances the index past a string literal ('...', "...", `...`) or a comment (//..., /*...*\/).
 * Returns the index immediately following the string or comment, or the original index if not at one.
 */
export function advancePastStringOrComment(content, index, limit) {
    const ch = content[index];
    if (ch === "'" || ch === '"' || ch === '`') {
        const quote = ch;
        let i = index + 1;
        while (i < limit) {
            if (content[i] === '\\') {
                i += 2;
                continue;
            }
            if (content[i] === quote) {
                return i + 1;
            }
            i++;
        }
        return i;
    }
    if (ch === '/' && content[index + 1] === '/') {
        let i = index + 2;
        while (i < limit && content[i] !== '\n') {
            i++;
        }
        return i;
    }
    if (ch === '/' && content[index + 1] === '*') {
        let i = index + 2;
        while (i < limit && !(content[i] === '*' && content[i + 1] === '/')) {
            i++;
        }
        return Math.min(limit, i + 2);
    }
    return index;
}
function scanBalancedDelimiter(content, startIndex, limit, initialDepth, openChar, closeChar, stopPrefix) {
    let depth = initialDepth;
    let i = startIndex;
    while (i < limit && depth > 0) {
        if (stopPrefix && content[i] === stopPrefix[0] && content.startsWith(stopPrefix, i)) {
            break;
        }
        const skipped = advancePastStringOrComment(content, i, limit);
        if (skipped !== i) {
            i = skipped;
            continue;
        }
        const ch = content[i];
        if (ch === openChar) {
            depth++;
        }
        else if (ch === closeChar) {
            depth--;
            if (depth === 0) {
                return { end: i + 1, depth: 0 };
            }
        }
        i++;
    }
    return { end: i, depth };
}
/**
 * Scans content starting from `startIndex` up to `limit` tracking `{` and `}` depth,
 * skipping comments and string literals.
 */
export function scanBalancedBraces(content, startIndex, limit = content.length, initialDepth = 1, stopPrefix) {
    return scanBalancedDelimiter(content, startIndex, limit, initialDepth, '{', '}', stopPrefix);
}
/**
 * Scans content starting from `startIndex` up to `limit` tracking `(` and `)` depth,
 * skipping comments and string literals.
 */
export function scanBalancedParens(content, startIndex, limit = content.length, initialDepth = 1, stopPrefix) {
    return scanBalancedDelimiter(content, startIndex, limit, initialDepth, '(', ')', stopPrefix);
}
function scanStringLiteral(content, start, limit, stripStrings) {
    const quote = content[start] ?? '';
    let output = quote;
    let i = start + 1;
    if (stripStrings)
        output += quote;
    while (i < limit) {
        const c = content[i];
        if (c === undefined)
            break;
        if (c === '\\') {
            if (!stripStrings)
                output += '\\' + (content[i + 1] ?? '');
            i += 2;
            continue;
        }
        if (c === quote) {
            if (!stripStrings)
                output += quote;
            i++;
            break;
        }
        if (c === '\n' && stripStrings) {
            output += '\n';
        }
        else if (!stripStrings) {
            output += c;
        }
        i++;
    }
    return { output, nextIndex: i };
}
function scanComment(content, start, limit) {
    const nextChar = content[start + 1];
    if (nextChar === '/') {
        let i = start + 2;
        while (i < limit && content[i] !== '\n') {
            i++;
        }
        return { output: '', nextIndex: i };
    }
    if (nextChar === '*') {
        let i = start + 2;
        let output = '';
        while (i < limit && !(content[i] === '*' && content[i + 1] === '/')) {
            if (content[i] === '\n') {
                output += '\n';
            }
            i++;
        }
        if (i < limit) {
            i += 2;
        }
        return { output, nextIndex: i };
    }
    return { output: content[start] ?? '', nextIndex: start + 1 };
}
function stripCodeTokens(content, stripStrings) {
    let result = '';
    let i = 0;
    const limit = content.length;
    while (i < limit) {
        const ch = content[i];
        if (ch === "'" || ch === '"' || ch === '`') {
            const res = scanStringLiteral(content, i, limit, stripStrings);
            result += res.output;
            i = res.nextIndex;
        }
        else if (ch === '/' && (content[i + 1] === '/' || content[i + 1] === '*')) {
            const res = scanComment(content, i, limit);
            result += res.output;
            i = res.nextIndex;
        }
        else {
            result += ch;
            i++;
        }
    }
    return result;
}
/**
 * Strips line (//...) and block (/*...*\/) comments from code,
 * preserving string literals ('...', "...", `...`).
 * Preserves newlines within block comments so line numbers remain aligned.
 */
export function stripComments(content) {
    return stripCodeTokens(content, false);
}
/**
 * Strips comments and replaces string literal contents with empty strings,
 * leaving only syntax structure.
 */
export function stripCommentsAndStrings(content) {
    return stripCodeTokens(content, true);
}
export const DEFAULT_FUNCTION_PARAMS_MAX_DISTANCE = 600;
/**
 * Backwards lexical check determining if a position in content is inside function parameter parentheses.
 */
export function isPositionInsideFunctionParams(content, position, maxDistance = DEFAULT_FUNCTION_PARAMS_MAX_DISTANCE) {
    let i = position - 1;
    let pDepth = 0;
    let bDepth = 0;
    const limit = Math.max(0, position - maxDistance);
    while (i >= limit) {
        const ch = content[i];
        if (ch === ')')
            pDepth++;
        else if (ch === '(') {
            if (pDepth > 0)
                pDepth--;
            else
                return bDepth === 0;
        }
        else if (ch === '}')
            bDepth++;
        else if (ch === '{') {
            if (bDepth > 0)
                bDepth--;
            else
                return false;
        }
        i--;
    }
    return false;
}
export const DEFAULT_COMMENT_LOOKBACK_LINES = 10;
/**
 * Checks if the current line or any preceding lines contain a comment matching `directiveRegex`.
 * Useful for multiline constructs in TypeScript or Vue SFC templates where a directive or suppression
 * comment (e.g. `<!-- ui-branching-ok: ... -->` or `// layout-ok: ...`) is placed above a multiline tag.
 *
 * @param lines Array of code lines.
 * @param lineIndex 0-indexed line number of the target statement or tag.
 * @param directiveRegex Regular expression to match against comment lines.
 * @param options Lookback configuration (default: 10 lines, ignoring empty lines).
 */
export function hasPrecedingComment(lines, lineIndex, directiveRegex, options) {
    if (lineIndex < 0 || lineIndex >= lines.length) {
        return false;
    }
    const currentLine = lines[lineIndex];
    if (currentLine && directiveRegex.test(currentLine)) {
        return true;
    }
    const maxLookback = options?.maxLookbackLines ?? DEFAULT_COMMENT_LOOKBACK_LINES;
    const ignoreEmpty = options?.ignoreEmptyLines ?? true;
    let inspectedNonEmpty = 0;
    for (let i = lineIndex - 1; i >= 0 && inspectedNonEmpty < maxLookback; i--) {
        const line = lines[i];
        if (line === undefined)
            break;
        const trimmed = line.trim();
        if (trimmed.length === 0) {
            if (ignoreEmpty) {
                continue;
            }
            break;
        }
        if (directiveRegex.test(line)) {
            return true;
        }
        inspectedNonEmpty++;
    }
    return false;
}
/**
 * Convenience wrapper for inspecting preceding line comments or inline directives.
 * Typically used in Vue SFC templates and multiline TypeScript expressions where
 * directives or escape hatches are placed on preceding lines.
 *
 * @param lines Array of code lines.
 * @param targetLine 0-indexed line number of the target statement or tag.
 * @param suppressionRegex Regular expression to match against comment lines.
 * @param lookbackLines Maximum number of non-empty lines to inspect backwards (default: 3).
 */
export function hasLineSuppression(lines, targetLine, suppressionRegex, lookbackLines = 3) {
    return hasPrecedingComment(lines, targetLine, suppressionRegex, { maxLookbackLines: lookbackLines });
}
//# sourceMappingURL=scannerUtils.js.map