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

export class ParamPermutationMapper {
  /**
   * Computes the index permutation array from canonical parameter names to instance argument order.
   * Returns an array where array[canonicalIndex] = instanceIndex.
   */
  public static computePermutation(
    canonicalParams: readonly string[],
    instanceArgs: readonly string[]
  ): readonly number[] {
    return canonicalParams.map((param) => {
      const idx = instanceArgs.indexOf(param);
      return idx >= 0 ? idx : -1;
    });
  }

  /**
   * Aligns instance call-site arguments into canonical function signature order.
   * If an instance passes `{ targetType: 'target.type', userType: 'pokemon.type' }`
   * and the canonical parameters are `['userType', 'targetType']`, it produces
   * `['pokemon.type', 'target.type']`.
   */
  public static alignArguments(
    canonicalParams: readonly string[],
    instanceBindings: Readonly<Record<string, string>>,
    defaultFallback: string = 'undefined'
  ): readonly string[] {
    return canonicalParams.map((param) => {
      if (param in instanceBindings && instanceBindings[param] !== undefined) {
        return instanceBindings[param];
      }
      return defaultFallback;
    });
  }

  /**
   * Formats a complete call expression with aligned parameters.
   */
  public static generateAlignedCall(
    functionName: string,
    canonicalParams: readonly string[],
    instanceBindings: Readonly<Record<string, string>>,
    defaultFallback: string = 'undefined'
  ): InstanceAlignmentResult {
    const alignedArgs = this.alignArguments(canonicalParams, instanceBindings, defaultFallback);
    const originalKeys = Object.keys(instanceBindings);
    const isPermuted =
      originalKeys.length > 1 && canonicalParams.some((param, idx) => originalKeys[idx] !== param);

    return {
      functionName,
      alignedArguments: alignedArgs,
      callExpressionCode: `${functionName}(${alignedArgs.join(', ')})`,
      isPermuted
    };
  }

  /**
   * Infers parameter mapping from free variables of an instance against canonical parameters.
   * Supports semantic alias matching (e.g. `defender` -> `target`, `attacker` -> `user`).
   */
  public static inferMappingFromAliases(
    canonicalParams: readonly string[],
    instanceVariables: readonly string[],
    knownAliases: Readonly<Record<string, readonly string[]>> = {}
  ): Readonly<Record<string, string>> {
    const mapping: Record<string, string> = {};

    for (const canonical of canonicalParams) {
      // 1. Direct name match
      if (instanceVariables.includes(canonical)) {
        mapping[canonical] = canonical;
        continue;
      }

      // 2. Known aliases match
      const aliases = knownAliases[canonical] ?? [];
      const foundAlias = aliases.find((a) => instanceVariables.includes(a));
      if (foundAlias) {
        mapping[canonical] = foundAlias;
      }
    }

    return mapping;
  }
}
