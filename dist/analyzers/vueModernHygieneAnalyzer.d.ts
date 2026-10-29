import { SharedAstContext } from "../core/astContext.js";
import ts from "typescript";
export declare const MODERN_VUE_HYGIENE_RULES: readonly ["ime-unsafe-enter-submit", "vue-template-no-side-effects"];
export type ModernVueHygieneRuleId = (typeof MODERN_VUE_HYGIENE_RULES)[number];
export interface ModernVueHygieneFinding {
  readonly ruleId: ModernVueHygieneRuleId;
  readonly line: number;
  readonly message: string;
  readonly context: string;
  readonly fixable: boolean;
}
export interface ModernVueHygieneAnalysisResult {
  readonly findings: readonly ModernVueHygieneFinding[];
  readonly fixedContent?: string;
}
export declare function analyzeImeSafeEnterInScriptAst(rawContent: string, sf: ts.SourceFile, enableFix: boolean): ModernVueHygieneAnalysisResult;
export interface TemplateBindingExpression {
  readonly expression: string;
  /** 0-based character offset in full file content where `expression` starts */
  readonly absoluteOffset: number;
  readonly isEventDirective: boolean;
}
declare const ROOT_CONTAINER_TAGS_LIST: readonly ["HTML", "HEAD", "BODY"];
export type RootContainerTag = (typeof ROOT_CONTAINER_TAGS_LIST)[number];
declare const VUE_DYNAMIC_DIRECTIVES_LIST: readonly ["v-if", "v-else-if", "v-show", "v-for", "v-model"];
export type VueDynamicDirective = (typeof VUE_DYNAMIC_DIRECTIVES_LIST)[number];
export declare function extractTemplatePureBindingExpressions(templateContent: string, templateContentStartOffset: number): TemplateBindingExpression[];
export declare function analyzeTemplateSideEffectsAst(fullFileContent: string, templateContent: string, templateContentStartOffset: number, astContext: SharedAstContext, enableFix: boolean): ModernVueHygieneAnalysisResult;
export {};