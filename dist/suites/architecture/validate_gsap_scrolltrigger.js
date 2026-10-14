/**
 * src/suites/architecture/validate_gsap_scrolltrigger.ts
 *
 * GSAP SCROLLTRIGGER ARCHITECTURAL HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Enforces best practices and anti-pattern prevention for GSAP ScrollTrigger (AGENTS.md):
 *   1. `gsap-scrolltrigger-in-timeline-child`: Prohibits scrollTrigger in child tweens of timelines.
 *   2. `gsap-scrolltrigger-scrub-and-toggle`: Prohibits conflicting scrub and toggleActions.
 *   3. `gsap-scrolltrigger-markers-production`: Prohibits markers: true in production source files.
 *   4. `gsap-scrolltrigger-animating-pinned-element`: Prohibits animating transforms on pinned element.
 *   5. `gsap-scrolltrigger-container-animation-ease`: Enforces ease: "none" on containerAnimation tweens.
 *
 * Escape Hatches:
 *   `// scrolltrigger-ok: <reason>`, `// markers-ok: <reason>`, `// st-ok: <reason>`
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_gsap_scrolltrigger.ts
 */
import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor, createRuleCapabilities } from "../../core/auditorBase.js";
import { getAuditConfig, isExemptFile } from "../../core/auditConfig.js";
enableCompileCache();
export const GSAP_SCROLLTRIGGER_RULES = [
    'gsap-scrolltrigger-in-timeline-child',
    'gsap-scrolltrigger-scrub-and-toggle',
    'gsap-scrolltrigger-markers-production',
    'gsap-scrolltrigger-animating-pinned-element',
    'gsap-scrolltrigger-container-animation-ease'
];
export class ValidateGsapScrollTriggerAuditor extends FileScanAuditor {
    constructor(roots, projectRoot) {
        const config = getAuditConfig(projectRoot);
        const effectiveRoots = roots ?? config.paths.srcRoots;
        super({
            usesThirdPartyTool: false,
            id: 'validate_gsap_scrolltrigger',
            name: 'GSAP ScrollTrigger Hygiene',
            description: 'Gobernanza de sincronización y anclajes en ScrollTrigger',
            family: 'architecture',
            packageName: 'ScrollTrigger',
            icon: '📜',
            configKey: 'paths',
            defaultConfig: {},
            criticalConfig: {},
            ruleCapabilities: createRuleCapabilities(GSAP_SCROLLTRIGGER_RULES, {
                speed: 'light',
                phase: 'normal',
                fix: 'none',
                md: false,
                ast: false,
                changedOnly: false, critical: false
            }),
            roots: effectiveRoots,
            allowedExtensions: new Set(['.ts', '.vue', '.tsx', '.js']),
            ruleIds: GSAP_SCROLLTRIGGER_RULES,
            ruleDescriptions: {
                'gsap-scrolltrigger-in-timeline-child': 'scrollTrigger en tween de timeline',
                'gsap-scrolltrigger-scrub-and-toggle': 'Conflicto scrub y toggleActions',
                'gsap-scrolltrigger-markers-production': 'markers: true en código productivo',
                'gsap-scrolltrigger-animating-pinned-element': 'Animación en elemento fijado pin',
                'gsap-scrolltrigger-container-animation-ease': 'Falta ease: none en contenedor'
            },
            ruleRemediations: {
                'gsap-scrolltrigger-in-timeline-child': 'Guía de diagnóstico y remediación para gsap-scrolltrigger-in-timeline-child. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'gsap-scrolltrigger-scrub-and-toggle': 'Guía de diagnóstico y remediación para gsap-scrolltrigger-scrub-and-toggle. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'gsap-scrolltrigger-markers-production': 'Guía de diagnóstico y remediación para gsap-scrolltrigger-markers-production. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'gsap-scrolltrigger-animating-pinned-element': 'Guía de diagnóstico y remediación para gsap-scrolltrigger-animating-pinned-element. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'gsap-scrolltrigger-container-animation-ease': 'Guía de diagnóstico y remediación para gsap-scrolltrigger-container-animation-ease. Revisa la incidencia detectada y ajusta el código correspondiente.',
            },
        });
    }
    scanFile(relPath, content) {
        if (isExemptFile(relPath))
            return;
        this.runSubAuditorSync('gsap-scrolltrigger-in-timeline-child', () => {
            this.checkTimelineChild(relPath, content);
        });
        this.runSubAuditorSync('gsap-scrolltrigger-scrub-and-toggle', () => {
            this.checkScrubAndToggle(relPath, content);
        });
        this.runSubAuditorSync('gsap-scrolltrigger-markers-production', () => {
            this.checkMarkersProduction(relPath, content);
        });
        this.runSubAuditorSync('gsap-scrolltrigger-animating-pinned-element', () => {
            this.checkAnimatingPinnedElement(relPath, content);
        });
        this.runSubAuditorSync('gsap-scrolltrigger-container-animation-ease', () => {
            this.checkContainerAnimationEase(relPath, content);
        });
    }
    isLineSuppressed(content, index, pattern) {
        const lineStart = content.lastIndexOf('\n', index) + 1;
        const lineEnd = content.indexOf('\n', index);
        const lineText = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
        const trimmed = lineText.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
            return true;
        }
        return pattern.test(lineText);
    }
    checkTimelineChild(relPath, content) {
        const timelineChildRegex = /(?:\b(?:tl|timeline|\w*Timeline)|\))\s*\.\s*(?:to|from|fromTo)\s*\([^){]*\{[^)}]*(?:\}[^){]*\{[^)}]*)*(?:\)[^}]*)?\bscrollTrigger\s*:/g;
        let m;
        while ((m = timelineChildRegex.exec(content)) !== null) {
            if (this.isLineSuppressed(content, m.index, /\/\/\s*(?:scrolltrigger-ok|st-ok):\s*\S+/i))
                continue;
            this.addViolationAtMatch({
                ruleId: 'gsap-scrolltrigger-in-timeline-child',
                filePath: relPath,
                content,
                matchIndex: m.index,
                message: "Declarar 'scrollTrigger' en un tween hijo de timeline rompe la secuencia. Decláralo en 'gsap.timeline({ scrollTrigger: ... })'.",
                severity: 'error'
            });
        }
    }
    scanScrollTriggerBlocks(content, callback) {
        const stBlockRegex = /(?:scrollTrigger\s*:\s*\{|ScrollTrigger\.create\s*\(\s*\{)([^}]*)\}/g;
        let m;
        while ((m = stBlockRegex.exec(content)) !== null) {
            const blockBody = m[1] ?? '';
            const matchIndex = m.index;
            if (this.isLineSuppressed(content, matchIndex, /\/\/\s*(?:scrolltrigger-ok|st-ok):\s*\S+/i))
                continue;
            callback(blockBody, matchIndex);
        }
    }
    checkScrubAndToggle(relPath, content) {
        this.scanScrollTriggerBlocks(content, (blockBody, matchIndex) => {
            if (/\bscrub\s*:/i.test(blockBody) && /\btoggleActions\s*:/i.test(blockBody)) {
                this.addViolationAtMatch({
                    ruleId: 'gsap-scrolltrigger-scrub-and-toggle',
                    filePath: relPath,
                    content,
                    matchIndex,
                    message: "Conflicto en ScrollTrigger: 'scrub' y 'toggleActions' no pueden coexistir. 'scrub' neutraliza las toggleActions.",
                    severity: 'error'
                });
            }
        });
    }
    checkMarkersProduction(relPath, content) {
        this.scanScrollTriggerBlocks(content, (blockBody, matchIndex) => {
            if (/\bmarkers\s*:\s*true\b/i.test(blockBody)) {
                const surroundingWindow = content.slice(Math.max(0, matchIndex - 100), Math.min(content.length, matchIndex + 200));
                const hasDevGuard = /import\.meta\.env\.DEV|NODE_ENV\s*!==\s*['"]production['"]/i.test(surroundingWindow);
                const hasMarkersOk = /\/\/\s*markers-ok:\s*\S+/i.test(surroundingWindow);
                if (!hasDevGuard && !hasMarkersOk) {
                    this.addViolationAtMatch({
                        ruleId: 'gsap-scrolltrigger-markers-production',
                        filePath: relPath,
                        content,
                        matchIndex,
                        message: "Uso de 'markers: true' en código productivo. Elimina los marcadores o enciérralos con guardia de desarrollo ('import.meta.env.DEV').",
                        severity: 'error'
                    });
                }
            }
        });
    }
    checkAnimatingPinnedElement(relPath, content) {
        const pinnedAnimationRegex = /\b(?:gsap|tl|timeline)\s*\.\s*(?:to|from|fromTo)\s*\([^,]+,\s*\{[^}]*\bpin\s*:\s*true[^}]*(?:\bx|\by|\bscale|\brotation)\s*:/g;
        let m;
        while ((m = pinnedAnimationRegex.exec(content)) !== null) {
            if (this.isLineSuppressed(content, m.index, /\/\/\s*(?:scrolltrigger-ok|st-ok|pin-ok):\s*\S+/i))
                continue;
            this.addViolationAtMatch({
                ruleId: 'gsap-scrolltrigger-animating-pinned-element',
                filePath: relPath,
                content,
                matchIndex: m.index,
                message: "Animación de transformación sobre elemento fijado con 'pin: true' distorsiona el pin-spacer. Fija el contenedor padre.",
                severity: 'error'
            });
        }
    }
    checkContainerAnimationEase(relPath, content) {
        const containerAnimRegex = /\bcontainerAnimation\s*:\s*([^,}\n]+)/g;
        let m;
        while ((m = containerAnimRegex.exec(content)) !== null) {
            const animVar = m[1]?.trim() ?? '';
            if (!animVar)
                continue;
            const defRegex = new RegExp(`(?:const|let|var)\\s+${animVar}\\s*=\\s*gsap\\.(?:to|from|fromTo)\\s*\\([^}]*\\}`, 'g');
            const defMatch = defRegex.exec(content);
            if (defMatch) {
                const tweenBody = defMatch[0];
                const easeMatch = /\bease\s*:\s*['"]([^'"]+)['"]/.exec(tweenBody);
                if (easeMatch && easeMatch[1] !== 'none') {
                    this.addViolationAtMatch({
                        ruleId: 'gsap-scrolltrigger-container-animation-ease',
                        filePath: relPath,
                        content,
                        matchIndex: defMatch.index,
                        message: `El tween impulsor de containerAnimation '${animVar}' debe tener 'ease: "none"' para sincronizar linealmente con el scroll.`,
                        severity: 'error'
                    });
                }
            }
        }
    }
}
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateGsapScrollTriggerAuditor());
//# sourceMappingURL=validate_gsap_scrolltrigger.js.map