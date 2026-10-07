/**
 * scripts/audit_project.ts
 *
 * STABLE PROJECT AUDIT ENGINE (Node.js 26+)
 *
 * Final Safe Version: Context-aware GPU checking.
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
import { type AuditRule, type Violation } from './audit_rules.ts';
export declare function isInsideComment(content: string, index: number): boolean;
export declare function createLineLocator(content: string, offset: number): (idx: number) => number;
export declare function applyRuleFix(rule: AuditRule, content: string, filePath: string): string;
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
export declare function filterAndGroupViolations(rawViolations: Violation[], ctx: ProjectCliContext): {
    all: Violation[];
    fileGroups: Record<string, Violation[]>;
    typeGroups: Record<string, number>;
};
export declare function buildProjectTopFiles(fileGroups: Record<string, Violation[]>, topLimit: number): {
    file: string;
    errors: number;
    warnings: number;
    total: number;
}[];
export declare function main(cliArgs?: string[]): Promise<Violation[]>;
export declare function getProjectArchitectureRuleDescriptions(): Record<string, string>;
export declare class ProjectArchitectureAuditor extends BaseAuditor<string> {
    constructor();
    runAudit(): Promise<void>;
}
export {};
//# sourceMappingURL=audit_project.d.ts.map