/**
 * scripts/auditors/architecture/validate_css_duplicates.ts
 *
 * CSS & SCSS HYGIENE AND DUPLICATION AUDITOR (Node.js 26+ Native)
 *
 * Audits stylesheets, component styles, and Vue SFC style blocks using pure PostCSS AST
 * to detect duplicated CSS rules, similar classes, unvariabled colors, long values,
 * duplicate selectors, and empty rule blocks.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* src/suites/architecture/validate_css_duplicates.ts
 *   npm run validate:css-duplicates
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
import { type CssAnalysisDetails } from '../../analyzers/cssAnalyzer.ts';
export type CssDuplicatesRuleId = 'css-duplicate-rules' | 'css-similar-classes' | 'css-duplicate-long-lines' | 'css-unvariabled-colors' | 'css-duplicate-selectors' | 'css-empty-rules';
export declare const CSS_DUPLICATES_RULES: readonly CssDuplicatesRuleId[];
export interface CssAuditJsonResult {
    readonly summary: {
        readonly filesScanned: number;
        readonly totalErrors: number;
        readonly totalWarnings: number;
        readonly durationMs: number;
        readonly countsByRule: Record<CssDuplicatesRuleId, number>;
    };
    readonly findings: readonly {
        readonly ruleId: string;
        readonly ruleDescription?: string;
        readonly severity: 'error' | 'warning';
        readonly file: string;
        readonly line: number;
        readonly message: string;
        readonly context: string;
    }[];
    readonly details: CssAnalysisDetails;
}
export declare class CssDuplicatesAuditor extends BaseAuditor<CssDuplicatesRuleId> {
    private readonly targetDir;
    private lastAnalysisDetails;
    constructor(targetDir?: string, projectRoot?: string);
    getAnalysisDetails(): CssAnalysisDetails | null;
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_css_duplicates.d.ts.map