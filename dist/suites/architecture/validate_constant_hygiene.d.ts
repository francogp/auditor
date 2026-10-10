/**
 * src/suites/architecture/validate_constant_hygiene.ts
 *
 * UNIFIED CONSTANT HYGIENE & DUPLICATION AUDITOR (Node.js 26+ Native)
 *
 * Enforces unified constant declaration architecture and magic number governance:
 *   1. Cross-module duplicate constant detection (identical or divergent values via AST).
 *   2. Strict prohibition of inline magic numbers outside designated data/config roots.
 *   3. Naming convention enforcement: prohibition of value suffixes in constant names.
 *   4. Prohibition of redundant 1:1 constant aliases (const A = B / export const A = B).
 *   5. Prohibition of raw numeric literals in constant suffixes (_100, _600).
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_constant_hygiene.ts
 */
import { FileScanAuditor } from '../../core/auditorBase.ts';
import { type SharedAstContext } from '../../core/astContext.ts';
export declare const CONSTANT_HYGIENE_RULES: readonly ["duplicate-constant-identical", "duplicate-constant-divergent", "constant-bad-names", "constant-no-alias", "constant-no-literal-suffix"];
export type ConstantHygieneRuleId = (typeof CONSTANT_HYGIENE_RULES)[number];
export declare class ValidateConstantHygieneAuditor extends FileScanAuditor<ConstantHygieneRuleId> {
    private readonly scannedAbsFiles;
    constructor(rootsOrOptions?: readonly string[] | {
        projectRoot?: string;
        roots?: readonly string[];
    }, maybeProjectRoot?: string);
    private scanRegexConstantRules;
    private scanRedundantExportAliases;
    protected scanFile(relPath: string, content: string): void;
    runAudit(astContext?: SharedAstContext): Promise<void>;
}
export { ValidateConstantHygieneAuditor as ConstantHygieneAuditor };
//# sourceMappingURL=validate_constant_hygiene.d.ts.map