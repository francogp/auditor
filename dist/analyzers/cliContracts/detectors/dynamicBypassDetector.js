import { unwrapCliExpression } from "../cliContractHeuristics.js";
import ts from "typescript";
// src/analyzers/cliContracts/detectors/dynamicBypassDetector.ts
/**
* src/analyzers/cliContracts/detectors/dynamicBypassDetector.ts
*
* cli-contracts-dynamic-eval-bypass: Detects dynamic code execution (`eval`, `new Function`)
* or raw file descriptor `0` stdin reads (`fs.readFileSync(0)`) that bypass static CLI contracts.
*/
const DYNAMIC_BYPASS_MESSAGE = "Dynamic CLI contract bypass detected ('eval', 'new Function', or raw stdin descriptor read 'fs.readFileSync(0)'). All CLI arguments and inputs must be statically declared via 'citty'.";
function isEvalOrFunctionCall(node) {
	const callee = unwrapCliExpression(node.expression);
	return ts.isIdentifier(callee) && (callee.text === "eval" || callee.text === "Function");
}
function isNewFunctionConstruct(node) {
	const callee = unwrapCliExpression(node.expression);
	return ts.isIdentifier(callee) && callee.text === "Function";
}
function isStdinZeroReadCall(node) {
	const callee = unwrapCliExpression(node.expression);
	if (!(ts.isIdentifier(callee) && callee.text === "readFileSync" || ts.isPropertyAccessExpression(callee) && callee.name.text === "readFileSync")) return false;
	const firstArg = node.arguments[0];
	return firstArg !== void 0 && ts.isNumericLiteral(firstArg) && firstArg.text === "0";
}
const dynamicBypassDetector = (node, ctx) => {
	if (ctx.isAuthorizedHarness) return null;
	if (ts.isCallExpression(node)) {
		if (isEvalOrFunctionCall(node) || isStdinZeroReadCall(node)) return {
			ruleId: "cli-contracts-dynamic-eval-bypass",
			node,
			message: DYNAMIC_BYPASS_MESSAGE
		};
	}
	if (ts.isNewExpression(node) && isNewFunctionConstruct(node)) return {
		ruleId: "cli-contracts-dynamic-eval-bypass",
		node,
		message: DYNAMIC_BYPASS_MESSAGE
	};
	return null;
};
export { dynamicBypassDetector };
