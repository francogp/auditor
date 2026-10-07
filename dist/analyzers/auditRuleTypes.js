/**
 * packages/auditor/src/analyzers/auditRuleTypes.ts
 *
 * Core rule descriptors, violation schemas, and matching primitives
 * for architectural audits.
 */
export const AUDIT_SEVERITIES = ['error', 'warning'];
function collectRuleTokens(descriptor) {
    const tokens = [];
    if (descriptor.id)
        tokens.push(descriptor.id.toLowerCase()); // string-ok: Case-insensitive token lookup
    if (descriptor.name)
        tokens.push(descriptor.name.toLowerCase()); // string-ok: Case-insensitive token lookup
    if (descriptor.category)
        tokens.push(descriptor.category.toLowerCase()); // string-ok: Case-insensitive token lookup
    if (descriptor.aliases) {
        for (const a of descriptor.aliases) {
            if (a)
                tokens.push(a.toLowerCase()); // string-ok: Case-insensitive token lookup
        }
    }
    return tokens;
}
export function matchesRule(descriptor, selectedRules) {
    if (selectedRules.size === 0)
        return true;
    const tokens = collectRuleTokens(descriptor);
    for (const selected of selectedRules) {
        for (const t of tokens) {
            if (t === selected || t.includes(selected) || selected.includes(t)) {
                return true;
            }
        }
    }
    return false;
}
export function normalizeFilePath(filePath) {
    return filePath.replace(/^[a-z]:[/\\]/i, '').replace(/\\/g, '/').toLowerCase();
}
export function getLineAtMatch(content, matchIndex) {
    const lineStartPos = content.lastIndexOf('\n', matchIndex - 1) + 1;
    const lineEndPos = content.indexOf('\n', matchIndex);
    const line = lineEndPos === -1 ? content.slice(lineStartPos) : content.slice(lineStartPos, lineEndPos);
    return { line, lineStartPos, lineEndPos, trimmed: line.trim() };
}
export function isCommentLine(trimmed) {
    return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}
export function isTestOrNodeModules(filePath) {
    if (!filePath)
        return true;
    const norm = normalizeFilePath(filePath);
    return norm.includes('node_modules') || norm.includes('.spec.') || norm.includes('.test.');
}
//# sourceMappingURL=auditRuleTypes.js.map