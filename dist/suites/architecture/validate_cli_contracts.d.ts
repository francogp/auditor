import { CLI_CONTRACT_RULES, CliContractRuleId, CliContractViolation } from "../../analyzers/cliContracts/cliContractTypes.js";
import { SharedAstContext } from "../../core/astContext.js";
import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
export interface CliContractsAuditResult {
  readonly filesScanned: number;
  readonly violations: readonly CliContractViolation[];
  readonly passed: boolean;
  readonly countsByRule: Record<CliContractRuleId, number>;
}
/** Script extensions scanned by this suite. */
export declare const CLI_CONTRACT_EXTENSIONS: ReadonlySet<string>;
/**
 * Scans in-memory source code for CLI contract violations using the TypeScript AST.
 */
export declare function scanFileForCliContractViolations(filePath: string, content: string): CliContractViolation[];
/**
 * Full repository audit runner for CLI contracts and Citty governance.
 */
export declare function auditCliContracts(targetDir?: string): CliContractsAuditResult;
export declare class CliContractsAuditor extends FileScanAuditor<CliContractRuleId> {
  private readonly cliViolationsByDoc;
  constructor(options?: FileScanRootsOptions);
  runAudit(astContext?: SharedAstContext): Promise<void>;
  private checkCittyDependency;
  private getGroupedCliViolations;
}
export { CLI_CONTRACT_RULES, type CliContractRuleId, type CliContractViolation };