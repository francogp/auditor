/**
 * scripts/auditors/architecture/validate_bundle_budget.ts
 *
 * BUNDLE BUDGET & CLIENT LEAK AUDITOR (Node.js 26+ Native)
 *
 * Enforces bundle boundaries and import discipline across production code:
 *   1. Prohibits importing from /tests/ or /scripts/ inside src/ (bundle-runtime-leak).
 *   2. Prohibits importing heavy modules (postgres, node:sqlite, vitest, @playwright/test)
 *      as runtime values in UI layers (src/components, src/views, src/stores).
 *   3. Enforces client chunk budgets in dist/assets when compiled assets exist.
 *
 * Escape Hatch:
 *   // bundle-leak-ok: <justification> disables import check on that line.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_bundle_budget.ts
 *   npm run validate:bundle-budget
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
import { SharedAstContext } from '../../core/astContext.ts';
export type BundleBudgetRuleId = 'bundle-runtime-leak' | 'bundle-heavy-import' | 'bundle-chunk-size';
export declare const BUNDLE_BUDGET_RULES: readonly BundleBudgetRuleId[];
export declare const DEFAULT_FORBIDDEN_VALUE_IMPORTS_UI: readonly {
    module: string;
    reason: string;
}[];
export declare function getForbiddenValueImportsUI(projectRoot?: string): readonly {
    module: string;
    reason: string;
}[];
export declare class BundleBudgetAuditor extends BaseAuditor<BundleBudgetRuleId> {
    constructor(projectRoot?: string);
    runAudit(astContext?: SharedAstContext): Promise<void>;
}
//# sourceMappingURL=validate_bundle_budget.d.ts.map