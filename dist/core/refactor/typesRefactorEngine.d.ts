import { AuditEngineConfig } from "../auditConfigTypes.js";
import { BaseRefactorEngine } from "./baseRefactorEngine.js";
import { TypesFindingItem, TypesRefactorPlan } from "./refactorContracts.js";
import { ValidateTypeAssertionHygieneAuditor } from "../../suites/architecture/validate_type_assertion_hygiene.js";
import ts from "typescript";
export declare class TypesRefactorEngine extends BaseRefactorEngine<TypesFindingItem, TypesRefactorPlan, ValidateTypeAssertionHygieneAuditor> {
  readonly toolId = "auditor-types";
  readonly configSectionKey: "types";
  constructor(auditorOrOptions?: ValidateTypeAssertionHygieneAuditor | string | {
    projectRoot?: string;
    config?: AuditEngineConfig;
  }, _explicitConfig?: AuditEngineConfig);
  discoverInFile(filePath: string): readonly TypesFindingItem[];
  createPlan(typesPlanId: string, typesFindings: readonly TypesFindingItem[]): TypesRefactorPlan;
  applyPlan(projectRoot: string, plan: TypesRefactorPlan): {
    readonly modifiedFiles: readonly string[];
  };
  /**
   * Scans a file to discover type assertions and untyped functions using TypeScript AST.
   */
  static discoverInFile(filePath: string): readonly TypesFindingItem[];
  static resolveFunctionName(node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration, _sourceFile?: ts.SourceFile): string;
  static getFunctionHeader(node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration, sourceFile: ts.SourceFile): string;
  static inferFunctionReturnType(node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration, sourceFile: ts.SourceFile): string | null;
  static hasAsyncModifier(node: ts.Node): boolean;
  private static inferPrimitiveKeywordType;
  private static inferArrayLiteralType;
  private static inferObjectLiteralType;
  private static inferCallExpressionType;
  static inferExpressionType(expr: ts.Expression, sourceFile: ts.SourceFile): string | null;
  static isBooleanExpression(e: ts.Expression): boolean;
  static isNumberExpression(e: ts.Expression): boolean;
  static isStringExpression(e: ts.Expression): boolean;
  static getCallName(e: ts.CallExpression): string;
  static inferMultipleReturns(returnExpressions: ts.Expression[], sourceFile: ts.SourceFile): string | null;
  /**
   * Creates a deterministic refactoring plan from findings.
   */
  static buildTypeAssertionPlan(planId: string, findings: readonly TypesFindingItem[]): TypesRefactorPlan;
  static createPlan(planId: string, findings: readonly TypesFindingItem[]): TypesRefactorPlan;
  private static collectFileReplacements;
  /**
   * Deterministically applies a TypesRefactorPlan across target source files.
   */
  static applyPlan(targetDir: string, plan: TypesRefactorPlan): {
    readonly filesChanged: number;
    readonly changesApplied: number;
  };
}