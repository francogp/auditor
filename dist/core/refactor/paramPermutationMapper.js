//#region src/core/refactor/paramPermutationMapper.ts
var ParamPermutationMapper = class {
	/**
	* Computes the index permutation array from canonical parameter names to instance argument order.
	* Returns an array where array[canonicalIndex] = instanceIndex.
	*/
	static computePermutation(canonicalParams, instanceArgs) {
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
	static alignArguments(canonicalParams, instanceBindings, defaultFallback = "undefined") {
		return canonicalParams.map((param) => {
			if (param in instanceBindings && instanceBindings[param] !== void 0) return instanceBindings[param];
			return defaultFallback;
		});
	}
	/**
	* Formats a complete call expression with aligned parameters.
	*/
	static generateAlignedCall(functionName, canonicalParams, instanceBindings, defaultFallback = "undefined") {
		const alignedArgs = this.alignArguments(canonicalParams, instanceBindings, defaultFallback);
		const originalKeys = Object.keys(instanceBindings);
		const isPermuted = originalKeys.length > 1 && canonicalParams.some((param, idx) => originalKeys[idx] !== param);
		return {
			functionName,
			alignedArguments: alignedArgs,
			callExpressionCode: `${functionName}(${alignedArgs.join(", ")})`,
			isPermuted
		};
	}
	/**
	* Infers parameter mapping from free variables of an instance against canonical parameters.
	* Supports semantic alias matching (e.g. `defender` -> `target`, `attacker` -> `user`).
	*/
	static inferMappingFromAliases(canonicalParams, instanceVariables, knownAliases = {}) {
		const mapping = {};
		for (const canonical of canonicalParams) {
			if (instanceVariables.includes(canonical)) {
				mapping[canonical] = canonical;
				continue;
			}
			const foundAlias = (knownAliases[canonical] ?? []).find((a) => instanceVariables.includes(a));
			if (foundAlias) mapping[canonical] = foundAlias;
		}
		return mapping;
	}
};
//#endregion
export { ParamPermutationMapper };
