import { AuditConfig } from "./auditConfigTypes.js";
import "./auditConfig.js";
import { DEFAULT_CANONICAL_LINT_RULES } from "./auditConfigDefaults.js";
import ts from "typescript";
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
  readonly lintPlugins: readonly string[];
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
  readonly testCoverageExclude: readonly string[];
}
export declare function extractParsedConfigSummary(fileContent: string): ParsedVitePlusConfigSummary;
export declare function extractEslintIgnoresFromAst(rawContent: string): string[];
export declare function resolveKnownViteFunctionReturnType(name: string): ts.TypeNode | null;
export declare function buildPackAstObject(): ts.ObjectLiteralExpression;
export declare function resolveDynamicTestExemptGlobs(auditConfig: AuditConfig): readonly string[];
export declare function resolveDynamicDemoExemptGlobs(auditConfig: AuditConfig): readonly string[];
export declare function resolveEffectiveLintOverrides(auditConfig: AuditConfig): readonly {
  readonly files: readonly string[];
  readonly rules?: Readonly<Record<string, unknown>>;
}[];
export declare function buildIgnorePatternsAst(ignores: readonly string[], lockedSkillsIgnores?: readonly string[]): ts.ArrayLiteralExpression;
export declare function buildLockedSkillsVariableStatement(lockedSkillsIgnores: readonly string[]): ts.VariableStatement;
export declare function collectCanonicalConfiguredRules(auditConfig: AuditConfig): ReadonlyMap<string, unknown>;
export declare function buildLintAstObject(auditConfig: AuditConfig, lintIgnores: readonly string[], lockedSkillsIgnores?: readonly string[]): ts.ObjectLiteralExpression;
export declare function buildFmtAstObject(auditConfig: AuditConfig, fmtIgnores: readonly string[], lockedSkillsIgnores?: readonly string[]): ts.ObjectLiteralExpression;
export declare function resolveVitestRoots(auditConfig: AuditConfig): readonly string[];
export declare function buildTestAstObject(auditConfig: AuditConfig): ts.ObjectLiteralExpression;
export declare function buildStagedAstObject(auditConfig: AuditConfig): ts.ObjectLiteralExpression;
export declare function printAstNode(node: ts.Node, sf?: ts.SourceFile): string;
export declare function buildRunAstObject(auditConfig?: AuditConfig): ts.ObjectLiteralExpression;
export declare function buildCanonicalVitePlusAstSource(auditConfig: AuditConfig, lintIgnores: readonly string[], fmtIgnores: readonly string[], legacyTestProperty?: ts.PropertyAssignment | null, lockedSkillsIgnores?: readonly string[], projectRoot?: string): string;
export declare function detachNodeFromSourceFile<T extends ts.Node>(node: T): T;
export declare function parseLegacyTestPropertyNode(legacyTestBlock: string): ts.PropertyAssignment | null;
export declare function toCanonicalLintRuleName(ruleName: string): string;
export declare function isRuleValueCompliant(ruleName: string, val: unknown): boolean;
export declare function buildAllowedCoverageExcludes(auditConfig: AuditConfig, projectRoot?: string): Set<string>;
export declare function printTransformedSourceFile(sf: ts.SourceFile, transformer: ts.TransformerFactory<ts.SourceFile>): string;
export declare function applyViteConfigAstTransformations(sf: ts.SourceFile, rootObj: ts.ObjectLiteralExpression, updatedRootObj: ts.ObjectLiteralExpression, lockedSkillsIgnores?: readonly string[], projectRoot?: string): {
  transformedContent: string;
  modified: boolean;
};
export declare function synchronizeViteConfigAst(fileContent: string, auditConfig: AuditConfig, lintIgnores: readonly string[], fmtIgnores: readonly string[], legacyTestProp: ts.PropertyAssignment | null, projectRoot?: string): {
  content: string;
  modified: boolean;
};
/**
 * Rewrites import/export module specifiers from 'vitest' -> 'vite-plus/test' and 'vite' -> 'vite-plus'
 * strictly via TypeScript Compiler AST spans (never touching string literals inside code or comments).
 */
export declare function rewriteModuleSpecifiersToVitePlusAst(content: string, fileName: string): string;
export interface InlineVitePluginsDetection {
  readonly hasPlugins: boolean;
  readonly isAlreadyModular: boolean;
  readonly hasInlinePlugins: boolean;
  readonly pluginsProperty?: ts.ObjectLiteralElementLike;
}
export interface ExtractVitePluginsResult {
  readonly hasPlugins: boolean;
  readonly isAlreadyModular: boolean;
  readonly viteConfigContent: string;
  readonly vitePluginsContent: string | null;
  readonly modified: boolean;
}
export declare function hasVitePluginsImportDeclaration(sf: ts.SourceFile): boolean;
export declare function createVitePluginsImportDeclaration(): ts.ImportDeclaration;
/**
 * Detects whether vite.config.ts contains inline Vite plugins vs modular vite.plugins.ts.
 */
export declare function detectInlineVitePlugins(sf: ts.SourceFile): InlineVitePluginsDetection;
/**
 * Extracts inline Vite plugins from vite.config.ts into a modular vite.plugins.ts file.
 * Returns the transformed vite.config.ts and the generated vite.plugins.ts content.
 */
export declare function extractVitePluginsToModule(viteConfigContent: string, projectRoot?: string): ExtractVitePluginsResult;
/**
 * Detects empty catch blocks (catch {}) in vite.config.ts and injects a fallback comment
 * to satisfy strict linter hygiene (eslint no-empty).
 */
export declare function sanitizeEmptyCatchClausesInViteConfig(content: string): {
  content: string;
  modified: boolean;
};
export { DEFAULT_CANONICAL_LINT_RULES as CANONICAL_LINT_RULES_MAP };