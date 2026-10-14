import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor, createUniformRuleCapabilities, LIGHT_RULE_CAPABILITIES, resolveFileScanRoots } from "../../core/auditorBase.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { stripCommentsAndStrings } from "../../core/scannerUtils.js";
enableCompileCache();
export const SCSS_ARCHITECTURE_RULES = [
    'raw-css-in-sfc',
    'scss-deep-selector-abuse',
    'non-standard-spacing-unit',
    'missing-theme-token-usage',
    'excessive-scss-nesting'
];
const SCANNABLE_EXTS = new Set(['.scss', '.vue', '.css']);
export class ValidateScssArchitectureAuditor extends FileScanAuditor {
    constructor(options = {}) {
        const { effectiveRoot, targetRoots } = resolveFileScanRoots(options);
        const config = getAuditConfig(effectiveRoot);
        super({
            usesThirdPartyTool: false,
            id: 'validate_scss_architecture',
            name: 'SCSS Architecture & Distinctive Design Validator',
            description: 'Arquitectura SCSS, tokenización y diseño distintivo',
            family: 'architecture',
            packageName: 'SCSSArch',
            icon: '🎨',
            configKey: 'scssArchitecture.enabled',
            defaultConfig: { enabled: true },
            criticalConfig: {},
            roots: targetRoots,
            allowedExtensions: SCANNABLE_EXTS,
            ruleIds: SCSS_ARCHITECTURE_RULES,
            ruleDescriptions: {
                'raw-css-in-sfc': '<style> sin atributo lang="scss"',
                'scss-deep-selector-abuse': 'Abuso o anidamiento de :deep()',
                'non-standard-spacing-unit': 'Espaciado arbitrario sin escala',
                'missing-theme-token-usage': 'Color hardcodeado sin token de tema',
                'excessive-scss-nesting': 'Anidamiento SCSS superior a 3 niveles'
            },
            ruleRemediations: {
                'raw-css-in-sfc': 'Guía de diagnóstico y remediación para raw-css-in-sfc. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'scss-deep-selector-abuse': 'Guía de diagnóstico y remediación para scss-deep-selector-abuse. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'non-standard-spacing-unit': 'Guía de diagnóstico y remediación para non-standard-spacing-unit. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'missing-theme-token-usage': 'Guía de diagnóstico y remediación para missing-theme-token-usage. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'excessive-scss-nesting': 'Guía de diagnóstico y remediación para excessive-scss-nesting. Revisa la incidencia detectada y ajusta el código correspondiente.',
            },
            ruleCapabilities: createUniformRuleCapabilities(SCSS_ARCHITECTURE_RULES, LIGHT_RULE_CAPABILITIES),
            projectRoot: effectiveRoot,
            coverage: deriveCoverageFromRoots(targetRoots, SCANNABLE_EXTS, effectiveRoot),
            exemptPaths: config.scssArchitecture?.exemptPaths
        });
    }
    scanFile(relPath, content) {
        const isVueSfc = relPath.endsWith('.vue');
        const isScssFile = relPath.endsWith('.scss');
        const isCssFile = relPath.endsWith('.css');
        this.runSubAuditorSync('raw-css-in-sfc', () => {
            if (isVueSfc) {
                this.auditRawCssInSfc(relPath, content);
            }
        });
        if (isVueSfc) {
            const styleBlocks = this.extractStyleBlocks(content);
            for (const block of styleBlocks) {
                this.runSubAuditorSync('scss-deep-selector-abuse', () => {
                    this.auditScssDeepSelectorAbuse(relPath, block.content, block.startLine);
                });
                this.runSubAuditorSync('non-standard-spacing-unit', () => {
                    this.auditNonStandardSpacingUnit(relPath, block.content, block.startLine);
                });
                this.runSubAuditorSync('missing-theme-token-usage', () => {
                    this.auditMissingThemeTokenUsage(relPath, block.content, block.startLine, block.scoped);
                });
                this.runSubAuditorSync('excessive-scss-nesting', () => {
                    this.auditExcessiveScssNesting(relPath, block.content, block.startLine, block.scoped);
                });
            }
        }
        else if (isScssFile || isCssFile) {
            this.runSubAuditorSync('scss-deep-selector-abuse', () => {
                this.auditScssDeepSelectorAbuse(relPath, content, 1);
            });
            this.runSubAuditorSync('non-standard-spacing-unit', () => {
                this.auditNonStandardSpacingUnit(relPath, content, 1);
            });
            this.runSubAuditorSync('missing-theme-token-usage', () => {
                this.auditMissingThemeTokenUsage(relPath, content, 1, false);
            });
            this.runSubAuditorSync('excessive-scss-nesting', () => {
                this.auditExcessiveScssNesting(relPath, content, 1, false);
            });
        }
    }
    extractStyleBlocks(content) {
        const blocks = [];
        const styleRegex = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
        let match;
        while ((match = styleRegex.exec(content)) !== null) {
            const attrs = match[1] ?? '';
            const scoped = /\bscoped\b/i.test(attrs);
            const before = content.slice(0, match.index);
            const startLine = before.split('\n').length;
            blocks.push({ content: match[2] ?? '', startLine, scoped });
        }
        return blocks;
    }
    auditRawCssInSfc(relPath, content) {
        if (content.includes('raw-css-ok'))
            return;
        if (!relPath.endsWith('.vue'))
            return;
        // Detect <style> without lang="scss"
        const styleTagRegex = /<style\b([^>]*)>/gi;
        let match;
        while ((match = styleTagRegex.exec(content)) !== null) {
            const attrs = match[1] ?? '';
            const hasScss = /lang=["']scss["']/i.test(attrs);
            if (!hasScss) {
                const line = this.getLineNumber(content, match.index);
                this.addViolation({
                    ruleId: 'raw-css-in-sfc',
                    severity: 'error',
                    message: 'Bloque <style> en componente SFC sin atributo lang="scss" mandatorio',
                    file: relPath,
                    line
                });
            }
        }
    }
    auditScssDeepSelectorAbuse(relPath, content, lineOffset = 1) {
        if (content.includes('deep-selector-ok'))
            return;
        // 1. Detect nested :deep() e.g. :deep(...) :deep(...)
        const nestedDeepRegex = /:deep\([^)]*\)[^{};]*:deep\(/g;
        let nestedMatch;
        while ((nestedMatch = nestedDeepRegex.exec(content)) !== null) {
            const line = lineOffset + this.getLineNumber(content, nestedMatch.index) - 1;
            this.addViolation({
                ruleId: 'scss-deep-selector-abuse',
                severity: 'error',
                message: 'Uso de selector :deep() anidado dentro de otro :deep() en la misma regla',
                file: relPath,
                line
            });
        }
        // 2. Detect overly complex selector chain inside :deep (> 3 compound selectors)
        const complexDeepRegex = /:deep\(\s*([^)]+)\s*\)/g;
        let complexMatch;
        while ((complexMatch = complexDeepRegex.exec(content)) !== null) {
            const innerSelector = complexMatch[1] ?? '';
            const parts = innerSelector.trim().split(/\s+/).filter(Boolean);
            if (parts.length > 3) {
                const line = lineOffset + this.getLineNumber(content, complexMatch.index) - 1;
                this.addViolation({
                    ruleId: 'scss-deep-selector-abuse',
                    severity: 'error',
                    message: `Cadena de selectores excesivamente compleja dentro de :deep() (${parts.length} selectores > 3)`,
                    file: relPath,
                    line
                });
            }
        }
    }
    auditNonStandardSpacingUnit(relPath, content, lineOffset = 1) {
        if (content.includes('spacing-unit-ok'))
            return;
        const config = getAuditConfig(this.projectRoot);
        if (config.scssArchitecture?.allowPixelArtSpacing)
            return;
        const allowedUnits = new Set(config.scssArchitecture?.allowedSpacingUnits ?? []);
        // Detect arbitrary odd pixel values like 11px, 13px, 15px, 17px, 19px, 21px, 23px, 27px in spacing
        const arbitrarySpacingRegex = /(?:margin(?:-(?:top|bottom|left|right|inline|block))?|padding(?:-(?:top|bottom|left|right|inline|block))?|gap|row-gap|column-gap)\s*:[^;]*?\b(1[13579]|2[13579]|3[13579]|7|9|13|17|23|27)px\b/gi;
        let match;
        while ((match = arbitrarySpacingRegex.exec(content)) !== null) {
            const val = match[1];
            const unitStr = `${val}px`;
            if (allowedUnits.has(unitStr) || allowedUnits.has(val))
                continue;
            const line = lineOffset + this.getLineNumber(content, match.index) - 1;
            this.addViolation({
                ruleId: 'non-standard-spacing-unit',
                severity: 'error',
                message: `Valor de espaciado arbitrario (${unitStr}) fuera de escala estándar o sin token de diseño`,
                file: relPath,
                line
            });
        }
    }
    auditMissingThemeTokenUsage(relPath, content, lineOffset = 1, isScoped = false) {
        if (content.includes('theme-token-ok'))
            return;
        const config = getAuditConfig(this.projectRoot);
        if (isScoped && config.scssArchitecture?.allowScopedColors)
            return;
        // Detect hardcoded hex colors or rgb(...) in color properties without var(--...)
        const hardcodedColorRegex = /(?:color|background-color|background|border-color|fill|stroke)\s*:\s*([^;{}]*)/gi;
        let match;
        while ((match = hardcodedColorRegex.exec(content)) !== null) {
            const val = match[1] ?? '';
            if (val.includes('var(') || val.includes('$') || val.includes('transparent') || val.includes('currentColor') || val.includes('inherit')) {
                continue;
            }
            const hasHex = /#[0-9a-f]{3,8}\b/i.test(val);
            const hasRgb = /\brgba?\([^)]+\)/.test(val);
            if (hasHex || hasRgb) {
                const line = lineOffset + this.getLineNumber(content, match.index) - 1;
                this.addViolation({
                    ruleId: 'missing-theme-token-usage',
                    severity: 'error',
                    message: 'Color hexadecimal o rgb hardcodeado sin utilizar variable o token del sistema de diseño',
                    file: relPath,
                    line
                });
            }
        }
    }
    isLineNestingExempt(rawLines, index) {
        const rawLine = rawLines[index] ?? '';
        const prevRawLine = index > 0 ? (rawLines[index - 1] ?? '') : '';
        return rawLine.includes('scss-nesting-ok') || prevRawLine.includes('scss-nesting-ok');
    }
    processScssLineBraces(line, blockStack, maxAllowedDepth, onViolation) {
        for (let c = 0; c < line.length; c++) {
            const char = line[c];
            if (char === '{') {
                const preceding = line.slice(0, c).trim();
                const isAtRule = preceding.startsWith('@');
                blockStack.push(isAtRule ? 'atrule' : 'selector');
                if (!isAtRule) {
                    const selectorDepth = blockStack.filter(b => b === 'selector').length;
                    if (selectorDepth > maxAllowedDepth) {
                        onViolation(selectorDepth);
                    }
                }
            }
            else if (char === '}') {
                blockStack.pop();
            }
        }
    }
    auditExcessiveScssNesting(relPath, content, lineOffset = 1, isScoped = false) {
        if (content.includes('scss-nesting-ok'))
            return;
        const config = getAuditConfig(this.projectRoot);
        const maxAllowedDepth = isScoped
            ? (config.scssArchitecture?.scopedMaxNestingDepth ?? 4)
            : (config.scssArchitecture?.maxNestingDepth ?? 3);
        const cleanContent = stripCommentsAndStrings(content);
        const lines = cleanContent.split('\n');
        const rawLines = content.split('\n');
        const blockStack = [];
        for (let i = 0; i < lines.length; i++) {
            if (this.isLineNestingExempt(rawLines, i))
                continue;
            this.processScssLineBraces(lines[i], blockStack, maxAllowedDepth, (depth) => {
                this.addViolation({
                    ruleId: 'excessive-scss-nesting',
                    severity: 'error',
                    message: `Anidamiento SCSS excesivo (${depth} niveles > ${maxAllowedDepth}); aplanar selectores con BEM o clases semánticas`,
                    file: relPath,
                    line: lineOffset + i
                });
            });
        }
    }
}
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateScssArchitectureAuditor());
//# sourceMappingURL=validate_scss_architecture.js.map