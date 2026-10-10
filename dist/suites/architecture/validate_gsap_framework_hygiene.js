/**
 * src/suites/architecture/validate_gsap_framework_hygiene.ts
 *
 * GSAP FRAMEWORK HYGIENE & COMPONENT LIFECYCLE AUDITOR (Node.js 26+ Native)
 *
 * Enforces best practices for GSAP in UI frameworks (Vue SFC, React, Svelte):
 *   1. `gsap-unscoped-component-selectors`: Prohibits unscoped global selectors in UI components.
 *   2. `gsap-missing-context-revert`: Enforces ctx.revert() or kill() on component unmount.
 *   3. `gsap-missing-plugin-registration`: Enforces gsap.registerPlugin(...) for imported GSAP plugins.
 *   4. `gsap-banned-devtools-production`: Prohibits GSDevTools or MotionPathHelper without dev guard.
 *
 * Escape Hatches:
 *   `// scope-ok: <reason>`, `// revert-ok: <reason>`, `// plugin-ok: <reason>`, `// devtools-ok: <reason>`
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_gsap_framework_hygiene.ts
 */
import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor } from "../../core/auditorBase.js";
import { getAuditConfig, isInCodeRoots, isExemptFile, matchesAnyRoot } from "../../core/auditConfig.js";
import { normalizePosixPath as normalizeFilePath } from "../../core/safePath.js";
import { scanBalancedParens } from "../../core/scannerUtils.js";
enableCompileCache();
export const GSAP_FRAMEWORK_HYGIENE_RULES = [
    'gsap-unscoped-component-selectors',
    'gsap-missing-context-revert',
    'gsap-missing-plugin-registration',
    'gsap-banned-devtools-production'
];
export const DEVTOOLS_GUARD_WINDOW_PRE_CHARS = 150;
export const DEVTOOLS_GUARD_WINDOW_POST_CHARS = 200;
export function findGsapScopeRanges(content) {
    const ranges = [];
    const scopeRegex = /\b(?:gsap\.context|useGSAP|\w*ctx\.add)\s*\(/g;
    let match;
    while ((match = scopeRegex.exec(content)) !== null) {
        const openParenIndex = match.index + match[0].length - 1;
        const result = scanBalancedParens(content, openParenIndex + 1);
        if (result.depth === 0) {
            ranges.push({ start: match.index, end: result.end });
        }
    }
    return ranges;
}
function isInsideAnyScopeRange(index, ranges) {
    return ranges.some(r => index >= r.start && index < r.end);
}
export class ValidateGsapFrameworkHygieneAuditor extends FileScanAuditor {
    constructor(roots, projectRoot) {
        const config = getAuditConfig(projectRoot);
        const effectiveRoots = roots ?? config.paths.srcRoots;
        super({
            id: 'validate_gsap_framework_hygiene',
            name: 'GSAP Framework Hygiene',
            description: 'Gobernanza de ciclo de vida UI, scope y plugins GSAP',
            family: 'architecture',
            packageName: 'GSAP',
            icon: '🎭',
            configKey: 'paths',
            defaultConfig: {},
            capabilities: {
                fix: false,
                fixPriority: false,
                lint: true,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
            },
            roots: effectiveRoots,
            allowedExtensions: new Set(['.ts', '.vue', '.tsx', '.jsx']),
            ruleIds: GSAP_FRAMEWORK_HYGIENE_RULES,
            ruleDescriptions: {
                'gsap-unscoped-component-selectors': 'Selector global sin acotar en UI',
                'gsap-missing-context-revert': 'Falta revert o cleanup en unmount',
                'gsap-missing-plugin-registration': 'Plugin GSAP usado sin registrar',
                'gsap-banned-devtools-production': 'Herramienta devtools en producción'
            }
        });
    }
    scanFile(relPath, content) {
        const norm = normalizeFilePath(relPath);
        const isCodeFile = norm.endsWith('.ts') || norm.endsWith('.vue') || norm.endsWith('.tsx') || norm.endsWith('.jsx');
        if (!isCodeFile || isExemptFile(relPath))
            return;
        const config = getAuditConfig(this.projectRoot);
        const uiRoots = [
            ...(config.paths.componentsRoots ?? ['src/components']),
            ...(config.paths.viewsRoots ?? ['src/views'])
        ];
        const isUiComponent = norm.endsWith('.vue') || matchesAnyRoot(norm, uiRoots);
        if (isUiComponent && isInCodeRoots(relPath)) {
            this.scanUnscopedSelectors(relPath, content);
            this.scanContextRevert(relPath, content);
        }
        this.scanPluginRegistration(relPath, content);
        this.scanDevtoolsProduction(relPath, content);
    }
    scanUnscopedSelectors(relPath, content) {
        const scopeRanges = findGsapScopeRanges(content);
        const unscopedRegex = /\b(?:gsap|timeline|\w*Timeline|tl)\s*\.\s*(?:to|from|fromTo)\s*\(\s*['"]([.#][\w\s>+~.:#-]+)['"]/g;
        let m;
        while ((m = unscopedRegex.exec(content)) !== null) {
            const selector = m[1];
            const preceding = content.slice(Math.max(0, m.index - 200), m.index);
            const lineEnd = content.indexOf('\n', m.index);
            const currentLine = content.slice(m.index, lineEnd === -1 ? undefined : lineEnd);
            const nearby = preceding + '\n' + currentLine;
            if (/\/\/\s*(?:scope-ok|selector-ok):\s*\S+/i.test(nearby))
                continue;
            const isScoped = isInsideAnyScopeRange(m.index, scopeRanges);
            if (!isScoped) {
                this.addViolationAtMatch({
                    ruleId: 'gsap-unscoped-component-selectors',
                    filePath: relPath,
                    content,
                    matchIndex: m.index,
                    message: `Selector global '${selector}' en componente UI sin scope acotado. Usa 'gsap.context(..., rootRef.value)' o 'useGSAP()' para evitar fugas.`,
                    severity: 'error'
                });
            }
        }
    }
    scanContextRevert(relPath, content) {
        if (!/gsap\.context\s*\(/.test(content))
            return;
        const hasRevert = /\.revert\s*\(|\.kill\s*\(/.test(content);
        const hasUnmountLifecycle = /onUnmounted|onScopeDispose|useEffect/.test(content);
        const hasRevertOk = /\/\/\s*revert-ok:\s*\S+/i.test(content);
        if ((!hasRevert || !hasUnmountLifecycle) && !hasRevertOk) {
            this.addViolationAtMatch({
                ruleId: 'gsap-missing-context-revert',
                filePath: relPath,
                content,
                matchIndex: content.indexOf('gsap.context'),
                message: "Uso de 'gsap.context()' en componente UI sin llamar a 'revert()' en 'onUnmounted' / 'onScopeDispose'.",
                severity: 'error'
            });
        }
    }
    scanPluginRegistration(relPath, content) {
        const pluginImportRegex = /import\s*\{[^}]*\b(ScrollTrigger|Flip|Draggable|SplitText|Observer|ScrollSmoother|InertiaPlugin|MotionPathPlugin)\b[^}]*\}\s*from\s*['"]gsap\/[a-zA-Z0-9]+['"]/g;
        let pluginMatch;
        while ((pluginMatch = pluginImportRegex.exec(content)) !== null) {
            const pluginName = pluginMatch[1];
            const hasRegister = new RegExp(`gsap\\.registerPlugin\\s*\\([^)]*\\b${pluginName}\\b`).test(content);
            const hasPluginOk = /\/\/\s*plugin-ok:\s*\S+/i.test(content);
            if (!hasRegister && !hasPluginOk) {
                this.addViolationAtMatch({
                    ruleId: 'gsap-missing-plugin-registration',
                    filePath: relPath,
                    content,
                    matchIndex: pluginMatch.index,
                    message: `Plugin GSAP '${pluginName}' importado sin llamar a 'gsap.registerPlugin(${pluginName})'. Riesgo de descarte por tree-shaking.`,
                    severity: 'error'
                });
            }
        }
    }
    scanDevtoolsProduction(relPath, content) {
        const devtoolsRegex = /\b(GSDevTools|MotionPathHelper)\.create\s*\(/g;
        let devtoolsMatch;
        while ((devtoolsMatch = devtoolsRegex.exec(content)) !== null) {
            const toolName = devtoolsMatch[1];
            const windowAround = content.slice(Math.max(0, devtoolsMatch.index - DEVTOOLS_GUARD_WINDOW_PRE_CHARS), Math.min(content.length, devtoolsMatch.index + DEVTOOLS_GUARD_WINDOW_POST_CHARS));
            const hasDevGuard = /import\.meta\.env\.DEV|NODE_ENV\s*!==\s*['"]production['"]/i.test(windowAround);
            const hasDevtoolsOk = /\/\/\s*devtools-ok:\s*\S+/i.test(windowAround);
            if (!hasDevGuard && !hasDevtoolsOk) {
                this.addViolationAtMatch({
                    ruleId: 'gsap-banned-devtools-production',
                    filePath: relPath,
                    content,
                    matchIndex: devtoolsMatch.index,
                    message: `Herramienta de depuración '${toolName}' detectada sin guardia de entorno 'import.meta.env.DEV'. Prohibida en producción.`,
                    severity: 'error'
                });
            }
        }
    }
}
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateGsapFrameworkHygieneAuditor());
//# sourceMappingURL=validate_gsap_framework_hygiene.js.map