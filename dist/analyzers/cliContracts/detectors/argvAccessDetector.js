import { PROCESS_MODULE_SPECIFIERS, getStaticStringValue, isProcessObjectExpression, unwrapCliExpression } from "../cliContractHeuristics.js";
import ts from "typescript";
//#region src/analyzers/cliContracts/detectors/argvAccessDetector.ts
/**
* src/analyzers/cliContracts/detectors/argvAccessDetector.ts
*
* cli-contracts-direct-argv-access: Detects direct or indirect access to `process.argv`,
* `process['argv']`, destructuring `const { argv } = process`, `globalThis.process.argv`,
* `import { argv } from 'node:process'`, `Deno.args`, and `Bun.argv` outside the canonical Citty harness.
*/
const ARGV_ACCESS_MESSAGE = "Direct or indirect access to 'process.argv' (or 'Deno.args' / 'Bun.argv') detected outside the canonical Citty harness. Declare arguments and subcommands via 'defineCommand' (citty) or 'createRefactorCli' and consume the typed 'args' object in 'run({ args })'.";
function isAlternateRuntimeArgv(node) {
	const owner = unwrapCliExpression(node.expression);
	if (!ts.isIdentifier(owner)) return false;
	return owner.text === "Deno" && node.name.text === "args" || owner.text === "Bun" && node.name.text === "argv";
}
function isComputedArgvAccess(node, ctx) {
	if (!isProcessObjectExpression(node.expression, ctx)) return false;
	const arg = unwrapCliExpression(node.argumentExpression);
	if (getStaticStringValue(arg) === "argv") return true;
	return ts.isIdentifier(arg) && ctx.argvKeyConstants.has(arg.text);
}
function isObjectDestructuringArgv(node, ctx) {
	const pattern = node.parent;
	if (!ts.isObjectBindingPattern(pattern)) return false;
	const propIdentifier = node.propertyName ?? node.name;
	if (!ts.isIdentifier(propIdentifier) || propIdentifier.text !== "argv") return false;
	const decl = pattern.parent;
	if (ts.isVariableDeclaration(decl) && decl.initializer) return isProcessObjectExpression(decl.initializer, ctx);
	return false;
}
function isNamedProcessArgvImport(node) {
	if ((node.propertyName ?? node.name).text !== "argv") return false;
	const importDecl = node.parent?.parent?.parent;
	if (!importDecl || !ts.isImportDeclaration(importDecl)) return false;
	const spec = getStaticStringValue(importDecl.moduleSpecifier);
	return spec !== void 0 && PROCESS_MODULE_SPECIFIERS.has(spec);
}
const argvAccessDetector = (node, ctx) => {
	if (ctx.isAuthorizedHarness) return null;
	if (ts.isPropertyAccessExpression(node)) {
		if (node.name.text === "argv" && isProcessObjectExpression(node.expression, ctx) || isAlternateRuntimeArgv(node)) return {
			ruleId: "cli-contracts-direct-argv-access",
			node,
			message: ARGV_ACCESS_MESSAGE
		};
	}
	if (ts.isElementAccessExpression(node) && isComputedArgvAccess(node, ctx)) return {
		ruleId: "cli-contracts-direct-argv-access",
		node,
		message: ARGV_ACCESS_MESSAGE
	};
	if (ts.isBindingElement(node) && isObjectDestructuringArgv(node, ctx)) return {
		ruleId: "cli-contracts-direct-argv-access",
		node,
		message: ARGV_ACCESS_MESSAGE
	};
	if (ts.isImportSpecifier(node) && isNamedProcessArgvImport(node)) return {
		ruleId: "cli-contracts-direct-argv-access",
		node,
		message: ARGV_ACCESS_MESSAGE
	};
	return null;
};
//#endregion
export { argvAccessDetector };
