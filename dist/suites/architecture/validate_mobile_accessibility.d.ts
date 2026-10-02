/**
 * scripts/auditors/architecture/validate_mobile_accessibility.ts
 *
 * MOBILE & WEB ACCESSIBILITY STANDARDS AUDITOR (Node.js 26+ Native)
 *
 * Enforces accessibility & mobile standards (mobile-design & web-design-guidelines):
 *   1. No Zoom Blocking Viewport (`no-zoom-blocking-viewport`):
 *      In `index.html`, forbids `user-scalable=no` or `maximum-scale=1.0` which violates
 *      WCAG 1.4.4 text resize accessibility.
 *   2. Image Alt Required (`img-alt-required`):
 *      In `.vue` templates, all `<img>` elements must provide an `alt` or `:alt` attribute.
 *   3. Icon Button Accessible Label (`icon-button-accessible-label`):
 *      Buttons that contain only icons and no textual content must provide an `aria-label`,
 *      a `title`, or be wrapped in a tooltip component.
 *
 * Escape Hatches:
 *   `// a11y-ok: <reason>`, `<!-- a11y-ok: <reason> -->`
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_mobile_accessibility.ts
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
export type MobileAccessibilityRuleId = 'no-zoom-blocking-viewport' | 'img-alt-required' | 'icon-button-accessible-label';
export declare const MOBILE_ACCESSIBILITY_RULES: readonly MobileAccessibilityRuleId[];
export declare class MobileAccessibilityAuditor extends BaseAuditor<MobileAccessibilityRuleId> {
    constructor(projectRoot?: string, roots?: readonly string[]);
    runAudit(): Promise<void>;
    private auditIndexViewport;
    private auditVueTemplates;
    private auditImgAlt;
    private auditIconButtonLabels;
}
//# sourceMappingURL=validate_mobile_accessibility.d.ts.map