/**
 * src/analyzers/homebrew/homebrewTypes.ts
 *
 * Types and interfaces for the dynamic auditor and extension homebrew code detection engine.
 */
import type { FindingSeverity } from '../../core/auditContract.ts';
export declare const AUDITOR_HOMEBREW_RULES: readonly ["auditor-manual-package-json", "auditor-manual-vue-sfc-regex", "auditor-manual-ts-ast", "auditor-manual-path-normalize", "auditor-raw-console", "auditor-manual-comment-stripping", "auditor-manual-brace-counting", "auditor-manual-path-containment", "auditor-manual-file-walker", "auditor-homebrew-predicates"];
export type AuditorHomebrewRuleId = (typeof AUDITOR_HOMEBREW_RULES)[number];
export interface HomebrewInspectionContext {
    readonly filePath: string;
    readonly absolutePath: string;
    readonly content: string;
    readonly lines: readonly string[];
    readonly isExtension: boolean;
    readonly isBuiltinSuite: boolean;
    readonly isAnalyzer: boolean;
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
//# sourceMappingURL=homebrewTypes.d.ts.map