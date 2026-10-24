import { CANONICAL_CITTY_BUILDERS, GLOBAL_HOST_OBJECTS, PROCESS_MODULE_SPECIFIERS, getStaticStringValue, unwrapCliExpression } from "./cliContractHeuristics.js";
import { argvAccessDetector } from "./detectors/argvAccessDetector.js";
import { bannedParserDetector } from "./detectors/bannedParserDetector.js";
import { cittyContractDetector } from "./detectors/cittyContractDetector.js";
import { dynamicBypassDetector } from "./detectors/dynamicBypassDetector.js";
import { homebrewFlagDetector } from "./detectors/homebrewFlagDetector.js";
import { unregisteredScriptDetector } from "./detectors/unregisteredScriptDetector.js";
import path from "node:path";
import ts from "typescript";
// src/analyzers/cliContracts/cliContractScanner.ts
/**
* src/analyzers/cliContracts/cliContractScanner.ts
*
* Single-pass TypeScript AST scanner for validate_cli_contracts.
* Collects per-file symbol facts (process aliases, shadowing, dynamic imports,
* Citty contract presence) and dispatches every AST node to the 5 detectors.
*/
const CLI_CONTRACT_DETECTORS = [
	argvAccessDetector,
	bannedParserDetector,
	homebrewFlagDetector,
	dynamicBypassDetector,
	cittyContractDetector,
	unregisteredScriptDetector
];
const AUTHORIZED_HARNESS_PATHS = /* @__PURE__ */ new Set(["src/core/cli/cittyHarness.ts", "src/cli/cliUtils.ts"]);
function findEnclosingScope(node) {
	let current = node.parent;
	while (current) {
		if (ts.isBlock(current) || ts.isSourceFile(current) || ts.isFunctionLike(current) || ts.isModuleBlock(current)) return current;
		current = current.parent;
	}
	return node;
}
function isGlobalProcessInitializer(expr) {
	const unwrapped = unwrapCliExpression(expr);
	if (ts.isIdentifier(unwrapped) && unwrapped.text === "process") return true;
	if (ts.isPropertyAccessExpression(unwrapped) && unwrapped.name.text === "process") {
		const owner = unwrapCliExpression(unwrapped.expression);
		return ts.isIdentifier(owner) && GLOBAL_HOST_OBJECTS.has(owner.text);
	}
	return false;
}
function isDynamicProcessImportThen(node) {
	if (!ts.isPropertyAccessExpression(node.expression)) return null;
	if (node.expression.name.text !== "then") return null;
	const receiver = unwrapCliExpression(node.expression.expression);
	if (!ts.isCallExpression(receiver)) return null;
	if (receiver.expression.kind !== ts.SyntaxKind.ImportKeyword) return null;
	const spec = getStaticStringValue(receiver.arguments[0]);
	if (!spec || !PROCESS_MODULE_SPECIFIERS.has(spec)) return null;
	const callback = node.arguments[0];
	if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) return callback;
	return null;
}
function collectDynamicCallbackParamUsages(fn, targetSet) {
	const firstParam = fn.parameters[0];
	if (!firstParam || !ts.isIdentifier(firstParam.name)) return;
	const paramName = firstParam.name.text;
	const collectParamRefs = (n) => {
		if (ts.isIdentifier(n) && n.text === paramName && n !== firstParam.name) targetSet.add(n);
		ts.forEachChild(n, collectParamRefs);
	};
	collectParamRefs(fn.body ?? fn);
}
function inspectCliImportFact(node, processAliases) {
	const spec = getStaticStringValue(node.moduleSpecifier);
	if (spec && PROCESS_MODULE_SPECIFIERS.has(spec)) {
		const clause = node.importClause;
		if (clause?.name) processAliases.add(clause.name.text);
		if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) processAliases.add(clause.namedBindings.name.text);
	}
}
function inspectCliVariableFact(node, processAliases, argvKeyConstants, shadowedProcessScopes) {
	if (!ts.isIdentifier(node.name)) return;
	const varName = node.name.text;
	if (!node.initializer) {
		if (varName === "process") shadowedProcessScopes.add(findEnclosingScope(node));
		return;
	}
	if (isGlobalProcessInitializer(node.initializer)) processAliases.add(varName);
	else if (varName === "process") shadowedProcessScopes.add(findEnclosingScope(node));
	if (getStaticStringValue(unwrapCliExpression(node.initializer)) === "argv") argvKeyConstants.add(varName);
}
function inspectCliCallFact(node, dynamicProcessParamNodes) {
	const callee = unwrapCliExpression(node.expression);
	let isMainCall = false;
	let isCittyCall = false;
	let builderName = null;
	if (ts.isIdentifier(callee)) {
		isMainCall = callee.text === "isMainModule";
		if (CANONICAL_CITTY_BUILDERS.has(callee.text)) builderName = callee.text;
	} else if (ts.isPropertyAccessExpression(callee)) {
		if (CANONICAL_CITTY_BUILDERS.has(callee.name.text)) builderName = callee.name.text;
	}
	if (builderName) {
		if (builderName === "parseCittyArgs") {
			const firstArg = node.arguments[0] ? unwrapCliExpression(node.arguments[0]) : null;
			isCittyCall = Boolean(firstArg && (ts.isObjectLiteralExpression(firstArg) || ts.isIdentifier(firstArg)));
		} else isCittyCall = true;
	}
	const dynamicCb = isDynamicProcessImportThen(node);
	if (dynamicCb) collectDynamicCallbackParamUsages(dynamicCb, dynamicProcessParamNodes);
	return {
		isMainCall,
		isCittyCall
	};
}
function collectCliFileFacts(sourceFile, relPath, rawText) {
	const processAliases = /* @__PURE__ */ new Set();
	const argvKeyConstants = /* @__PURE__ */ new Set();
	const shadowedProcessScopes = /* @__PURE__ */ new Set();
	const dynamicProcessParamNodes = /* @__PURE__ */ new Set();
	let hasIsMainModuleCall = rawText.startsWith("#!");
	let hasCittyContract = false;
	const inspectNode = (node) => {
		if (ts.isImportDeclaration(node)) inspectCliImportFact(node, processAliases);
		else if (ts.isVariableDeclaration(node)) inspectCliVariableFact(node, processAliases, argvKeyConstants, shadowedProcessScopes);
		else if (ts.isCallExpression(node)) {
			const callFlags = inspectCliCallFact(node, dynamicProcessParamNodes);
			if (callFlags.isMainCall) hasIsMainModuleCall = true;
			if (callFlags.isCittyCall) hasCittyContract = true;
		}
		ts.forEachChild(node, inspectNode);
	};
	inspectNode(sourceFile);
	const normalizedRel = relPath.replaceAll(path.win32.sep, path.posix.sep);
	return {
		isCliEntrypoint: (normalizedRel.startsWith("src/cli/") || normalizedRel.startsWith("cli/")) && hasIsMainModuleCall,
		hasCittyContract,
		processAliases,
		argvKeyConstants,
		shadowedProcessScopes,
		dynamicProcessParamNodes
	};
}
function formatCliViolation(doc, sourceFile, finding) {
	const startOffset = ts.isSourceFile(finding.node) ? 0 : finding.node.getStart(sourceFile);
	const loc = sourceFile.getLineAndCharacterOfPosition(startOffset);
	const lineNumber = loc.line + 1;
	return {
		file: doc.relPath,
		line: lineNumber,
		column: loc.character + 1,
		ruleId: finding.ruleId,
		message: finding.message,
		context: (doc.lines[lineNumber - 1] ?? "").trim(),
		severity: "error"
	};
}
/**
* Scans an AuditedDocument AST and returns all CLI contract violations.
*/
function scanCliContractAst(doc) {
	const sourceFile = doc.getAst();
	if (!sourceFile) return [];
	const normalizedRel = doc.relPath.replaceAll(path.win32.sep, path.posix.sep);
	const isAuthorizedHarness = AUTHORIZED_HARNESS_PATHS.has(normalizedRel);
	const facts = collectCliFileFacts(sourceFile, normalizedRel, doc.rawContent);
	const ctx = {
		sourceFile,
		relPath: normalizedRel,
		isCliEntrypoint: facts.isCliEntrypoint,
		isAuthorizedHarness,
		hasCittyContract: facts.hasCittyContract,
		processAliases: facts.processAliases,
		argvKeyConstants: facts.argvKeyConstants,
		shadowedProcessScopes: facts.shadowedProcessScopes,
		dynamicProcessParamNodes: facts.dynamicProcessParamNodes,
		claimed: /* @__PURE__ */ new Set()
	};
	const emittedKeys = /* @__PURE__ */ new Set();
	const cliViolations = [];
	const traverseCliAst = (node) => {
		for (const runDetector of CLI_CONTRACT_DETECTORS) {
			const candidate = runDetector(node, ctx);
			if (!candidate) continue;
			const dedupeKey = `${candidate.ruleId}@${candidate.node.pos}-${candidate.node.end}`;
			if (emittedKeys.has(dedupeKey)) continue;
			emittedKeys.add(dedupeKey);
			const formatted = formatCliViolation(doc, sourceFile, candidate);
			if (formatted) cliViolations.push(formatted);
		}
		ts.forEachChild(node, traverseCliAst);
	};
	traverseCliAst(sourceFile);
	return cliViolations;
}
export { scanCliContractAst };
