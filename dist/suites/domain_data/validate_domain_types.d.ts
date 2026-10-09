/**
 * packages/auditor/src/suites/domain_data/validate_domain_types.ts
 *
 * DOMAIN TYPE INTEGRITY AUDITOR (Node.js 26+ Native)
 * Detects finite-domain values declared with loose runtime structures or
 * broad string types instead of strict TypeScript domain contracts.
 *
 * Enforces:
 *   1. Zero loose collections for finite domains (new Set, new Map without domain union).
 *   2. Zero string literal arrays without `as const`.
 *   3. Zero raw `string` fields, aliases or wildcard string sinks in contracts.
 *   4. Zero ambiguous unions mixing empty-string sentinels with null/undefined.
 *   5. Nominal compile-time safety for domain IDs via Brand<string, "IdName">.
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
export declare const DEFAULT_TEST_PATH_MARKERS: readonly [".test.", ".spec."];
export declare const DOMAIN_COLLECTION_CONTEXT_WINDOW_CHARS: 80;
export declare const CANONICAL_INFRA_ID_WHITELIST: readonly ["suiteId", "ruleId", "runId", "buildId", "eslintRuleId", "candidate_id", "requiredSuiteId", "rule_id"];
export declare const DOMAIN_TYPES_RULES: readonly ["domain-naked-string-primitive", "domain-untyped-collection", "domain-ambiguous-union", "domain-unbranded-id"];
export type DomainTypesRuleId = (typeof DOMAIN_TYPES_RULES)[number];
export type FindingSeverity = 'ERROR' | 'WARN';
export interface Finding {
    file: string;
    line: number;
    col: number;
    pattern: string;
    snippet: string;
    severity: FindingSeverity;
    ruleId: DomainTypesRuleId;
}
export declare function auditFile(filePath: string): Promise<Finding[]>;
export declare class DomainTypesAuditor extends BaseAuditor<DomainTypesRuleId> {
    constructor(roots?: readonly string[], projectRoot?: string);
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_domain_types.d.ts.map