/**
 * src/cli/guideRenderer.ts
 *
 * ON-DEMAND EXTENSIVE AUDIT REMEDIATION & DIAGNOSTIC GUIDE RENDERER (Node.js 26+ Native)
 * Provides detailed, unbounded troubleshooting manuals for individual rules, suites, or families.
 * Formatted with Unicode Box-Drawing (≤ 80 cols) and Markdown support.
 */
import type { AuditTaskDefinition, AuditFamily } from '../core/auditContract.ts';
export interface GuideQueryMatch {
    readonly ruleId: string;
    readonly ruleDescription: string;
    readonly remediation: string;
    readonly task: AuditTaskDefinition;
}
export declare function findRuleGuide(allTasks: readonly AuditTaskDefinition[], ruleIdOrName: string): GuideQueryMatch | undefined;
export declare function renderRuleGuideCard(match: GuideQueryMatch): string;
export declare function renderSuiteGuideCards(task: AuditTaskDefinition): string;
export declare function renderFamilyGuideIndex(family: AuditFamily | string, tasksInFamily: readonly AuditTaskDefinition[]): string;
export declare function renderGlobalGuideIndex(allTasks: readonly AuditTaskDefinition[]): string;
//# sourceMappingURL=guideRenderer.d.ts.map