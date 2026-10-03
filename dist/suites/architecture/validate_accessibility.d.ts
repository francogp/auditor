import { BaseAuditor } from '../../core/auditorBase.ts';
export type AccessibilityRuleId = 'a11y-img-alt' | 'a11y-form-control-has-label' | 'a11y-interactive-supports-focus' | 'a11y-anchor-has-content' | 'a11y-aria-role-invalid' | 'a11y-viewport-zoom-lock';
export declare const ACCESSIBILITY_RULES: readonly AccessibilityRuleId[];
/**
 * Maps an eslint-plugin-vuejs-accessibility rule to canonical AccessibilityRuleId.
 */
export declare function mapA11yRuleId(eslintRuleId: string): AccessibilityRuleId;
export declare class ValidateAccessibilityAuditor extends BaseAuditor<AccessibilityRuleId> {
    private readonly fixMode;
    constructor(options?: {
        projectRoot?: string;
        fix?: boolean;
    });
    runAudit(): Promise<void>;
    private auditIndexViewport;
    private collectVueFiles;
}
//# sourceMappingURL=validate_accessibility.d.ts.map