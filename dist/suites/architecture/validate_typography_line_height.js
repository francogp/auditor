/**
 * scripts/auditors/architecture/validate_typography_line_height.ts
 *
 * TYPOGRAPHY LINE-HEIGHT & INTERLINEAR SPACING AUDITOR (Node.js 26+ Native)
 *
 * Enforces safe multiline line-height across design system typography:
 *   Anti-Zero Line-Height (`line-height-overlap`): Detects text classes, headings, titles,
 *   descriptions, and multiline labels that declare 'line-height: 1' or 'line-height: 0'.
 *   Fonts with line-height <= 1 collide and overlap vertically when text wraps.
 *
 * Escape Hatch:
 *   // line-height-ok or /* line-height-ok *\/ disables the check for intentional fixtures.
 *
 * Usage:
 *   npm run validate:line-height
 */
import { enableCompileCache } from 'node:module';
import { FileScanAuditor, BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
enableCompileCache();
export const TYPOGRAPHY_LINE_HEIGHT_RULES = [
    'line-height-overlap'
];
const ICON_ELEMENT_REGEX = /(?:^|[._-])(?:emoji|icon|arrow|bullet|symbol|glyph|avatar|medal|quote|mark|placeholder|checkmark|star|indicator|infinity|dash|tooltip-wrapper|fx-wrapper|clear|close|dismiss)(?:$|[._-])|(?<![a-zA-Z0-9_-])(?:img|svg|canvas)\b/i;
const TEXT_ELEMENT_REGEX = /(?:^|[._-])(?:title|heading|header|caption|desc|description|sub|subtitle|dialogue|name|label|text|body|wrap|item|card|accordion|content|h[1-6]|paragraph|note|message|banner|alert|prompt|phrase|comment|summary|reason|metric|pill|tag)(?:$|[._-])/i;
function extractStyleBlocks(filePath, fileContent) {
    if (filePath.endsWith('.scss') || filePath.endsWith('.css')) {
        return [{ content: fileContent, startLine: 1 }];
    }
    const blocks = [];
    const styleTagRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
    let match;
    while ((match = styleTagRegex.exec(fileContent)) !== null) {
        const preContent = fileContent.slice(0, match.index);
        const startLine = preContent.split('\n').length;
        blocks.push({
            content: match[1] || '',
            startLine
        });
    }
    return blocks;
}
function getLeafSelector(fullSelector) {
    const segments = fullSelector.split(/[\s>+~]/).map(s => s.trim()).filter(Boolean);
    const last = segments[segments.length - 1] || fullSelector;
    return last.replace(/::?[a-zA-Z0-9_-]+(\([^)]*\))?/g, '').trim();
}
function isEmojiFontContext(lines, currentIndex) {
    const start = Math.max(0, currentIndex - 6);
    const end = Math.min(lines.length - 1, currentIndex + 6);
    for (let idx = start; idx <= end; idx++) {
        const l = lines[idx] || '';
        if (/font-family\s*:\s*.*(?:Emoji|Apple Color Emoji|Segoe UI Emoji|Noto Color Emoji)/i.test(l)) {
            return true;
        }
    }
    return false;
}
function updateSelectorStack(trimmed, lineIgnored, selectorStack) {
    if (trimmed.includes('{')) {
        const selectorPart = trimmed.slice(0, trimmed.indexOf('{')).trim();
        if (selectorPart) {
            selectorStack.push({ selector: selectorPart, isIgnored: lineIgnored });
        }
    }
    const currentFrame = selectorStack[selectorStack.length - 1];
    if (currentFrame && lineIgnored) {
        currentFrame.isIgnored = true;
    }
}
function popSelectorStack(trimmed, selectorStack) {
    if (trimmed.includes('}')) {
        const closeCount = (trimmed.match(/\}/g) || []).length;
        for (let c = 0; c < closeCount; c++) {
            selectorStack.pop();
        }
    }
}
function isLineHeightOverlapCandidate(trimmed, lineIgnored, selectorStack) {
    const currentFrame = selectorStack[selectorStack.length - 1];
    if (lineIgnored || (currentFrame && currentFrame.isIgnored)) {
        return null;
    }
    return trimmed.match(/\bline-height\s*:\s*(0|1|0px|1px|1em|1rem)\s*(?:!important)?\s*;/i);
}
function isTextSelectorCandidate(currentSelector, leafSelector) {
    return TEXT_ELEMENT_REGEX.test(leafSelector) || currentSelector.includes('&__') || currentSelector.includes('.text');
}
export class TypographyLineHeightAuditor extends FileScanAuditor {
    totalRulesChecked = 0;
    constructor(roots, projectRoot) {
        const config = getAuditConfig(projectRoot);
        const effectiveRoots = roots ?? config.paths?.srcRoots ?? ['src'];
        super({
            id: 'validate_typography_line_height',
            name: 'Typography Line-Height & Interlinear Spacing Validator',
            description: 'Detecta colisiones de line-height en tipografías multilínea',
            family: 'architecture',
            ruleIds: TYPOGRAPHY_LINE_HEIGHT_RULES,
            packageName: 'Tipografía',
            ruleDescriptions: {
                'line-height-overlap': 'Colisión de line-height'
            },
            roots: effectiveRoots,
            allowedExtensions: new Set(['.vue', '.scss', '.css']),
            projectRoot
        });
    }
    checkBlockLine(blockLines, lineIndex, blockStartLine, relPath, selectorStack) {
        const line = blockLines[lineIndex];
        if (!line)
            return;
        const trimmed = line.trim();
        const lineIgnored = this.isLineIgnored(line, ['line-height-ok', 'css-ok']) ||
            line.includes('/* line-height-ok */') ||
            line.includes('// line-height-ok');
        updateSelectorStack(trimmed, lineIgnored, selectorStack);
        const lineHeightMatch = isLineHeightOverlapCandidate(trimmed, lineIgnored, selectorStack);
        if (lineHeightMatch) {
            this.totalRulesChecked++;
            const currentSelector = selectorStack.map(f => f.selector).join(' ') || '(global scope)';
            const leafSelector = getLeafSelector(currentSelector);
            if (!ICON_ELEMENT_REGEX.test(leafSelector) && !isEmojiFontContext(blockLines, lineIndex)) {
                if (isTextSelectorCandidate(currentSelector, leafSelector)) {
                    this.addViolation({
                        ruleId: 'line-height-overlap',
                        severity: 'error',
                        file: relPath,
                        line: blockStartLine + lineIndex,
                        message: `Dangerous '${lineHeightMatch[0]}' on text selector '${currentSelector}'. Fonts overlap when text wraps. Use 'line-height: 1.2' to '1.5' or $lh-normal.`,
                        context: trimmed
                    });
                }
            }
        }
        popSelectorStack(trimmed, selectorStack);
    }
    scanFile(relPath, content) {
        const config = getAuditConfig(this.projectRoot);
        if (config.styles?.lineHeightOverlapCheck === false)
            return;
        const styleBlocks = extractStyleBlocks(relPath, content);
        for (const block of styleBlocks) {
            const blockLines = block.content.split('\n');
            const selectorStack = [];
            for (let i = 0; i < blockLines.length; i++) {
                this.checkBlockLine(blockLines, i, block.startLine, relPath, selectorStack);
            }
        }
    }
    async runAudit() {
        await super.runAudit();
        this.context.setMetric('Line-height rules analyzed', this.totalRulesChecked);
    }
}
// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new TypographyLineHeightAuditor());
//# sourceMappingURL=validate_typography_line_height.js.map