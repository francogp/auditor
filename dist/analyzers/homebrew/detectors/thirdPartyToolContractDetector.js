import ts from "typescript";
// src/analyzers/homebrew/detectors/thirdPartyToolContractDetector.ts
/**
* src/analyzers/homebrew/detectors/thirdPartyToolContractDetector.ts
*
* Detects discrepancies between third-party tool execution and the constructor contract:
* 1. If an auditor invokes external tool runners or binaries (executeNodeCli, resolvePackageBin,
*    executeCliAndReadJson, executeFallowJsonCommand, resolveFallowBinary, stylelint.lint,
*    spawnSync, execSync, execFileSync) but fails to declare `usesThirdPartyTool: true` with a valid
*    `thirdPartyToolPolicy`.
* 2. If an auditor declares `usesThirdPartyTool: true` but contains zero external tool invocations.
*/
const THIRD_PARTY_FUNCTION_NAMES = /* @__PURE__ */ new Set([
	"executeNodeCli",
	"resolvePackageBin",
	"executeCliAndReadJson",
	"executeCliToFile",
	"executeFallowJsonCommand",
	"resolveFallowBinary",
	"runNpmAudit",
	"htmlvalidate"
]);
const SPAWN_FUNCTION_NAMES = /* @__PURE__ */ new Set([
	"spawnSync",
	"execSync",
	"execFileSync"
]);
const THIRD_PARTY_BINARY_IDENTIFIERS = /* @__PURE__ */ new Set([
	"fallow",
	"eslint",
	"stylelint",
	"markdownlint",
	"vue-tsc",
	"type-coverage",
	"knip",
	"secretlint",
	"fallowBin"
]);
function isSpawnOrExecCall(expr) {
	if (ts.isIdentifier(expr)) return SPAWN_FUNCTION_NAMES.has(expr.text);
	if (ts.isPropertyAccessExpression(expr)) return SPAWN_FUNCTION_NAMES.has(expr.name.text);
	return false;
}
function isSpawnExecutionOfThirdParty(firstArgText, secondArgText) {
	if (firstArgText.includes("cmd") || firstArgText.includes("fallowBin")) return true;
	for (const bin of THIRD_PARTY_BINARY_IDENTIFIERS) if (firstArgText.includes(bin)) return true;
	if (firstArgText.includes("npm") && secondArgText?.includes("audit")) return true;
	return false;
}
function isThirdPartyToolCall(call, sf) {
	const expr = call.expression;
	if (ts.isIdentifier(expr) && THIRD_PARTY_FUNCTION_NAMES.has(expr.text)) return true;
	if (ts.isPropertyAccessExpression(expr)) {
		if (expr.expression.getText(sf) === "stylelint" && expr.name.text === "lint") return true;
	}
	if (isSpawnOrExecCall(expr)) {
		const firstArg = call.arguments[0];
		if (!firstArg) return false;
		const firstArgText = firstArg.getText(sf);
		const secondArgText = call.arguments[1]?.getText(sf);
		return isSpawnExecutionOfThirdParty(firstArgText, secondArgText);
	}
	return false;
}
function detectThirdPartyToolInvocationsAst(sf) {
	let found = false;
	function visit(node) {
		if (found) return;
		if (ts.isCallExpression(node) && isThirdPartyToolCall(node, sf)) {
			found = true;
			return;
		}
		ts.forEachChild(node, visit);
	}
	visit(sf);
	return found;
}
function isAuditorClass(node, sf) {
	const heritageClauses = node.heritageClauses;
	if (!heritageClauses) return false;
	return heritageClauses.some((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword && clause.types.some((t) => {
		const text = t.expression.getText(sf);
		return text === "BaseAuditor" || text === "FileScanAuditor";
	}));
}
function findSuperOptionsObject(ctor) {
	if (!ctor.body) return null;
	for (const stmt of ctor.body.statements) if (ts.isExpressionStatement(stmt) && ts.isCallExpression(stmt.expression) && stmt.expression.expression.kind === ts.SyntaxKind.SuperKeyword) {
		const firstArg = stmt.expression.arguments[0];
		if (firstArg && ts.isObjectLiteralExpression(firstArg)) return firstArg;
	}
	return null;
}
function hasExplainSatelliteProperty(prop, sf) {
	if (!ts.isObjectLiteralExpression(prop.initializer)) return false;
	return prop.initializer.properties.some((policyProp) => {
		return policyProp.name?.getText(sf) === "explainSatelliteConfig";
	});
}
function extractContractFromOptions(optionsObj, sf, classLine) {
	let usesThirdPartyTool;
	let hasThirdPartyToolPolicy = false;
	let hasExplainSatelliteConfig = false;
	for (const prop of optionsObj.properties) {
		if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) continue;
		const propName = prop.name.getText(sf);
		if (propName === "usesThirdPartyTool" && ts.isPropertyAssignment(prop)) {
			if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) usesThirdPartyTool = true;
			else if (prop.initializer.kind === ts.SyntaxKind.FalseKeyword) usesThirdPartyTool = false;
		} else if (propName === "thirdPartyToolPolicy") {
			hasThirdPartyToolPolicy = true;
			if (ts.isPropertyAssignment(prop) && hasExplainSatelliteProperty(prop, sf)) hasExplainSatelliteConfig = true;
		}
	}
	return {
		hasConstructorWithSuper: true,
		usesThirdPartyTool,
		hasThirdPartyToolPolicy,
		hasExplainSatelliteConfig,
		classLine
	};
}
function inspectClassContract(node, sf) {
	if (!isAuditorClass(node, sf)) return null;
	const classLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
	for (const member of node.members) {
		if (!ts.isConstructorDeclaration(member)) continue;
		const optionsObj = findSuperOptionsObject(member);
		if (optionsObj) return extractContractFromOptions(optionsObj, sf, classLine);
	}
	return null;
}
function inspectConstructorContractAst(sf) {
	let result = null;
	function visit(node) {
		if (result) return;
		if (ts.isClassDeclaration(node)) {
			const contract = inspectClassContract(node, sf);
			if (contract) {
				result = contract;
				return;
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(sf);
	return result;
}
const thirdPartyToolContractDetector = {
	id: "third-party-tool-contract",
	ruleId: "auditor-third-party-tool-contract",
	ruleDescription: "Missing third-party tool contract",
	detect(context) {
		if (!context.isBuiltinSuite && !context.isExtension) return [];
		if (context.filePath.includes("/analyzers/") || context.filePath.includes("/cli/") || context.filePath.includes("/core/")) return [];
		if (!context.content.includes("class ") || !context.content.includes("extends BaseAuditor") && !context.content.includes("extends FileScanAuditor")) return [];
		const sf = ts.createSourceFile(context.filePath, context.content, ts.ScriptTarget.Latest, true);
		const contractInfo = inspectConstructorContractAst(sf);
		if (!contractInfo || !contractInfo.hasConstructorWithSuper) return [];
		const invokesExternal = detectThirdPartyToolInvocationsAst(sf);
		const declaresTrue = contractInfo.usesThirdPartyTool === true;
		const declaresFalse = contractInfo.usesThirdPartyTool === false;
		const declaresPolicy = contractInfo.hasThirdPartyToolPolicy;
		if (invokesExternal && (!declaresTrue || !declaresPolicy)) return [{
			ruleId: "auditor-third-party-tool-contract",
			line: contractInfo.classLine,
			message: "Auditor invokes external tools or binaries but fails to declare usesThirdPartyTool: true with thirdPartyToolPolicy ({ toolName, fallbackBehavior, fallbackRuleId }) in constructor.",
			context: "missing-third-party-tool-policy",
			severity: "error"
		}];
		if (!invokesExternal && declaresTrue) return [{
			ruleId: "auditor-third-party-tool-contract",
			line: contractInfo.classLine,
			message: "Auditor declares usesThirdPartyTool: true but has zero third-party tool invocations in its code. Change to usesThirdPartyTool: false.",
			context: "redundant-third-party-tool-policy",
			severity: "error"
		}];
		if (declaresTrue && !contractInfo.hasExplainSatelliteConfig) return [{
			ruleId: "auditor-third-party-tool-contract",
			line: contractInfo.classLine,
			message: "Auditor declares usesThirdPartyTool: true but fails to declare explainSatelliteConfig ({ configFile, ssotKey, undeclaredEntryRuleId, configSuiteId }) or explicit explainSatelliteConfig: undefined in thirdPartyToolPolicy.",
			context: "missing-explainSatelliteConfig",
			severity: "error"
		}];
		if (!declaresTrue && !declaresFalse) return [{
			ruleId: "auditor-third-party-tool-contract",
			line: contractInfo.classLine,
			message: "Auditor is missing mandatory usesThirdPartyTool property (true or false) in constructor.",
			context: "missing-usesThirdPartyTool",
			severity: "error"
		}];
		return [];
	}
};
export { thirdPartyToolContractDetector };
