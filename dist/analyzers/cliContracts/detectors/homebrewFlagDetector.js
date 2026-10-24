import { KNOWN_BARE_MODE_FLAGS } from "../../../core/cli/cittyHarness.js";
import { CLI_ARG_COLLECTION_NAMES, CLI_ARG_ITEM_NAMES, getStaticStringValue, unwrapCliExpression } from "../cliContractHeuristics.js";
import ts from "typescript";
// src/analyzers/cliContracts/detectors/homebrewFlagDetector.ts
/**
* src/analyzers/cliContracts/detectors/homebrewFlagDetector.ts
*
* cli-contracts-homebrew-flag-parsing: Detects hand-rolled flag normalization,
* `.startsWith('--')`, `.includes('--flag')`, `BOOLEAN_FLAGS` mapping, or manual
* positional subcommand extraction (`args[0]`) instead of Citty's declarative schema.
*/
const HOMEBREW_FLAG_MESSAGE = "Homebrew CLI flag or subcommand parsing detected (startsWith('--'), includes('--flag'), BOOLEAN_FLAGS, or manual args[0] extraction). Declare typed options and subCommands in 'defineCommand' (citty) or 'cittyHarness.ts'.";
function isArgItemReceiver(expr) {
	const target = unwrapCliExpression(expr);
	if (ts.isIdentifier(target)) return CLI_ARG_ITEM_NAMES.has(target.text);
	if (ts.isElementAccessExpression(target)) {
		const arr = unwrapCliExpression(target.expression);
		return ts.isIdentifier(arr) && CLI_ARG_COLLECTION_NAMES.has(arr.text);
	}
	return false;
}
function isArgCollectionReceiver(expr) {
	const target = unwrapCliExpression(expr);
	return ts.isIdentifier(target) && CLI_ARG_COLLECTION_NAMES.has(target.text);
}
function isFlagStartsWithCall(node) {
	const callee = unwrapCliExpression(node.expression);
	if (!ts.isPropertyAccessExpression(callee)) return false;
	if (callee.name.text !== "startsWith") return false;
	const firstArg = getStaticStringValue(node.arguments[0]);
	if (!firstArg) return false;
	return (firstArg === "-" || firstArg === "--" || firstArg.startsWith("--") || firstArg.includes("=")) && isArgItemReceiver(callee.expression);
}
function isFlagCollectionIncludesCall(node) {
	const callee = unwrapCliExpression(node.expression);
	if (!ts.isPropertyAccessExpression(callee)) return false;
	const method = callee.name.text;
	if (method !== "includes" && method !== "has") return false;
	const receiver = unwrapCliExpression(callee.expression);
	if (ts.isIdentifier(receiver) && receiver.text === "BOOLEAN_FLAGS") return true;
	if (method === "includes" && isArgCollectionReceiver(receiver)) {
		const argVal = getStaticStringValue(node.arguments[0]);
		if (!argVal) return false;
		return argVal.startsWith("-") || KNOWN_BARE_MODE_FLAGS.has(argVal);
	}
	return false;
}
function isFlagItemIncludesCall(node) {
	const callee = unwrapCliExpression(node.expression);
	if (!ts.isPropertyAccessExpression(callee)) return false;
	if (callee.name.text !== "includes") return false;
	const firstArg = getStaticStringValue(node.arguments[0]);
	if (!firstArg || !firstArg.includes("=")) return false;
	return isArgItemReceiver(callee.expression);
}
function isFirstArgIndexAccess(expr) {
	const target = unwrapCliExpression(expr);
	if (!ts.isElementAccessExpression(target)) return false;
	const arr = unwrapCliExpression(target.expression);
	const idx = unwrapCliExpression(target.argumentExpression);
	return ts.isIdentifier(arr) && CLI_ARG_COLLECTION_NAMES.has(arr.text) && ts.isNumericLiteral(idx) && idx.text === "0";
}
const homebrewFlagDetector = (node, ctx) => {
	if (ctx.isAuthorizedHarness) return null;
	if (ts.isCallExpression(node)) {
		if (isFlagStartsWithCall(node) || isFlagCollectionIncludesCall(node) || isFlagItemIncludesCall(node)) return {
			ruleId: "cli-contracts-homebrew-flag-parsing",
			node,
			message: HOMEBREW_FLAG_MESSAGE
		};
	}
	if (ts.isSwitchStatement(node) && isFirstArgIndexAccess(node.expression)) return {
		ruleId: "cli-contracts-homebrew-flag-parsing",
		node: node.expression,
		message: HOMEBREW_FLAG_MESSAGE
	};
	return null;
};
export { homebrewFlagDetector };
