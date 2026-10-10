/**
 * scripts/auditors/architecture/validate_component_styles.ts
 *
 * VUE COMPONENT STYLE LINKAGE & SCSS ORPHAN AUDITOR (Node.js 26+ Native)
 *
 * Enforces component-level style governance across the codebase:
 *   1. Broken style link verification: All `<style src="...">` in `.vue` files
 *      and `@use`/`@import`/`@forward` must resolve to existent files on disk.
 *   2. Missing style linkage verification: Every `.vue` component with custom
 *      template classes must have an associated `<style>` block or explicit link.
 *   3. SCSS orphan detection: All component stylesheets must be
 *      actively linked or imported in the dependency graph rooted at main SCSS entries
 *      or directly inside Vue components.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=. --allow-fs-write=. scripts/auditors/architecture/validate_component_styles.ts
 *   npm run validate:component-styles
 */
import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { getEffectiveGlobalUtilityClasses } from "./validate_dead_css.js";
import { parseVueSfc } from "../../core/vueSfcParser.js";
import { stripComments } from "../../core/scannerUtils.js";
import { toPosixRelative, normalizePosixPath } from "../../core/safePath.js";
enableCompileCache();
export const COMPONENT_STYLE_RULES = [
    'broken-style-link',
    'missing-style-tag',
    'banned-style-inherited',
    'orphaned-scss',
    'ad-hoc-button-styles',
    'banned-plain-css-style',
    'banned-raw-css-file'
];
export const COMPONENT_STYLE_VIOLATION_TYPES = [
    'broken_style_link',
    'missing_style_tag',
    'banned_style_inherited',
    'orphaned_scss',
    'ad_hoc_button_styles',
    'banned_plain_css_style',
    'banned_raw_css_file'
];
const DEFAULT_CANONICAL_BUTTON_VARIANTS = new Set([
    'btn-primary',
    'btn-secondary',
    'btn-dark',
    'btn-success',
    'btn-warning',
    'btn-danger',
    'btn-sm',
    'btn-md',
    'btn-lg',
    'btn-block',
    'btn-3d',
    'btn-icon'
]);
function getEffectiveCanonicalButtonVariants() {
    const config = getAuditConfig();
    const configured = config.styles?.buttonGovernance?.canonicalVariants ?? config.styles?.canonicalButtonVariants;
    if (configured) {
        return new Set(configured);
    }
    return DEFAULT_CANONICAL_BUTTON_VARIANTS;
}
/**
 * Standard SASS candidate resolution
 */
function resolveSassPath(importPath, fromFile, srcDir) {
    let baseDir = path.dirname(fromFile);
    let cleanImport = importPath;
    if (cleanImport.startsWith('@/')) {
        baseDir = srcDir;
        cleanImport = cleanImport.slice(2);
    }
    else if (cleanImport.startsWith('~')) {
        cleanImport = cleanImport.slice(1);
    }
    const dirPart = path.dirname(cleanImport);
    const baseName = path.basename(cleanImport);
    const candidates = [
        path.resolve(baseDir, cleanImport),
        path.resolve(baseDir, `${cleanImport}.scss`),
        path.resolve(baseDir, `${cleanImport}.css`),
        path.resolve(baseDir, dirPart, `_${baseName}.scss`),
        path.resolve(baseDir, cleanImport, '_index.scss'),
        path.resolve(baseDir, cleanImport, 'index.scss')
    ];
    for (const cand of candidates) {
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
            return cand;
        }
    }
    return null;
}
function isCustomCandidateClass(c, globalUtilityClasses) {
    return (!c.startsWith('var(') &&
        !c.includes('{') &&
        !c.includes('}') &&
        !c.startsWith(':') &&
        !c.includes('[') &&
        !c.includes(']') &&
        !c.includes('(') &&
        !c.includes(')') &&
        !globalUtilityClasses.has(c));
}
function createScssTracker(srcDir) {
    const importedScssFiles = new Set();
    const trackScssFile = (filePath) => {
        const normalized = path.normalize(filePath);
        if (importedScssFiles.has(normalized))
            return;
        importedScssFiles.add(normalized);
        if (fs.existsSync(normalized)) {
            const content = fs.readFileSync(normalized, 'utf-8');
            const matches = content.matchAll(/@(?:use|import|forward)\s+["']([^"']+)["']/g);
            for (const m of matches) {
                const importTarget = m[1];
                const resolved = resolveSassPath(importTarget, normalized, srcDir);
                if (resolved) {
                    trackScssFile(resolved);
                }
            }
        }
    };
    return { importedScssFiles, trackScssFile };
}
function seedRootScssGraph(stylesRoots, projectRoot, trackScssFile) {
    for (const sRoot of stylesRoots) {
        const candidates = [
            path.join(projectRoot, sRoot, '_index.scss'),
            path.join(projectRoot, sRoot, 'index.scss'),
            path.join(projectRoot, sRoot, 'main.scss')
        ];
        for (const cand of candidates) {
            if (fs.existsSync(cand)) {
                trackScssFile(cand);
            }
        }
    }
}
function auditStyleLinkage(file, relPath, content, srcDir, trackScssFile, auditor) {
    const scssMatches = content.matchAll(/@(?:use|import|forward)\s+["']([^"']+)["']|src=["']([^"']+\.scss)["']/g);
    for (const m of scssMatches) {
        const importTarget = m[1] || m[2];
        if (importTarget) {
            const resolved = resolveSassPath(importTarget, file, srcDir);
            if (resolved)
                trackScssFile(resolved);
        }
    }
    const parsed = parseVueSfc(content);
    for (const style of parsed.styles) {
        const srcPath = typeof style.attributes['src'] === 'string' ? style.attributes['src'] : undefined;
        if (srcPath) {
            const resolved = resolveSassPath(srcPath, file, srcDir);
            if (!resolved) {
                auditor.recordViolation({
                    file: relPath,
                    type: 'broken_style_link',
                    message: `Style src points to non-existent file: ${srcPath}`
                }, 'broken-style-link', style.rawBlock);
            }
            else {
                trackScssFile(resolved);
            }
        }
    }
    if (content.includes('style-inherited')) {
        auditor.recordViolation({
            file: relPath,
            type: 'banned_style_inherited',
            message: `Directiva ilegal '// ' + 'style-inherited' detectada. Los estilos scoped en Vue 3 no penetran a componentes hijos; cada SFC debe declarar o enlazar explícitamente sus propios estilos.`
        }, 'banned-style-inherited', 'style-inherited');
    }
}
function checkButtonStyleOverrides(relPath, styles, auditor) {
    for (const style of styles) {
        const styleBody = style.content;
        const btnSelectorMatch = styleBody.match(/(?:^|[^\w-])(\.btn(?:\s*\{|\s*[,>+~]|\.[\w-]+))/i);
        if (btnSelectorMatch) {
            auditor.recordViolation({
                file: relPath,
                type: 'ad_hoc_button_styles',
                message: `Sobreescritura ad-hoc de estilos de botón detectada en <style>: "${btnSelectorMatch[1]}". Todos los estilos de botón deben gobernarse de forma centralizada.`
            }, 'ad-hoc-button-styles', btnSelectorMatch[1]);
        }
    }
}
function checkCanonicalButtonClasses(relPath, content, canonicalButtonVariants, auditor) {
    const allClassMatches = content.matchAll(/(?<![-:\w])class=["']([^"']+)["']/g);
    for (const cm of allClassMatches) {
        const clsList = cm[1].split(/\s+/).filter(Boolean);
        if (!clsList.includes('btn'))
            continue;
        for (const c of clsList) {
            if (c.startsWith('btn-') && !canonicalButtonVariants.has(c)) {
                auditor.recordViolation({
                    file: relPath,
                    type: 'ad_hoc_button_styles',
                    message: `Clase de botón no canónica "${c}" detectada. Solo se permiten variantes canónicas configuradas (${Array.from(canonicalButtonVariants).join(', ')}).`
                }, 'ad-hoc-button-styles', c);
            }
        }
    }
}
function auditButtonGovernance(relPath, content, styles, config, auditor) {
    const isButtonGovActive = config.styles?.buttonGovernance?.enabled === true || Boolean(config.styles?.canonicalButtonVariants?.length);
    if (!isButtonGovActive)
        return;
    checkButtonStyleOverrides(relPath, styles, auditor);
    const canonicalButtonVariants = getEffectiveCanonicalButtonVariants();
    if (canonicalButtonVariants.size > 0) {
        checkCanonicalButtonClasses(relPath, content, canonicalButtonVariants, auditor);
    }
}
function checkHasValidStyle(styles) {
    return styles.some(style => {
        const hasSrc = Boolean(style.attributes['src']);
        const body = stripComments(style.content).trim();
        return hasSrc || body.length > 0;
    });
}
function extractCustomClasses(content, globalUtilityClasses) {
    const customClasses = [];
    const classMatches = content.matchAll(/(?<![-:\w])class=["']([^"']+)["']/g);
    for (const m of classMatches) {
        const clsList = m[1].split(/\s+/).filter(Boolean);
        for (const c of clsList) {
            if (isCustomCandidateClass(c, globalUtilityClasses)) {
                customClasses.push(c);
            }
        }
    }
    const dynamicClassMatches = content.matchAll(/(?:\s:|\bv-bind:)class=["']([^"']+)["']/g);
    for (const dm of dynamicClassMatches) {
        const expr = dm[1];
        const strLiterals = expr.matchAll(/['`]([\w-]+)['`]/g);
        for (const sl of strLiterals) {
            const c = sl[1];
            if (isCustomCandidateClass(c, globalUtilityClasses)) {
                customClasses.push(c);
            }
        }
    }
    return customClasses;
}
function auditMissingStyleTag(relPath, content, hasValidStyle, auditor) {
    if (hasValidStyle)
        return;
    const globalUtilityClasses = getEffectiveGlobalUtilityClasses();
    const customClasses = extractCustomClasses(content, globalUtilityClasses);
    if (customClasses.length > 0) {
        auditor.recordViolation({
            file: relPath,
            type: 'missing_style_tag',
            message: `Defines ${customClasses.length} custom template classes (${customClasses.slice(0, 3).join(', ')}...) without an associated non-empty <style> block`
        }, 'missing-style-tag', customClasses.slice(0, 3).join(', '));
    }
}
function addOrReplaceLangScss(openingTag) {
    const langRegex = /\blang=(?:"[^"]*"|'[^']*'|[^\s>]+)/i;
    if (langRegex.test(openingTag)) {
        return openingTag.replace(langRegex, 'lang="scss"');
    }
    return openingTag.replace(/\s*(\/?>)$/, ' lang="scss"$1');
}
function auditScssEnforcement(file, relPath, content, styles, auditor) {
    const violatingStyles = [];
    for (const style of styles) {
        if (!style.lang || style.lang.toLowerCase() !== 'scss') {
            violatingStyles.push(style);
        }
    }
    if (violatingStyles.length === 0)
        return;
    if (auditor.isFixActive()) {
        const sorted = [...violatingStyles].sort((a, b) => b.startIndex - a.startIndex);
        let updatedContent = content;
        for (const style of sorted) {
            const openingTag = updatedContent.slice(style.startIndex, style.contentStartIndex);
            const fixedOpeningTag = addOrReplaceLangScss(openingTag);
            updatedContent =
                updatedContent.slice(0, style.startIndex) +
                    fixedOpeningTag +
                    updatedContent.slice(style.contentStartIndex);
        }
        fs.writeFileSync(file, updatedContent, 'utf-8');
        return;
    }
    for (const style of violatingStyles) {
        const openingTag = content.slice(style.startIndex, style.contentStartIndex).trim();
        auditor.recordViolation({
            file: relPath,
            type: 'banned_plain_css_style',
            message: `Bloque <style> en "${relPath}" no declara lang="scss". Todo componente Vue debe utilizar SCSS.`
        }, 'banned-plain-css-style', openingTag, style.startLine, true);
    }
}
function isExemptCssFile(relPath, exemptList) {
    if (!exemptList || exemptList.length === 0)
        return false;
    const normRel = normalizePosixPath(relPath).toLowerCase();
    const baseName = path.basename(normRel);
    return exemptList.some(item => {
        const normItem = normalizePosixPath(item).toLowerCase();
        return normRel === normItem || normRel.endsWith(`/${normItem}`) || baseName === normItem;
    });
}
function auditRawCssFiles(cssFiles, projectRoot, exemptCssFiles, auditor) {
    for (const file of cssFiles) {
        const relPath = toPosixRelative(projectRoot, file);
        if (isExemptCssFile(relPath, exemptCssFiles)) {
            continue;
        }
        auditor.recordViolation({
            file: relPath,
            type: 'banned_raw_css_file',
            message: `Archivo CSS plano "${relPath}" detectado. Todo archivo de estilos debe utilizar preprocesador SCSS (.scss).`
        }, 'banned-raw-css-file', relPath, 1, false);
    }
}
function auditVueComponent(file, projectRoot, srcDir, trackScssFile, config, auditor, enforceScss = false) {
    const content = fs.readFileSync(file, 'utf-8');
    const relPath = toPosixRelative(projectRoot, file);
    auditStyleLinkage(file, relPath, content, srcDir, trackScssFile, auditor);
    const sfc = parseVueSfc(content);
    auditButtonGovernance(relPath, content, sfc.styles, config, auditor);
    const hasValidStyle = checkHasValidStyle(sfc.styles);
    auditMissingStyleTag(relPath, content, hasValidStyle, auditor);
    if (enforceScss) {
        auditScssEnforcement(file, relPath, content, sfc.styles, auditor);
    }
}
function auditOrphanedScss(stylesRoots, scssFiles, importedScssFiles, projectRoot, auditor) {
    const componentScssDirs = stylesRoots.map(sr => path.resolve(projectRoot, sr, 'components'));
    const componentScssFiles = scssFiles.filter(f => componentScssDirs.some(dir => f.startsWith(dir)));
    for (const file of componentScssFiles) {
        const normalized = path.normalize(file);
        if (!importedScssFiles.has(normalized)) {
            const relPath = toPosixRelative(projectRoot, file);
            auditor.recordViolation({
                file: relPath,
                type: 'orphaned_scss',
                message: 'SCSS component stylesheet is never imported by any Vue component or SCSS root'
            }, 'orphaned-scss', relPath);
        }
    }
}
export class ComponentStylesAuditor extends BaseAuditor {
    collectedViolations = [];
    vueCount = 0;
    scssCount = 0;
    cssCount = 0;
    constructor(options = {}) {
        const effectiveRoot = options.projectRoot ?? process.cwd();
        const config = getAuditConfig(effectiveRoot);
        const effectiveRoots = options.roots ?? [
            ...(config.paths.componentsRoots ?? ['src/components']),
            ...(config.paths.viewsRoots ?? ['src/views']),
            ...(config.paths.stylesRoots ?? ['src/styles'])
        ];
        super({
            capabilities: {
                fix: true,
                fixPriority: false,
                lint: true,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
            },
            fixableRuleIds: ['banned-plain-css-style'],
            fix: options.fix,
            id: 'validate_component_styles',
            name: 'Vue Component Style Linkage & SCSS Auditor',
            description: 'Valida enlaces de estilos de componentes y huérfanos SCSS',
            family: 'architecture',
            packageName: 'Estilos',
            configKey: 'styles.enabled',
            defaultConfig: { enabled: true },
            icon: '🎨',
            ruleIds: COMPONENT_STYLE_RULES,
            ruleDescriptions: {
                'broken-style-link': 'Enlace de estilo roto o inexistente',
                'missing-style-tag': 'Componente sin bloque de estilos',
                'banned-style-inherited': 'Marcador style-inherited prohibido',
                'orphaned-scss': 'Archivo SCSS huérfano sin uso',
                'ad-hoc-button-styles': 'Clase de botón fuera de estándar',
                'banned-plain-css-style': 'Bloque <style> sin lang="scss"',
                'banned-raw-css-file': 'Archivo CSS plano sin SCSS'
            },
            coverage: {
                include: [
                    'src/components/**/*.vue',
                    'src/views/**/*.vue',
                    'src/styles/**/*.{scss,css}',
                    'src/**/*.{scss,css}'
                ]
            },
            roots: effectiveRoots,
            projectRoot: effectiveRoot
        });
    }
    recordViolation(v, ruleId, context, line = 1, fixable = false) {
        this.collectedViolations.push(v);
        this.addViolation({
            ruleId,
            severity: 'error',
            file: v.file,
            line,
            message: v.message,
            context,
            fixable
        });
    }
    getViolations() {
        return this.collectedViolations;
    }
    getVueCount() {
        return this.vueCount;
    }
    getScssCount() {
        return this.scssCount;
    }
    getCssCount() {
        return this.cssCount;
    }
    runAudit() {
        const config = getAuditConfig(this.projectRoot);
        const srcRoots = config.paths.srcRoots ?? ['src'];
        const srcDir = path.resolve(this.projectRoot, srcRoots[0] ?? 'src');
        const vueFiles = this.context.collectFiles(this.roots, new Set(['.vue']));
        const scssFiles = this.context.collectFiles(this.roots, new Set(['.scss']));
        const cssFiles = this.context.collectFiles(this.roots, new Set(['.css']));
        this.vueCount = vueFiles.length;
        this.scssCount = scssFiles.length;
        this.cssCount = cssFiles.length;
        const enforceScss = Boolean(config.styles?.enforceScss);
        const exemptCssFiles = config.styles?.exemptCssFiles ?? [];
        if (!enforceScss) {
            this.markRuleNotApplicable('banned-plain-css-style', 'SCSS no está forzado en configuración (styles.enforceScss: false)');
            this.markRuleNotApplicable('banned-raw-css-file', 'SCSS no está forzado en configuración (styles.enforceScss: false)');
        }
        if (vueFiles.length === 0) {
            this.markRuleNotApplicable('broken-style-link', 'No se encontraron componentes .vue');
            this.markRuleNotApplicable('missing-style-tag', 'No se encontraron componentes .vue');
            this.markRuleNotApplicable('banned-style-inherited', 'No se encontraron componentes .vue');
            this.markRuleNotApplicable('ad-hoc-button-styles', 'No se encontraron componentes .vue');
            if (enforceScss) {
                this.markRuleNotApplicable('banned-plain-css-style', 'No se encontraron componentes .vue');
            }
        }
        if (scssFiles.length === 0) {
            this.markRuleNotApplicable('orphaned-scss', 'No se encontraron archivos .scss');
        }
        if (enforceScss) {
            this.markRuleEvaluated('banned-raw-css-file');
            for (const file of cssFiles) {
                this.recordScanned(file);
            }
            auditRawCssFiles(cssFiles, this.projectRoot, exemptCssFiles, this);
        }
        const { importedScssFiles, trackScssFile } = createScssTracker(srcDir);
        const stylesRoots = config.paths.stylesRoots ?? ['src/styles'];
        seedRootScssGraph(stylesRoots, this.projectRoot, trackScssFile);
        for (const file of vueFiles) {
            this.recordScanned(file);
            this.markRuleEvaluated('broken-style-link');
            this.markRuleEvaluated('missing-style-tag');
            this.markRuleEvaluated('banned-style-inherited');
            this.markRuleEvaluated('ad-hoc-button-styles');
            if (enforceScss) {
                this.markRuleEvaluated('banned-plain-css-style');
            }
            auditVueComponent(file, this.projectRoot, srcDir, trackScssFile, config, this, enforceScss);
        }
        for (const file of scssFiles) {
            this.recordScanned(file);
            this.markRuleEvaluated('orphaned-scss');
        }
        auditOrphanedScss(stylesRoots, scssFiles, importedScssFiles, this.projectRoot, this);
        const subAuditors = this.getSubAuditors();
        const totalSteps = subAuditors.length;
        for (let i = 0; i < subAuditors.length; i++) {
            const sub = subAuditors[i];
            const count = this.countsByRule.get(sub.id) ?? 0;
            this.logSubAudit(i + 1, totalSteps, sub.name, count);
        }
    }
}
export function auditComponentStyles(rootDir) {
    const auditor = new ComponentStylesAuditor(rootDir ? { projectRoot: rootDir } : undefined);
    auditor.runAudit();
    return {
        vueComponentsScanned: auditor.getVueCount(),
        scssFilesScanned: auditor.getScssCount(),
        cssFilesScanned: auditor.getCssCount(),
        violations: auditor.getViolations(),
        passed: auditor.getViolations().length === 0
    };
}
// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ComponentStylesAuditor());
//# sourceMappingURL=validate_component_styles.js.map