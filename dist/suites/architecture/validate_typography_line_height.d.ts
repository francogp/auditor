/**
 * scripts/auditors/architecture/validate_typography_line_height.ts
 *
 * TYPOGRAPHY LINE-HEIGHT & INTERLINEAR SPACING AUDITOR (Node.js 26+ Native)
 *
 * Enforces safe multiline line-height across design system typography:
 *   Anti-Zero Line-Height (`line-height-overlap`): Detects text classes, headings, titles,
 *   descriptions, and multiline labels that declare 'line-height: 1' or 'line-height: 0'.
 *   Fonts with line-height <= 1 collide and overlap vertically when text wraps.
 *
 * Escape Hatch:
 *   // line-height-ok or /* line-height-ok *\/ disables the check for intentional fixtures.
 *
 * Usage:
 *   npm run validate:line-height
 */
import { FileScanAuditor } from '../../core/auditorBase.ts';
export type LineHeightRuleId = 'line-height-overlap';
export declare const TYPOGRAPHY_LINE_HEIGHT_RULES: readonly LineHeightRuleId[];
export declare class TypographyLineHeightAuditor extends FileScanAuditor<LineHeightRuleId> {
    private totalRulesChecked;
    constructor(roots?: readonly string[], projectRoot?: string);
    private checkBlockLine;
    protected scanFile(relPath: string, content: string): void;
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_typography_line_height.d.ts.map