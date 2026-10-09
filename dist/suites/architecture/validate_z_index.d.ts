/**
 * scripts/auditors/architecture/validate_z_index.ts
 *
 * Z-INDEX CONSISTENCY & CSS VARIABLE AUDITOR (Node.js 26+ Native)
 *
 * Enforces unified Z-Index design system governance:
 *   1. 1:1 parity between canonical TypeScript Z_LAYERS and CSS variables in _base.scss.
 *   2. Detection of hardcoded numeric z-index literals with automated CSS variable autofix.
 *   3. Prohibition of isolated Z-Index constants declared outside canonical Z_LAYERS.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* scripts/auditors/architecture/validate_z_index.ts
 *   npm run validate:z-index
 */
import { FileScanAuditor } from '../../core/auditorBase.ts';
export declare const Z_INDEX_RULES: readonly ["z-index-missing-var", "z-index-mismatch", "z-index-read-error", "z-index-hardcoded-literal", "z-index-isolated-constant"];
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
export declare const HARDCODED_Z_INDEX_REGEX: RegExp;
export declare const ISOLATED_Z_INDEX_CONST_REGEX: RegExp;
export { fixZIndexLiteral as fixZIndexLiteralMatch } from '../../analyzers/zIndexRules.ts';
export declare class ZIndexAuditor extends FileScanAuditor<ZIndexRuleId> {
    private readonly scssPath?;
    private readonly isExplicit;
    constructor(scssPath?: string, roots?: readonly string[], projectRoot?: string);
    protected scanFile(relPath: string, content: string): void;
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_z_index.d.ts.map