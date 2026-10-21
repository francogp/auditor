import { BaseAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
//#region src/suites/domain_data/validate_domain_types.d.ts
export declare const DEFAULT_TEST_PATH_MARKERS: readonly [".test.", ".spec."];
export declare const DOMAIN_COLLECTION_CONTEXT_WINDOW_CHARS: 80;
export declare const CANONICAL_INFRA_ID_WHITELIST: readonly ["suiteId", "ruleId", "runId", "buildId", "eslintRuleId", "candidate_id", "requiredSuiteId", "rule_id", "timerId", "wallClockTimerId", "intervalId", "timeoutId", "tickerId", "backgroundTickerId"];
export declare const DOMAIN_TYPES_RULES: readonly ["domain-naked-string-primitive", "domain-untyped-collection", "domain-ambiguous-union", "domain-unbranded-id", "domain-chained-literal-comparison"];
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
export declare function auditFileContent(filePath: string, content: string, ruleFilter?: DomainTypesRuleId): Finding[];
export declare function auditFile(filePath: string, ruleFilter?: DomainTypesRuleId): Promise<Finding[]>;
export declare class DomainTypesAuditor extends BaseAuditor<DomainTypesRuleId> {
  constructor(options?: FileScanRootsOptions);
  private collectAuditableDomainFiles;
  runAudit(): Promise<void>;
}
//#endregion
export { DomainTypesAuditor as ValidateDomainTypesAuditor };