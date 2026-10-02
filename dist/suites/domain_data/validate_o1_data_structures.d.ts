/**
 * scripts/auditors/domain_data/validate_o1_data_structures.ts
 *
 * O(1) DATA STRUCTURE & LINEAR SEARCH AUDITOR (Node.js 26+ Native)
 * Scans codebase to detect anti-patterns of linear search O(N) and nested loops O(N^2)
 * where an O(1) indexed data structure (Record, ReadonlySet, Map) is available.
 *
 * Rules:
 *   1. o1-catalog-lookup: Linear scan (.find, .filter, .some, .findLast) on static catalogs
 *   2. o1-linear-membership: Array constant .includes() instead of ReadonlySet.has().
 *   3. o1-object-scan: Object.keys() / Object.values() linear search instead of key index.
 *   4. o1-json-clone: JSON.parse(JSON.stringify(...)) anti-pattern instead of structuredClone or factory.
 *   5. o1-redundant-spread-return: Redundant 'return [...arr]' instead of directly returning 'readonly T[]'.
 */
import { FileScanAuditor } from '../../core/auditorBase.ts';
export declare const DEFAULT_O1_CATALOG_PATTERNS: Array<{
    name: string;
    pattern: RegExp;
    alternative: string;
    definingFile: string;
}>;
export declare function getResolvedO1CatalogPatterns(): Array<{
    name: string;
    pattern: RegExp;
    alternative: string;
    definingFile: string;
}>;
export declare const P_STATIC_ARRAY_INCLUDES: RegExp;
export declare const P_OBJECT_SCAN_LOOKUP: RegExp;
export declare const P_JSON_CLONE: RegExp;
export declare const P_REDUNDANT_SPREAD_RETURN: RegExp;
export declare const ESCAPE_HATCHES: readonly ["// o1-ok:", "// linear-search-ok:"];
export declare function shouldIgnoreLine(line: string): boolean;
export type O1RuleId = 'o1-catalog-lookup' | 'o1-linear-membership' | 'o1-object-scan' | 'o1-json-clone' | 'o1-redundant-spread-return';
export declare const O1_RULES: readonly O1RuleId[];
export interface O1Issue {
    ruleId: O1RuleId;
    message: string;
    line: number;
    context: string;
    isWarning: boolean;
}
export declare function scanFileForO1Issues(filePath: string, content: string, catalogPatterns?: Array<{
    name: string;
    pattern: RegExp;
    alternative: string;
    definingFile: string;
}>): O1Issue[];
export declare class O1DataStructuresAuditor extends FileScanAuditor<O1RuleId> {
    constructor(roots?: readonly string[], projectRoot?: string);
    protected scanFile(relPath: string, content: string): void;
}
//# sourceMappingURL=validate_o1_data_structures.d.ts.map