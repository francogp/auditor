import { AuditConfig } from "./auditConfigTypes.js";
import ts from "typescript";
export declare const CANONICAL_LINT_RULES_MAP: Readonly<Record<string, unknown>>;
export declare function parseTsSourceFile(fileContent: string, fileName?: string): ts.SourceFile;
export declare function getPropertyKeyName(name: ts.PropertyName, sf: ts.SourceFile): string;
export declare function createPropertyNameNode(key: string, forceQuote?: boolean): ts.PropertyName;
export declare function valueToAstExpression(val: unknown, quoteObjectKeys?: boolean): ts.Expression;
export declare function astExpressionToValue(expr: ts.Expression, sf: ts.SourceFile): unknown;
export declare function findConfigRootObject(sf: ts.SourceFile): ts.ObjectLiteralExpression | null;
export declare function findPropertyAssignment(obj: ts.ObjectLiteralExpression, propName: string, sf: ts.SourceFile): ts.PropertyAssignment | null;
export declare function extractAstPropertyBlock(fileContent: string, propName: string): string | null;
export interface ParsedVitestProjectSummary {
  readonly name: string;
  readonly include: readonly string[];
}
export interface ParsedVitePlusConfigSummary {
  readonly definesFromVitePlus: boolean;
  readonly hasSection: (name: string) => boolean;
  readonly lintRules: ReadonlyMap<string, unknown>;
  readonly lintOptions: Readonly<Record<string, unknown>>;
  readonly lintJsPlugins: readonly string[];
  readonly lintIgnorePatterns: readonly string[];
  readonly fmtConfig: Readonly<Record<string, unknown>>;
  readonly fmtIgnorePatterns: readonly string[];
  readonly packConfig: Readonly<Record<string, unknown>>;
  readonly hasPackAttw: boolean;
  readonly testInclude: readonly string[];
  readonly testProjects: readonly ParsedVitestProjectSummary[];
  readonly hasTestProjects: boolean;
  readonly hasRootTestInclude: boolean;
  readonly rootTestInclude: readonly string[];
}
export declare function extractParsedConfigSummary(fileContent: string): ParsedVitePlusConfigSummary;
export declare function extractEslintIgnoresFromAst(rawContent: string): string[];
export declare function buildPackAstObject(): ts.ObjectLiteralExpression;
export declare function buildLintAstObject(auditConfig: AuditConfig, lintIgnores: readonly string[]): ts.ObjectLiteralExpression;
export declare function buildFmtAstObject(auditConfig: AuditConfig, fmtIgnores: readonly string[]): ts.ObjectLiteralExpression;
export declare function resolveVitestRoots(auditConfig: AuditConfig): readonly string[];
export declare function buildTestAstObject(auditConfig: AuditConfig): ts.ObjectLiteralExpression;
export declare function buildStagedAstObject(auditConfig: AuditConfig): ts.ObjectLiteralExpression;
export declare function printAstNode(node: ts.Node, sf?: ts.SourceFile): string;
export declare function buildCanonicalVitePlusAstSource(auditConfig: AuditConfig, lintIgnores: readonly string[], fmtIgnores: readonly string[], legacyTestProperty?: ts.PropertyAssignment | null): string;
export declare function detachNodeFromSourceFile<T extends ts.Node>(node: T): T;
export declare function parseLegacyTestPropertyNode(legacyTestBlock: string): ts.PropertyAssignment | null;
export declare function isRuleValueCompliant(ruleName: string, val: unknown): boolean;
export declare function printTransformedSourceFile(sf: ts.SourceFile, transformer: ts.TransformerFactory<ts.SourceFile>): string;
export declare function synchronizeViteConfigAst(fileContent: string, auditConfig: AuditConfig, lintIgnores: readonly string[], fmtIgnores: readonly string[], legacyTestProp: ts.PropertyAssignment | null): {
  content: string;
  modified: boolean;
};
/**
 * Rewrites import/export module specifiers from 'vitest' -> 'vite-plus/test' and 'vite' -> 'vite-plus'
 * strictly via TypeScript Compiler AST spans (never touching string literals inside code or comments).
 */
export declare function rewriteModuleSpecifiersToVitePlusAst(content: string, fileName: string): string;