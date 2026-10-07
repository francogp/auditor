import { BaseAuditor } from '../../core/auditorBase.ts';
export declare const ACCESSIBILITY_RULES: readonly ["a11y-img-alt", "a11y-form-control-has-label", "a11y-interactive-supports-focus", "a11y-anchor-has-content", "a11y-aria-role-invalid", "a11y-viewport-zoom-lock"];
export type AccessibilityRuleId = (typeof ACCESSIBILITY_RULES)[number];
/**
 * Maps an eslint-plugin-vuejs-accessibility rule to canonical AccessibilityRuleId.
 */
export declare function mapA11yRuleId(eslintRuleId: string): AccessibilityRuleId;
export declare class ValidateAccessibilityAuditor extends BaseAuditor<AccessibilityRuleId> {
    constructor(options?: {
        projectRoot?: string;
        fix?: boolean;
    });
    runAudit(): Promise<void>;
    private collectScannableVueFiles;
    private buildEffectiveRules;
    private executeEslintOnVueFiles;
    private processLintResults;
    private auditIndexViewport;
    private collectVueFiles;
}
//# sourceMappingURL=validate_accessibility.d.ts.map