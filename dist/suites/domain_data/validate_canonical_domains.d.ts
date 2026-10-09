/**
 * packages/auditor/src/suites/domain_data/validate_canonical_domains.ts
 *
 * CANONICAL DOMAIN CATALOGS & SSoT INTEGRITY AUDITOR (Node.js 26+ Native)
 *
 * Verifies single source of truth (SSoT) across TypeScript domain types and catalogs:
 * 1. Zero collisions between canonical domain catalogs across files.
 * 2. Zero repeated ad-hoc string literal unions across multiple files (must define a shared type alias).
 * 3. Zero local reinventions of domain types already exported by installed dependencies.
 * 4. Zero subsets or uncoordinated duplicates of canonical domain arrays and types.
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
export declare const CANONICAL_DOMAIN_RULES: readonly ["canonical-domain-collision", "canonical-domain-repeated-union", "canonical-domain-library-duplicate", "canonical-domain-subset-mismatch"];
export type CanonicalDomainRuleId = (typeof CANONICAL_DOMAIN_RULES)[number];
export declare const MAX_CANONICAL_DOMAIN_LITERAL_LENGTH: 30;
export declare const MAX_COMPACT_DOMAIN_LITERALS_THRESHOLD: 40;
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
export interface LibraryDomainTypeInfo {
    typeName: string;
    pkgName: string;
    signature: string;
}
export interface CanonicalFinding {
    file: string;
    line: number;
    col: number;
    ruleId: CanonicalDomainRuleId;
    message: string;
    snippet: string;
}
export declare function extractSortedLiterals(matchStr: string): string[] | null;
export declare function extractSortedLiteralsSignature(matchStr: string): string | null;
export declare function detectRepeatedStringUnions(files: Array<{
    file: string;
    content: string;
}>): Map<string, CanonicalFinding[]>;
export declare function extractLibraryDomainTypes(root: string): Promise<Map<string, LibraryDomainTypeInfo>>;
export declare function detectLibraryDomainTypeDuplicates(files: Array<{
    file: string;
    content: string;
}>, libraryTypes: Map<string, LibraryDomainTypeInfo>): CanonicalFinding[];
export declare function extractProjectCanonicalDomains(files: Array<{
    file: string;
    content: string;
}>, projectRoot: string): {
    bySignature: Map<string, CanonicalDomainInfo>;
    list: CanonicalDomainInfo[];
    collisions: CanonicalFinding[];
};
export declare function detectProjectDomainDuplicatesAndSubsets(files: Array<{
    file: string;
    content: string;
}>, domains: {
    bySignature: Map<string, CanonicalDomainInfo>;
    list: CanonicalDomainInfo[];
}): CanonicalFinding[];
export interface ValidateCanonicalDomainsOptions {
    projectRoot?: string;
    roots?: readonly string[];
}
export declare class ValidateCanonicalDomainsAuditor extends BaseAuditor<CanonicalDomainRuleId> {
    constructor(optionsOrTarget?: string | ValidateCanonicalDomainsOptions);
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_canonical_domains.d.ts.map