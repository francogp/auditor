import { describe, it, expect } from 'vite-plus/test';

import { ParamPermutationMapper } from '../../../src/core/refactor/paramPermutationMapper.ts';

describe('ParamPermutationMapper', () => {
  it('computes index permutation between canonical params and instance args', () => {
    const canonical = ['attacker', 'defender', 'move'];
    const instance = ['defender', 'attacker', 'move'];

    const perm = ParamPermutationMapper.computePermutation(canonical, instance);
    expect(perm).toEqual([1, 0, 2]);
  });

  it('returns -1 for parameters not present in the instance args', () => {
    const canonical = ['attacker', 'defender', 'weather'];
    const instance = ['attacker', 'defender'];

    const perm = ParamPermutationMapper.computePermutation(canonical, instance);
    expect(perm).toEqual([0, 1, -1]);
  });

  it('aligns instance arguments in canonical order using bindings dictionary', () => {
    const canonical = ['userType', 'targetType', 'isCritical'];
    const bindings = {
      targetType: 'defender.types[0]',
      userType: 'pokemon.primaryType',
      isCritical: 'true'
    };

    const aligned = ParamPermutationMapper.alignArguments(canonical, bindings);
    expect(aligned).toEqual(['pokemon.primaryType', 'defender.types[0]', 'true']);
  });

  it('falls back to defaultFallback when argument is missing in bindings', () => {
    const canonical = ['a', 'b', 'c'];
    const bindings = { a: '1', c: '3' };

    const aligned = ParamPermutationMapper.alignArguments(canonical, bindings, 'null');
    expect(aligned).toEqual(['1', 'null', '3']);
  });

  it('generates complete aligned call expression and detects permutation', () => {
    const canonical = ['userType', 'targetType'];
    const reversedBindings = {
      targetType: 'target.type',
      userType: 'attacker.type'
    };

    const result = ParamPermutationMapper.generateAlignedCall(
      'calculateStabMultiplier',
      canonical,
      reversedBindings
    );

    expect(result.functionName).toBe('calculateStabMultiplier');
    expect(result.alignedArguments).toEqual(['attacker.type', 'target.type']);
    expect(result.callExpressionCode).toBe('calculateStabMultiplier(attacker.type, target.type)');
    expect(result.isPermuted).toBe(true);
  });

  it('infers parameter mapping using semantic alias dictionary', () => {
    const canonical = ['user', 'target'];
    const instanceVars = ['attacker', 'defender'];
    const aliases = {
      user: ['attacker', 'source', 'pokemon'],
      target: ['defender', 'opponent', 'victim']
    };

    const mapping = ParamPermutationMapper.inferMappingFromAliases(
      canonical,
      instanceVars,
      aliases
    );

    expect(mapping).toEqual({
      user: 'attacker',
      target: 'defender'
    });
  });
});
