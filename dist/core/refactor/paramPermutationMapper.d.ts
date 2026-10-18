//#region src/core/refactor/paramPermutationMapper.d.ts
/**
 * src/core/refactor/paramPermutationMapper.ts
 *
 * CANONICAL PARAMETER PERMUTATION & BINDING MAPPER (Node.js 26+ Native)
 * Resolves argument order divergences across clone instances, generating
 * deterministic call-site parameter alignment for extracted functions.
 */
export interface ParameterBinding {
  readonly canonicalName: string;
  readonly boundExpression: string;
  readonly index: number;
}
export interface InstanceAlignmentResult {
  readonly functionName: string;
  readonly alignedArguments: readonly string[];
  readonly callExpressionCode: string;
  readonly isPermuted: boolean;
}
export declare class ParamPermutationMapper {
  /**
   * Computes the index permutation array from canonical parameter names to instance argument order.
   * Returns an array where array[canonicalIndex] = instanceIndex.
   */
  static computePermutation(canonicalParams: readonly string[], instanceArgs: readonly string[]): readonly number[];
  /**
   * Aligns instance call-site arguments into canonical function signature order.
   * If an instance passes `{ targetType: 'target.type', userType: 'pokemon.type' }`
   * and the canonical parameters are `['userType', 'targetType']`, it produces
   * `['pokemon.type', 'target.type']`.
   */
  static alignArguments(canonicalParams: readonly string[], instanceBindings: Readonly<Record<string, string>>, defaultFallback?: string): readonly string[];
  /**
   * Formats a complete call expression with aligned parameters.
   */
  static generateAlignedCall(functionName: string, canonicalParams: readonly string[], instanceBindings: Readonly<Record<string, string>>, defaultFallback?: string): InstanceAlignmentResult;
  /**
   * Infers parameter mapping from free variables of an instance against canonical parameters.
   * Supports semantic alias matching (e.g. `defender` -> `target`, `attacker` -> `user`).
   */
  static inferMappingFromAliases(canonicalParams: readonly string[], instanceVariables: readonly string[], knownAliases?: Readonly<Record<string, readonly string[]>>): Readonly<Record<string, string>>;
}
//#endregion