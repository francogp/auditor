/**
 * scripts/validation/validate_domain_types.ts
 *
 * DOMAIN TYPE AUDIT (Node.js 26+ Native)
 * Detects finite-domain values declared with loose runtime structures or
 * broad string types instead of strict TypeScript domain contracts.
 *
 * Detects these anti-patterns:
 *   1. new Set<string>(...) / new Set([...]) used for finite domains.
 *   2. new Map<string, ...>(...) / new Map([[literal, ...]]) for domain maps.
 *   3. String literal arrays without `as const`.
 *   4. `string[]`, `Array<string>`, or `ReadonlyArray<string>` domain constants.
 *   5. `type X = string` aliases and enum-like unions ending in `| string`.
 *   6. `Record<string, ...>`, `Record<PropertyKey, ...>`, and `[key: string]`
 *      in type/data contracts.
 *   7. Contract fields declared as raw `string` in type/data files.
 *   8. Ambiguous unions mixing empty-string sentinels with null/undefined.
 *
 * Usage:
 *   npm run validate:domain-types
 *   npm run validate:domain-types:summary
 *   npm run validate:domain-types:report
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
export declare const DEFAULT_TEST_PATH_MARKERS: readonly [".test.", ".spec."];
export declare const CANONICAL_INFRA_ID_WHITELIST: readonly ["suiteId", "ruleId", "runId", "buildId", "eslintRuleId", "candidate_id", "requiredSuiteId", "rule_id"];
export type FindingSeverity = 'ERROR' | 'WARN';
export interface Finding {
    file: string;
    line: number;
    col: number;
    pattern: string;
    snippet: string;
    severity: FindingSeverity;
}
export declare function auditFile(filePath: string): Promise<Finding[]>;
export declare function detectRepeatedStringUnions(files: Array<{
    file: string;
    content: string;
}>): Map<string, Finding[]>;
export interface LibraryDomainTypeInfo {
    typeName: string;
    pkgName: string;
    signature: string;
}
export declare function extractLibraryDomainTypes(root?: string): Promise<Map<string, LibraryDomainTypeInfo>>;
/**
 * Detects local array or type definitions in src/ that duplicate library domain types.
 */
export declare function detectLibraryDomainTypeDuplicates(files: Array<{
    file: string;
    content: string;
}>, libraryTypes: Map<string, LibraryDomainTypeInfo>): Finding[];
export interface CanonicalDomainInfo {
    name: string;
    file: string;
    line: number;
    col: number;
    signature: string;
    elements: Set<string>;
    literals: string[];
    isContract: boolean;
}
export declare const MAX_CANONICAL_DOMAIN_LITERAL_LENGTH: 30;
export declare function extractProjectCanonicalDomains(files: Array<{
    file: string;
    content: string;
}>): {
    bySignature: Map<string, CanonicalDomainInfo>;
    list: CanonicalDomainInfo[];
    collisions: Finding[];
};
export declare function detectProjectDomainDuplicatesAndSubsets(files: Array<{
    file: string;
    content: string;
}>, domains: {
    bySignature: Map<string, CanonicalDomainInfo>;
    list: CanonicalDomainInfo[];
}): Finding[];
export type DomainTypesRuleId = 'domain-type-violation';
export declare const DOMAIN_TYPES_RULES: readonly DomainTypesRuleId[];
export declare class DomainTypesAuditor extends BaseAuditor<DomainTypesRuleId> {
    constructor(roots?: readonly string[], projectRoot?: string);
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_domain_types.d.ts.map