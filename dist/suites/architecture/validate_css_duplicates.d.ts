/**
 * packages/auditor/src/suites/architecture/validate_css_duplicates.ts
 *
 * CSS & SCSS HYGIENE AND DUPLICATION AUDITOR (Node.js 26+ Native)
 *
 * Powered by Stylelint engine with Vue SFC and SCSS support.
 * Serves as standard auditor suite and backwards-compatible alias for validate_stylelint.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* src/suites/architecture/validate_css_duplicates.ts
 *   npm run validate:css-duplicates
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
import { type StylelintRuleId } from './validate_stylelint.ts';
export type CssDuplicatesRuleId = StylelintRuleId;
export declare const CSS_DUPLICATES_RULES: readonly CssDuplicatesRuleId[];
export declare class CssDuplicatesAuditor extends BaseAuditor<CssDuplicatesRuleId> {
    private readonly stylelintAuditor;
    constructor(_targetDir?: string, projectRoot?: string);
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_css_duplicates.d.ts.map