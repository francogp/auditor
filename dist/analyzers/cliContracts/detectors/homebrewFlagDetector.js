import { CLI_ARG_COLLECTION_NAMES, CLI_ARG_ITEM_NAMES, getStaticStringValue, unwrapCliExpression } from "../cliContractHeuristics.js";
import ts from "typescript";
//#region src/analyzers/cliContracts/detectors/homebrewFlagDetector.ts
/**
* src/analyzers/cliContracts/detectors/homebrewFlagDetector.ts
*
* cli-contracts-homebrew-flag-parsing: Detects hand-rolled flag normalization,
* `.startsWith('--')`, `.includes('--flag')`, `BOOLEAN_FLAGS` mapping, or manual
* positional subcommand extraction (`args[0]`) instead of Citty's declarative schema.
*/
const HOMEBREW_FLAG_MESSAGE = "Homebrew CLI flag or subcommand parsing detected (startsWith('--'), includes('--flag'), BOOLEAN_FLAGS, or manual args[0] extraction). Declare typed options and subCommands in 'defineCommand' (citty) or 'cittyHarness.ts'.";
const KNOWN_BARE_MODE_FLAGS = /* @__PURE__ */ new Set([
	"human",
	"verbose",
	"format=human",
	"format=verbose"
]);
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
	if (!ts.isPropertyAccessExpression(node.expression)) return false;
	if (node.expression.name.text !== "startsWith") return false;
	const firstArg = getStaticStringValue(node.arguments[0]);
	if (!firstArg) return false;
	return (firstArg === "-" || firstArg === "--" || firstArg.startsWith("--") || firstArg === "project=") && isArgItemReceiver(node.expression.expression);
}
function isFlagCollectionIncludesCall(node) {
	if (!ts.isPropertyAccessExpression(node.expression)) return false;
	const method = node.expression.name.text;
	if (method !== "includes" && method !== "has") return false;
	const receiver = unwrapCliExpression(node.expression.expression);
	if (ts.isIdentifier(receiver) && receiver.text === "BOOLEAN_FLAGS") return true;
	if (method === "includes" && isArgCollectionReceiver(receiver)) {
		const argVal = getStaticStringValue(node.arguments[0]);
		if (!argVal) return false;
		return argVal.startsWith("-") || KNOWN_BARE_MODE_FLAGS.has(argVal);
	}
	return false;
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
		if (isFlagStartsWithCall(node) || isFlagCollectionIncludesCall(node)) return {
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
//#endregion
export { homebrewFlagDetector };
