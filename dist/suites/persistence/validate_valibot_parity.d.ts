/**
 * src/suites/persistence/validate_valibot_parity.ts
 *
 * VALIBOT SCHEMA & PERSISTENCE PARITY SUB-AUDITOR (Node.js 26+ Native)
 *
 * Enforces 100% bidirectional parity between:
 *   1. State / domain TypeScript interfaces (e.g. GameState, UserProfile)
 *   2. Valibot validation schemas (e.g. saveDataSchema, userProfileSchema)
 *   3. Persistence serializer functions (e.g. serializeState, serializeProfile)
 *   4. Base initial state factories (e.g. createInitialGameState, createInitialProfile)
 *   5. Nested sub-structures (e.g. PlayerClassState, ActiveMission)
 *
 * Governance Rules:
 *   - valibot-schema-missing-field: Any non-ephemeral property missing from schema is a FATAL ERROR (Valibot strips it).
 *   - valibot-serializer-missing-field: Any property missing from serializer is a FATAL ERROR (Lost on save).
 *   - valibot-initial-state-missing-field: Any property missing from initial state is a FATAL ERROR (Undefined on new save).
 *   - valibot-nested-missing-field: Any property missing from nested schema/serializer/initial state is a FATAL ERROR.
 *   - valibot-domain-type-violation: Any loose unknown() in schema is a FATAL ERROR under /domain-type-first.
 *   - valibot-redundant-nullability: Redundant optional(nullable(...)) soup in schemas produces an advisory WARNING.
 *
 * Configuration:
 *   Governed dynamically in .auditor/audit.config.ts via `valibot: { enabled: true, targets: [...] }`.
 */
import ts from 'typescript';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { SharedAstContext } from '../../core/astContext.ts';
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
    private auditSchemaQuality;
    private checkUnknownUsage;
    private checkRedundantNullability;
}
//# sourceMappingURL=validate_valibot_parity.d.ts.map