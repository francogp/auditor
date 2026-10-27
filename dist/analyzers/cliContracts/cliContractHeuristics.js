import ts from "typescript";
// src/analyzers/cliContracts/cliContractHeuristics.ts
/**
* src/analyzers/cliContracts/cliContractHeuristics.ts
*
* Pure TypeScript AST predicates shared across CLI contract detectors.
*/
const GLOBAL_HOST_OBJECTS = /* @__PURE__ */ new Set([
	"global",
	"globalThis",
	"window",
	"self"
]);
const PROCESS_MODULE_SPECIFIERS = /* @__PURE__ */ new Set(["process", "node:process"]);
const UTIL_MODULE_SPECIFIERS = /* @__PURE__ */ new Set(["util", "node:util"]);
const BANNED_CLI_PACKAGES = /* @__PURE__ */ new Set([
	"minimist",
	"yargs",
	"yargs/helpers",
	"commander",
	"cac",
	"mri",
	"arg",
	"meow",
	"clipanion",
	"sade",
	"caporal"
]);
const CLI_ARG_COLLECTION_NAMES = /* @__PURE__ */ new Set([
	"args",
	"rawArgs",
	"cliArgs",
	"argv",
	"rawCliArgs",
	"posArgs",
	"posList",
	"positionals",
	"nonProjectPositionals"
]);
const CLI_ARG_ITEM_NAMES = /* @__PURE__ */ new Set([
	"arg",
	"a",
	"p",
	"rawArg",
	"token",
	"flag",
	"opt"
]);
const CANONICAL_CITTY_BUILDERS = /* @__PURE__ */ new Set([
	"defineCommand",
	"runMain",
	"runCommand",
	"createRefactorCli",
	"runRefactorCliHarness",
	"createAuditorCli",
	"runAuditorCli",
	"runCliIfMain",
	"parseCittyArgs"
]);
/**
* Unwraps parenthesized expressions, type assertions, non-null expressions, and satisfies.
*/
function unwrapCliExpression(expr) {
	let current = expr;
	while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isNonNullExpression(current) || ts.isSatisfiesExpression(current)) current = current.expression;
	return current;
}
/**
* Checks whether `process` is locally shadowed in an enclosing lexical scope.
*/
function isProcessShadowedAt(node, shadowedScopes) {
	if (shadowedScopes.size === 0) return false;
	let current = node.parent;
	while (current) {
		if (shadowedScopes.has(current)) return true;
		current = current.parent;
	}
	return false;
}
/**
* Checks whether an expression resolves to the Node.js `process` object (direct, global, or alias).
*/
function isProcessObjectExpression(rawExpr, ctx) {
	const expr = unwrapCliExpression(rawExpr);
	if (ts.isIdentifier(expr)) {
		if (expr.text === "process") return !isProcessShadowedAt(expr, ctx.shadowedProcessScopes);
		return ctx.processAliases.has(expr.text) || ctx.dynamicProcessParamNodes.has(expr);
	}
	if (ts.isPropertyAccessExpression(expr) && expr.name.text === "process") {
		const host = unwrapCliExpression(expr.expression);
		return ts.isIdentifier(host) && GLOBAL_HOST_OBJECTS.has(host.text);
	}
	return false;
}
/**
* Extracts the string value from a StringLiteral or NoSubstitutionTemplateLiteral.
*/
function getStaticStringValue(node) {
	if (!node) return void 0;
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
}
export { BANNED_CLI_PACKAGES, CANONICAL_CITTY_BUILDERS, CLI_ARG_COLLECTION_NAMES, CLI_ARG_ITEM_NAMES, GLOBAL_HOST_OBJECTS, PROCESS_MODULE_SPECIFIERS, UTIL_MODULE_SPECIFIERS, getStaticStringValue, isProcessObjectExpression, unwrapCliExpression };
