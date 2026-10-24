import { BANNED_CLI_PACKAGES, UTIL_MODULE_SPECIFIERS, getStaticStringValue, unwrapCliExpression } from "../cliContractHeuristics.js";
import ts from "typescript";
// src/analyzers/cliContracts/detectors/bannedParserDetector.ts
/**
* src/analyzers/cliContracts/detectors/bannedParserDetector.ts
*
* cli-contracts-banned-parser-library: Detects imports or requires of unauthorized
* third-party CLI parsers (`minimist`, `yargs`, `commander`, `cac`, `mri`, `clipanion`)
* or raw `node:util` `parseArgs` usage outside the canonical Citty harness.
*/
const BANNED_PARSER_MESSAGE = "Unauthorized CLI parser library or manual 'node:util.parseArgs' usage detected. Every CLI command must be declared exclusively via 'citty' ('defineCommand' / 'runMain') or the canonical 'cittyHarness.ts'.";
function isBannedPackageSpecifier(specifier) {
	if (!specifier) return false;
	return BANNED_CLI_PACKAGES.has(specifier);
}
function isUtilParseArgsImport(node) {
	const spec = getStaticStringValue(node.moduleSpecifier);
	if (!spec || !UTIL_MODULE_SPECIFIERS.has(spec)) return null;
	const bindings = node.importClause?.namedBindings;
	if (bindings && ts.isNamedImports(bindings)) {
		for (const el of bindings.elements) if ((el.propertyName ?? el.name).text === "parseArgs") return el;
	}
	return null;
}
function isRequireBannedPackageCall(node) {
	const callee = unwrapCliExpression(node.expression);
	if (!ts.isIdentifier(callee) || callee.text !== "require") return false;
	return isBannedPackageSpecifier(getStaticStringValue(node.arguments[0]));
}
function isUtilParseArgsCall(node) {
	const callee = unwrapCliExpression(node.expression);
	if (ts.isPropertyAccessExpression(callee) && callee.name.text === "parseArgs" && ts.isIdentifier(callee.expression) && callee.expression.text === "util") return true;
	return false;
}
const bannedParserDetector = (node, ctx) => {
	if (ctx.isAuthorizedHarness) return null;
	if (ts.isImportDeclaration(node)) {
		if (isBannedPackageSpecifier(getStaticStringValue(node.moduleSpecifier))) return {
			ruleId: "cli-contracts-banned-parser-library",
			node,
			message: BANNED_PARSER_MESSAGE
		};
		const parseArgsSpec = isUtilParseArgsImport(node);
		if (parseArgsSpec) return {
			ruleId: "cli-contracts-banned-parser-library",
			node: parseArgsSpec,
			message: BANNED_PARSER_MESSAGE
		};
	}
	if (ts.isCallExpression(node)) {
		if (isRequireBannedPackageCall(node) || isUtilParseArgsCall(node)) return {
			ruleId: "cli-contracts-banned-parser-library",
			node,
			message: BANNED_PARSER_MESSAGE
		};
	}
	return null;
};
export { bannedParserDetector };
