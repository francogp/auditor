import { AuditRule, Violation } from "../../analyzers/auditRuleTypes.js";
import { RemediationPhaseId } from "../../core/remediationPhases.js";
import "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
import "./audit_rules.js";
export declare function isInsideComment(content: string, index: number): boolean;
export declare function createLineLocator(content: string, offset: number): (idx: number) => number;
export declare function applyRuleFix(rule: AuditRule, content: string, filePath: string): string;
export declare const activeProjectRuleTimings: Map<string, number>;
export declare function runRules(filePath: string, content: string, rules: AuditRule[], violations: Violation[], fix: boolean, offset: number): string;
export interface VueBlock {
  content: string;
  startLine: number;
  startIdx: number;
  endIdx: number;
}
export declare function extractAllBlocks(content: string, tag: string): VueBlock[];
export declare function getViolationCategory(v: Violation): string;
interface ProjectCliContext {
  values: Record<string, unknown>;
  selectedRules: Set<string>;
  activeConfigRules: Set<AuditRule>;
  isHumanMode: boolean;
}
export declare function extractSelectedRules(values: Record<string, unknown>, positionals: string[]): Set<string>;
export declare function filterActiveConfigRules(selectedRules: Set<string>): Set<AuditRule>;
export interface ProjectMainRunOptions {
  readonly projectRoot?: string;
  readonly precollectedFiles?: readonly string[];
  readonly skipPersist?: boolean;
}
export declare function filterAndGroupViolations(rawViolations: Violation[], ctx: ProjectCliContext): {
  all: Violation[];
  fileGroups: Record<string, Violation[]>;
  typeGroups: Record<string, number>;
};
export declare function buildProjectTopFiles(fileGroups: Record<string, Violation[]>, topLimit: number): {
  readonly file: string;
  readonly errors: number;
  readonly warnings: number;
  readonly total: number;
}[];
export declare function main(cliArgs?: string[], options?: ProjectMainRunOptions): Promise<Violation[]>;
export declare function getProjectArchitectureRuleDescriptions(): Record<string, string>;
export declare function getProjectArchitectureRuleRemediations(): Record<string, string>;
export declare function getProjectArchitectureRuleRemediationPhases(): Record<string, RemediationPhaseId>;
export interface AuditProjectOptions {
  readonly projectRoot?: string;
  readonly roots?: readonly string[];
}
export declare class ProjectArchitectureAuditor extends BaseAuditor {
  private readonly effectiveRoots;
  constructor(options?: AuditProjectOptions);
  runAudit(): Promise<void>;
}
export {};