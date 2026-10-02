/**
 * scripts/auditors/architecture/validate_css_duplicates.ts
 *
 * CSS & SCSS DUPLICATION AUDITOR (Node.js 26+ Native)
 *
 * Audits stylesheets, component styles, and Vue SFC style blocks using css-checker
 * to detect duplicated CSS rules, selectors, and redundant styles.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* --allow-child-process scripts/auditors/architecture/validate_css_duplicates.ts
 *   npm run validate:css-duplicates
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
export type CssDuplicatesRuleId = 'css-duplicate-rules' | 'css-checker-missing';
export declare const CSS_DUPLICATES_RULES: readonly CssDuplicatesRuleId[];
export declare class CssDuplicatesAuditor extends BaseAuditor<CssDuplicatesRuleId> {
    private readonly targetDir;
    constructor(targetDir?: string, projectRoot?: string);
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_css_duplicates.d.ts.map