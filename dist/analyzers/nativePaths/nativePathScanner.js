import { NODE_ONLY_RULES } from "./nativePathTypes.js";
import { isUrlConstruction } from "./pathLiteralHeuristics.js";
import { getNodePathFunction, isFsSinkCall, isPathOriginChain } from "./pathHeuristics.js";
import { concatDetector } from "./detectors/concatDetector.js";
import { normalizeDetector } from "./detectors/normalizeDetector.js";
import { parsingDetector } from "./detectors/parsingDetector.js";
import { containmentDetector } from "./detectors/containmentDetector.js";
import { fileUrlDetector } from "./detectors/fileUrlDetector.js";
import { urlParsingDetector } from "./detectors/urlParsingDetector.js";
import { slashDetector } from "./detectors/slashDetector.js";
import { envArgvDetector } from "./detectors/envArgvDetector.js";
import { fetchDetector } from "./detectors/fetchDetector.js";
import ts from "typescript";
// src/analyzers/nativePaths/nativePathScanner.ts
/**
* src/analyzers/nativePaths/nativePathScanner.ts
*
* Single-pass TypeScript AST scanner for validate_native_paths.
* Reuses AuditedDocument.getAst() (SharedAstContext / Vue <script> alignment),
* runs a per-file pre-pass for path-origin variables and URL validation,
* then dispatches every node to all detectors with escape-hatch and (rule, node) dedupe.
*/
const DETECTORS = [
	normalizeDetector,
	concatDetector,
	parsingDetector,
	containmentDetector,
	fileUrlDetector,
	urlParsingDetector,
	slashDetector,
	envArgvDetector,
	fetchDetector
];
const URL_VALIDATION_PROPERTIES = /* @__PURE__ */ new Set([
	"hostname",
	"origin",
	"protocol"
]);
const NODE_BUILTIN_MODULES = /* @__PURE__ */ new Set([
	"fs",
	"fs/promises",
	"path",
	"os",
	"url",
	"child_process",
	"module",
	"process",
	"stream",
	"worker_threads",
	"crypto",
	"util"
]);
const NODE_PROCESS_MEMBERS = /* @__PURE__ */ new Set(["cwd", "argv"]);
function isNodeBuiltinSpecifier(node) {
	if (!node || !ts.isStringLiteral(node)) return false;
	return node.text.startsWith("node:") || NODE_BUILTIN_MODULES.has(node.text);
}
function isNodeContextMarker(node) {
	if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return isNodeBuiltinSpecifier(node.moduleSpecifier);
	if (ts.isCallExpression(node)) {
		const callee = node.expression;
		const isRequire = ts.isIdentifier(callee) && callee.text === "require";
		const isDynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword;
		if ((isRequire || isDynamicImport) && isNodeBuiltinSpecifier(node.arguments[0])) return true;
		return getNodePathFunction(callee) !== void 0 || isFsSinkCall(node);
	}
	if (ts.isPropertyAccessExpression(node)) {
		const owner = node.expression;
		const isProcessMember = ts.isIdentifier(owner) && owner.text === "process" && NODE_PROCESS_MEMBERS.has(node.name.text);
		const isImportMetaPath = ts.isMetaProperty(owner) && (node.name.text === "dirname" || node.name.text === "filename");
		return isProcessMember || isImportMetaPath;
	}
	return ts.isIdentifier(node) && (node.text === "__dirname" || node.text === "__filename");
}
function collectFileFacts(sourceFile) {
	const pathOriginNames = /* @__PURE__ */ new Set();
	let hasUrlConstruction = false;
	let hasUrlPropertyCheck = false;
	let isNodeContext = false;
	const visit = (node) => {
		if (!isNodeContext && isNodeContextMarker(node)) isNodeContext = true;
		if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
			if (isPathOriginChain(node.initializer)) pathOriginNames.add(node.name.text);
		} else if (isUrlConstruction(node)) hasUrlConstruction = true;
		else if (ts.isPropertyAccessExpression(node) && URL_VALIDATION_PROPERTIES.has(node.name.text)) hasUrlPropertyCheck = true;
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return {
		pathOriginNames,
		hasUrlValidation: hasUrlConstruction && hasUrlPropertyCheck,
		isNodeContext
	};
}
function toViolation(doc, sourceFile, finding) {
	const pos = sourceFile.getLineAndCharacterOfPosition(finding.node.getStart(sourceFile));
	const line = pos.line + 1;
	return {
		file: doc.relPath,
		line,
		column: pos.character + 1,
		ruleId: finding.ruleId,
		message: finding.message,
		context: (doc.lines[line - 1] ?? "").trim(),
		severity: "error"
	};
}
/**
* Scans a document AST and returns every native path violation (deduplicated per rule and node).
*/
function scanNativePathAst(doc) {
	const sourceFile = doc.getAst();
	if (!sourceFile) return [];
	const facts = collectFileFacts(sourceFile);
	const ctx = {
		sourceFile,
		pathOriginNames: facts.pathOriginNames,
		hasUrlValidation: facts.hasUrlValidation,
		isNodeContext: facts.isNodeContext,
		claimed: /* @__PURE__ */ new Set()
	};
	const seen = /* @__PURE__ */ new Set();
	const violations = [];
	const visit = (node) => {
		for (const detect of DETECTORS) {
			const finding = detect(node, ctx);
			if (!finding || !ctx.isNodeContext && NODE_ONLY_RULES.has(finding.ruleId)) continue;
			const key = `${finding.ruleId}:${finding.node.pos}:${finding.node.end}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const violation = toViolation(doc, sourceFile, finding);
			violations.push(violation);
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return violations;
}
export { scanNativePathAst };
