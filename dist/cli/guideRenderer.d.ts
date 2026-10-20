import { AuditTaskDefinition } from "../core/auditContract.js";
//#region src/cli/guideRenderer.d.ts
export interface GuideQueryMatch {
  readonly ruleId: string;
  readonly ruleDescription: string;
  readonly remediation: string;
  readonly task: AuditTaskDefinition;
}
export declare function findRuleGuide(allTasks: readonly AuditTaskDefinition[], ruleIdOrName: string): GuideQueryMatch | undefined;
export declare function renderRuleGuideCard(match: GuideQueryMatch, isVerbose?: boolean): string;
export declare function renderSuiteGuideCards(task: AuditTaskDefinition, isVerbose?: boolean): string;
export declare function renderFamilyGuideIndex(family: string, tasksInFamily: readonly AuditTaskDefinition[]): string;
export declare function renderGlobalGuideIndex(allTasks: readonly AuditTaskDefinition[]): string;
//#endregion