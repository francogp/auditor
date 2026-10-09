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
import { FileScanAuditor } from '../../core/auditorBase.ts';
export type GsapScrollTriggerRuleId = 'gsap-scrolltrigger-in-timeline-child' | 'gsap-scrolltrigger-scrub-and-toggle' | 'gsap-scrolltrigger-markers-production' | 'gsap-scrolltrigger-animating-pinned-element' | 'gsap-scrolltrigger-container-animation-ease';
export declare const GSAP_SCROLLTRIGGER_RULES: readonly GsapScrollTriggerRuleId[];
export declare class ValidateGsapScrollTriggerAuditor extends FileScanAuditor<GsapScrollTriggerRuleId> {
    constructor(roots?: readonly string[], projectRoot?: string);
    private isLineSuppressed;
    protected scanFile(relPath: string, content: string): void;
}
//# sourceMappingURL=validate_gsap_scrolltrigger.d.ts.map