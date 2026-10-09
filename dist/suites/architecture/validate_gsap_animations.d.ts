/**
 * src/suites/architecture/validate_gsap_animations.ts
 *
 * GSAP ANIMATION & UI TIMING HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Enforces mandatory GSAP animation governance and UI timer architecture (AGENTS.md):
 *   1. `gsap-banned-css-animations`: Prohibits `@keyframes` and `transition:` in styles.
 *   2. `gsap-banned-ui-timers`: Prohibits `setTimeout`/`setInterval` in UI components & views.
 *   3. `gsap-no-layout-properties`: Prohibits layout animations (`backgroundPosition`, `top`, etc.) in GSAP.
 *   4. `gsap-named-timer-constants`: Enforces semantic constants with `_SEC` suffix in GSAP delays.
 *   5. `gsap-empty-vue-transitions`: Prohibits empty Vue transition classes (`.fade-enter-active {}`).
 *   6. `gsap-no-important-transforms`: Prohibits `!important` on `transform` in styles.
 *   7. `gsap-no-important-filters`: Prohibits `!important` on `filter` in styles.
 *   8. `gsap-gpu-layer-promotion`: Flags dynamic filter animations lacking `will-change`.
 *
 * Escape Hatches:
 *   `// timer-ok: <reason>`, `// delay-ok: <reason>`, `// layout-ok: <reason>`, `// gpu-ok: <reason>`
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_gsap_animations.ts
 */
import { FileScanAuditor } from '../../core/auditorBase.ts';
export type GsapAnimationRuleId = 'gsap-banned-css-animations' | 'gsap-banned-ui-timers' | 'gsap-no-layout-properties' | 'gsap-named-timer-constants' | 'gsap-empty-vue-transitions' | 'gsap-no-important-transforms' | 'gsap-no-important-filters' | 'gsap-gpu-layer-promotion' | 'gsap-timeline-constructor-duration' | 'gsap-kebab-case-properties' | 'gsap-raw-transform-string' | 'gsap-simultaneous-origin-conflict' | 'gsap-legacy-ease-names' | 'gsap-high-frequency-tween-creation';
export declare const GSAP_ANIMATION_RULES: readonly GsapAnimationRuleId[];
export declare const CONTEXT_WINDOW_SPAN_CHARS = 500;
export declare const GSAP_TWEEN_CONFIG_SEARCH_WINDOW_CHARS = 400;
export declare const BANNED_CSS_ANIMATIONS_REGEX: RegExp;
export declare const BANNED_UI_TIMERS_REGEX: RegExp;
export declare const NO_IMPORTANT_ON_TRANSFORMS_REGEX: RegExp;
export declare const NO_IMPORTANT_ON_FILTERS_REGEX: RegExp;
export declare const EMPTY_VUE_TRANSITIONS_REGEX: RegExp;
export declare const GSAP_TWEEN_CALL_REGEX: RegExp;
export declare const GPU_FILTER_REGEX: RegExp;
export declare const GSAP_LAYOUT_PROPERTIES: readonly ["backgroundPosition", "backgroundPositionX", "backgroundPositionY", "top", "bottom", "left", "right", "width", "height", "margin", "marginTop", "marginBottom", "marginLeft", "marginRight", "padding", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight"];
export type GsapLayoutProperty = (typeof GSAP_LAYOUT_PROPERTIES)[number];
export declare class ValidateGsapAnimationsAuditor extends FileScanAuditor<GsapAnimationRuleId> {
    constructor(roots?: readonly string[], projectRoot?: string);
    private getNamedTimerConstantsRegex;
    private scanCssAnimations;
    private scanUiTimers;
    private scanGsapTweenConfig;
    private scanGsapTweens;
    private scanNamedTimerConstants;
    private scanStyleConventions;
    private scanTimelineAndEases;
    protected scanFile(relPath: string, content: string): void;
    private scanHighFrequencyTweens;
}
//# sourceMappingURL=validate_gsap_animations.d.ts.map