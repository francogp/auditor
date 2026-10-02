/**
 * scripts/auditors/architecture/validate_duplicate_constants.ts
 *
 * CROSS-MODULE DUPLICATE CONSTANTS AUDITOR (Node.js 26+ Native)
 *
 * Employs TypeScript AST analysis via SharedAstContext to detect duplicate
 * constant declarations across independent modules in src/.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_duplicate_constants.ts
 *   npm run validate:duplicate-constants
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
import { SharedAstContext } from '../../core/astContext.ts';
export type DuplicateConstantsRuleId = 'duplicate-constant-identical' | 'duplicate-constant-divergent';
export declare const DUPLICATE_CONSTANTS_RULES: readonly DuplicateConstantsRuleId[];
export declare class DuplicateConstantsAuditor extends BaseAuditor<DuplicateConstantsRuleId> {
    constructor(options?: {
        projectRoot?: string;
        roots?: readonly string[];
    });
    runAudit(astContext?: SharedAstContext): Promise<void>;
}
//# sourceMappingURL=validate_duplicate_constants.d.ts.map