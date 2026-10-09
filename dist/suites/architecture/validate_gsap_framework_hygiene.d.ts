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
import { FileScanAuditor } from '../../core/auditorBase.ts';
export type GsapFrameworkHygieneRuleId = 'gsap-unscoped-component-selectors' | 'gsap-missing-context-revert' | 'gsap-missing-plugin-registration' | 'gsap-banned-devtools-production';
export declare const GSAP_FRAMEWORK_HYGIENE_RULES: readonly GsapFrameworkHygieneRuleId[];
export declare const DEVTOOLS_GUARD_WINDOW_PRE_CHARS = 150;
export declare const DEVTOOLS_GUARD_WINDOW_POST_CHARS = 200;
interface GsapScopeRange {
    readonly start: number;
    readonly end: number;
}
export declare function findGsapScopeRanges(content: string): readonly GsapScopeRange[];
export declare class ValidateGsapFrameworkHygieneAuditor extends FileScanAuditor<GsapFrameworkHygieneRuleId> {
    constructor(roots?: readonly string[], projectRoot?: string);
    protected scanFile(relPath: string, content: string): void;
    private scanUnscopedSelectors;
    private scanContextRevert;
    private scanPluginRegistration;
    private scanDevtoolsProduction;
}
export {};
//# sourceMappingURL=validate_gsap_framework_hygiene.d.ts.map