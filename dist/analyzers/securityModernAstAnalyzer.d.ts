import { computeRawLineOffsets, getRawSpanFromAstNode } from "./modernDomAstUtils.js";
import ts from "typescript";
export declare const MODERN_SECURITY_RULES: readonly ["security-postmessage-origin-validation", "security-trusted-types-passthrough", "security-external-sri-missing", "security-cookie-samesite-partitioned", "ci-github-actions-script-injection"];
export type ModernSecurityRuleId = (typeof MODERN_SECURITY_RULES)[number];
export interface ModernSecurityFinding {
  readonly ruleId: ModernSecurityRuleId;
  readonly line: number;
  readonly message: string;
  readonly fixable: boolean;
}
export interface ModernSecurityAnalysisResult {
  readonly findings: readonly ModernSecurityFinding[];
  readonly fixedContent?: string;
}
export declare function analyzeModernSecurityScriptAst(rawContent: string, sf: ts.SourceFile, enableFix: boolean): ModernSecurityAnalysisResult;
export declare function analyzeExternalSriHtml(htmlContent: string, enableFix: boolean): ModernSecurityAnalysisResult;
export declare function analyzeGithubActionsWorkflowYaml(yamlContent: string, enableFix: boolean): ModernSecurityAnalysisResult;
export { computeRawLineOffsets, getRawSpanFromAstNode };