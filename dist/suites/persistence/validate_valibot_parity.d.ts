import { SharedAstContext } from "../../core/astContext.js";
import { BaseAuditor } from "../../core/auditorBase.js";
import ts from "typescript";
export type ValibotParityRuleId = 'valibot-schema-missing-field' | 'valibot-serializer-missing-field' | 'valibot-initial-state-missing-field' | 'valibot-nested-missing-field' | 'valibot-domain-type-violation' | 'valibot-redundant-nullability';
export declare const VALIBOT_PARITY_RULES: readonly ValibotParityRuleId[];
/**
 * Extracts interface property keys using TypeScript AST.
 * Correctly handles optional, readonly, and string/identifier keys.
 */
export declare function extractInterfaceKeys(sourceFile: ts.SourceFile, interfaceName: string): Set<string>;
/**
 * Extracts string literal types from a type alias union.
 */
export declare function extractEphemeralKeys(sourceFile: ts.SourceFile, typeAliasName?: string): Set<string>;
/**
 * Extracts property names from an ObjectLiteralExpression node,
 * recursively resolving spread and conditional spread expressions.
 */
export declare function extractObjectLiteralKeys(objNode: ts.ObjectLiteralExpression): Set<string>;
/**
 * Extracts property keys from a Valibot object schema declaration.
 */
export declare function extractSchemaKeys(sourceFile: ts.SourceFile, schemaVarName: string): {
  keys: Set<string>;
  declNode?: ts.VariableDeclaration;
};
/**
 * Extracts all property keys returned by serializer functions matching functionNameOrPrefix.
 */
export declare function extractSerializerKeys(sourceFile: ts.SourceFile, functionNameOrPrefix?: string): Set<string>;
/**
 * Extracts top-level keys and nested property keys from initial state factory function.
 */
export declare function extractInitialStateKeys(sourceFile: ts.SourceFile, functionName?: string): {
  topLevelKeys: Set<string>;
  nestedKeys: Map<string, Set<string>>;
};
export interface ValibotParityAuditorOptions {
  readonly projectRoot?: string;
}
export declare class ValidateValibotParityAuditor extends BaseAuditor<ValibotParityRuleId> {
  constructor(options?: ValibotParityAuditorOptions);
  runAudit(astContext?: SharedAstContext): Promise<void>;
  private auditSingleTarget;
  private computeExpectedKeys;
  private auditSchemaParity;
  private auditSerializerParity;
  private auditInitialStateParity;
  private auditNestedTargets;
  private auditSingleNestedTarget;
  private verifyNestedFieldInSchema;
  private verifyNestedFieldInInitialState;
  private iterateSchemaObjectProperties;
  private auditUnknownUsage;
  private auditRedundantNullability;
  private checkUnknownUsage;
  private checkRedundantNullability;
}