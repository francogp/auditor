import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
export declare const QUERY_PERFORMANCE_RULES: readonly ["unindexed-foreign-keys", "select-star-in-queries", "unpaginated-queries", "n-plus-one-patterns", "heavy-count-queries", "unindexed-order-by"];
export type QueryPerformanceRuleId = (typeof QUERY_PERFORMANCE_RULES)[number];
export declare class ValidateQueryPerformanceAuditor extends FileScanAuditor<QueryPerformanceRuleId> {
  private readonly exemptSelectStarPaths;
  private readonly migrationsDir?;
  private readonly excludeMigrationsDir;
  constructor(options?: FileScanRootsOptions);
  runAudit(): Promise<void>;
  protected scanFile(relPath: string, content: string): void;
  private auditUnindexedForeignKeys;
  private auditSelectStarInQueries;
  private auditUnpaginatedQueries;
  private auditNPlusOnePatterns;
  private auditHeavyCountQueries;
  private auditUnindexedOrderBy;
}