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
import { BaseAuditor, FileScanAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig, isExemptFile } from '../../core/auditConfig.ts';

enableCompileCache();

export type GsapScrollTriggerRuleId =
  | 'gsap-scrolltrigger-in-timeline-child'
  | 'gsap-scrolltrigger-scrub-and-toggle'
  | 'gsap-scrolltrigger-markers-production'
  | 'gsap-scrolltrigger-animating-pinned-element'
  | 'gsap-scrolltrigger-container-animation-ease';

export const GSAP_SCROLLTRIGGER_RULES: readonly GsapScrollTriggerRuleId[] = [
  'gsap-scrolltrigger-in-timeline-child',
  'gsap-scrolltrigger-scrub-and-toggle',
  'gsap-scrolltrigger-markers-production',
  'gsap-scrolltrigger-animating-pinned-element',
  'gsap-scrolltrigger-container-animation-ease'
] as const;

export class ValidateGsapScrollTriggerAuditor extends FileScanAuditor<GsapScrollTriggerRuleId> {
  constructor(roots?: readonly string[], projectRoot?: string) {
    const config = getAuditConfig(projectRoot);
    const effectiveRoots = roots ?? config.paths.srcRoots;

    super({
      id: 'validate_gsap_scrolltrigger',
      name: 'GSAP ScrollTrigger Hygiene',
      description: 'Gobernanza de sincronización y anclajes en ScrollTrigger',
      family: 'architecture',
      packageName: 'ScrollTrigger',
      icon: '📜',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
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
      allowedExtensions: new Set(['.ts', '.vue', '.tsx', '.js']),
      ruleIds: GSAP_SCROLLTRIGGER_RULES,
      ruleDescriptions: {
        'gsap-scrolltrigger-in-timeline-child': 'scrollTrigger en tween de timeline',
        'gsap-scrolltrigger-scrub-and-toggle': 'Conflicto scrub y toggleActions',
        'gsap-scrolltrigger-markers-production': 'markers: true en código productivo',
        'gsap-scrolltrigger-animating-pinned-element': 'Animación en elemento fijado pin',
        'gsap-scrolltrigger-container-animation-ease': 'Falta ease: none en contenedor'
      }
    });
  }

  private isLineSuppressed(content: string, index: number, pattern: RegExp): boolean {
    const lineStart = content.lastIndexOf('\n', index) + 1;
    const lineEnd = content.indexOf('\n', index);
    const lineText = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    const trimmed = lineText.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      return true;
    }
    return pattern.test(lineText);
  }

  protected override scanFile(relPath: string, content: string): void {
    if (isExemptFile(relPath)) return;

    // 1. gsap-scrolltrigger-in-timeline-child
    // Detects child tweens declaring scrollTrigger configuration inside timeline sequence
    const timelineChildRegex = /(?:\b(?:tl|timeline|\w*Timeline)|\))\s*\.\s*(?:to|from|fromTo)\s*\([^){]*\{[^)}]*(?:\}[^){]*\{[^)}]*)*(?:\)[^}]*)?\bscrollTrigger\s*:/g;
    let m: RegExpExecArray | null;
    while ((m = timelineChildRegex.exec(content)) !== null) {
      if (this.isLineSuppressed(content, m.index, /\/\/\s*(?:scrolltrigger-ok|st-ok):\s*\S+/i)) continue;

      this.addViolationAtMatch({
        ruleId: 'gsap-scrolltrigger-in-timeline-child',
        filePath: relPath,
        content,
        matchIndex: m.index,
        message: "Declarar 'scrollTrigger' en un tween hijo de timeline rompe la secuencia. Decláralo en 'gsap.timeline({ scrollTrigger: ... })'.",
        severity: 'error'
      });
    }

    // 2. gsap-scrolltrigger-scrub-and-toggle & 3. markers-production & 4. animating pinned element
    // Inspect scrollTrigger config blocks: scrollTrigger: { ... } or ScrollTrigger.create({ ... })
    const stBlockRegex = /(?:scrollTrigger\s*:\s*\{|ScrollTrigger\.create\s*\(\s*\{)([^}]*)\}/g;
    while ((m = stBlockRegex.exec(content)) !== null) {
      const blockBody = m[1] ?? '';
      const matchIndex = m.index;
      if (this.isLineSuppressed(content, matchIndex, /\/\/\s*(?:scrolltrigger-ok|st-ok):\s*\S+/i)) continue;

      // 2. Conflict between scrub and toggleActions
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

      // 3. markers: true in production
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
    }

    // 4. gsap-scrolltrigger-animating-pinned-element
    // Detects tween with pin: true animating transforms on same target
    const pinnedAnimationRegex = /\b(?:gsap|tl|timeline)\s*\.\s*(?:to|from|fromTo)\s*\([^,]+,\s*\{[^}]*\bpin\s*:\s*true[^}]*(?:\bx|\by|\bscale|\brotation)\s*:/g;
    while ((m = pinnedAnimationRegex.exec(content)) !== null) {
      if (this.isLineSuppressed(content, m.index, /\/\/\s*(?:scrolltrigger-ok|st-ok|pin-ok):\s*\S+/i)) continue;

      this.addViolationAtMatch({
        ruleId: 'gsap-scrolltrigger-animating-pinned-element',
        filePath: relPath,
        content,
        matchIndex: m.index,
        message: "Animación de transformación sobre elemento fijado con 'pin: true' distorsiona el pin-spacer. Fija el contenedor padre.",
        severity: 'error'
      });
    }

    // 5. gsap-scrolltrigger-container-animation-ease
    // Detects containerAnimation where horizontal tween ease is not 'none'
    const containerAnimRegex = /\bcontainerAnimation\s*:\s*([^,}\n]+)/g;
    while ((m = containerAnimRegex.exec(content)) !== null) {
      const animVar = m[1]?.trim() ?? '';
      if (!animVar) continue;
      // Look for definition of animVar
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
