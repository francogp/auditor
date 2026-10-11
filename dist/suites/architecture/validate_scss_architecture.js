import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor, createRuleCapabilities } from "../../core/auditorBase.js";
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
        const effectiveRoot = options.projectRoot ?? process.cwd();
        super({
            id: 'validate_scss_architecture',
            name: 'SCSS Architecture & Distinctive Design Validator',
            description: 'Arquitectura SCSS, tokenización y diseño distintivo',
            family: 'architecture',
            packageName: 'SCSSArch',
            icon: '🎨',
            configKey: 'scssArchitecture.enabled',
            defaultConfig: { enabled: true },
            criticalConfig: {},
            roots: options.roots ?? ['src'],
            allowedExtensions: SCANNABLE_EXTS,
            ruleIds: SCSS_ARCHITECTURE_RULES,
            ruleDescriptions: {
                'raw-css-in-sfc': '<style> sin atributo lang="scss"',
                'scss-deep-selector-abuse': 'Abuso o anidamiento de :deep()',
                'non-standard-spacing-unit': 'Espaciado arbitrario sin escala',
                'missing-theme-token-usage': 'Color hardcodeado sin token de tema',
                'excessive-scss-nesting': 'Anidamiento SCSS superior a 3 niveles'
            },
            ruleCapabilities: createRuleCapabilities(SCSS_ARCHITECTURE_RULES, {
                fix: false,
                fixPriority: false,
                lint: true,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
            }),
            projectRoot: effectiveRoot,
            coverage: { include: ['src/**/*.{scss,vue}'] }
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
                    this.auditMissingThemeTokenUsage(relPath, block.content, block.startLine);
                });
                this.runSubAuditorSync('excessive-scss-nesting', () => {
                    this.auditExcessiveScssNesting(relPath, block.content, block.startLine);
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
                this.auditMissingThemeTokenUsage(relPath, content, 1);
            });
            this.runSubAuditorSync('excessive-scss-nesting', () => {
                this.auditExcessiveScssNesting(relPath, content, 1);
            });
        }
    }
    extractStyleBlocks(content) {
        const blocks = [];
        const styleRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
        let match;
        while ((match = styleRegex.exec(content)) !== null) {
            const before = content.slice(0, match.index);
            const startLine = before.split('\n').length;
            blocks.push({ content: match[1] ?? '', startLine });
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
        // Detect arbitrary odd pixel values like 11px, 13px, 15px, 17px, 19px, 21px, 23px, 27px in spacing
        const arbitrarySpacingRegex = /(?:margin(?:-(?:top|bottom|left|right|inline|block))?|padding(?:-(?:top|bottom|left|right|inline|block))?|gap|row-gap|column-gap)\s*:[^;]*?\b(1[13579]|2[13579]|3[13579]|7|9|13|17|23|27)px\b/gi;
        let match;
        while ((match = arbitrarySpacingRegex.exec(content)) !== null) {
            const line = lineOffset + this.getLineNumber(content, match.index) - 1;
            const val = match[1];
            this.addViolation({
                ruleId: 'non-standard-spacing-unit',
                severity: 'error',
                message: `Valor de espaciado arbitrario (${val}px) fuera de escala estándar o sin token de diseño`,
                file: relPath,
                line
            });
        }
    }
    auditMissingThemeTokenUsage(relPath, content, lineOffset = 1) {
        if (content.includes('theme-token-ok'))
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
    auditExcessiveScssNesting(relPath, content, lineOffset = 1) {
        if (content.includes('scss-nesting-ok'))
            return;
        const lines = content.split('\n');
        let depth = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            // Check for opening brace in selector rule (exclude at-rules like @media, @include, @keyframes, @supports, etc.)
            const openMatches = trimmed.match(/\{/g) ?? [];
            const closeMatches = trimmed.match(/\}/g) ?? [];
            for (const _ of openMatches) {
                if (!trimmed.startsWith('@')) {
                    depth++;
                    if (depth > 3) {
                        this.addViolation({
                            ruleId: 'excessive-scss-nesting',
                            severity: 'error',
                            message: `Anidamiento SCSS excesivo (${depth} niveles > 3); aplanar selectores con BEM o clases semánticas`,
                            file: relPath,
                            line: lineOffset + i
                        });
                    }
                }
            }
            for (const _ of closeMatches) {
                depth = Math.max(0, depth - 1);
            }
        }
    }
}
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateScssArchitectureAuditor());
//# sourceMappingURL=validate_scss_architecture.js.map