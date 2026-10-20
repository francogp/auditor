import { FindingSeverity } from "../../core/auditContract.js";
//#region src/analyzers/homebrew/homebrewTypes.d.ts
export declare const AUDITOR_HOMEBREW_RULES: readonly ["auditor-manual-package-json", "auditor-manual-vue-sfc-regex", "auditor-manual-ts-ast", "auditor-raw-console", "auditor-manual-comment-stripping", "auditor-manual-brace-counting", "auditor-manual-file-walker", "auditor-homebrew-predicates", "auditor-manual-rule-timing", "auditor-hardcoded-config", "auditor-manual-step-logging", "auditor-unmeasured-rule", "auditor-redundant-rule-evaluated", "auditor-third-party-tool-contract", "auditor-inefficient-file-scan"];
export type AuditorHomebrewRuleId = (typeof AUDITOR_HOMEBREW_RULES)[number];
export interface HomebrewInspectionContext {
  readonly filePath: string;
  readonly absolutePath: string;
  readonly content: string;
  readonly lines: readonly string[];
  readonly isExtension: boolean;
  readonly isBuiltinSuite: boolean;
  readonly isAnalyzer: boolean;
  readonly isCore?: boolean;
  readonly projectRoot: string;
}
export interface HomebrewFinding {
  readonly ruleId: AuditorHomebrewRuleId;
  readonly line: number;
  readonly message: string;
  readonly context?: string;
  readonly severity?: FindingSeverity;
}
export interface HomebrewDetector {
  readonly id: string;
  readonly ruleId: AuditorHomebrewRuleId;
  readonly ruleDescription: string;
  detect(context: HomebrewInspectionContext): HomebrewFinding[];
}
export interface LineDetectorOptions {
  readonly id: string;
  readonly ruleId: AuditorHomebrewRuleId;
  readonly ruleDescription: string;
  readonly checkLine: (line: string, trimmed: string, lineNum: number, context: HomebrewInspectionContext) => {
    message: string;
    context?: string;
    severity?: FindingSeverity;
  } | string | null | void;
}
export declare function createLineDetector(options: LineDetectorOptions): HomebrewDetector;
/**
 * Checks whether an index within a line of code sits inside an open string literal.
 */
export declare function isInsideStringLiteral(line: string, index: number): boolean;
//#endregion