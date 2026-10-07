/**
 * scripts/auditors/architecture/validate_z_index.ts
 *
 * Z-INDEX CONSISTENCY & CSS VARIABLE AUDITOR (Node.js 26+ Native)
 *
 * Validates 1:1 parity between canonical TypeScript Z_LAYERS and CSS variables
 * defined in src/styles/_base.scss.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* scripts/auditors/architecture/validate_z_index.ts
 *   npm run validate:z-index
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
export declare const Z_INDEX_RULES: readonly ["z-index-missing-var", "z-index-mismatch", "z-index-read-error"];
export type ZIndexRuleId = (typeof Z_INDEX_RULES)[number];
export interface ZIndexAuditViolation {
    ruleId: ZIndexRuleId;
    message: string;
    context: string;
}
export interface ZIndexAuditResult {
    scssContent: string;
    modified: boolean;
    errors: string[];
    violations: ZIndexAuditViolation[];
}
export declare function auditZIndexParity(scssContent: string, isFixMode: boolean, layers?: Record<string, number>): ZIndexAuditResult;
export declare class ZIndexAuditor extends BaseAuditor<ZIndexRuleId> {
    private readonly scssPath?;
    private readonly isExplicit;
    constructor(scssPath?: string);
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_z_index.d.ts.map