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
//# sourceMappingURL=scannerUtils.js.map