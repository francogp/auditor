import { safeReadFileAsync } from "../core/safeUtils.js";
import { getAuditConfig } from "../core/auditConfigLoader.js";
import { isInCodeRoots, isScriptPath } from "../core/auditCodeRoots.js";
import { isDataPath, isDemoPath, isExemptFile } from "../core/auditPathPredicates.js";
import "../core/auditConfig.js";
import { toPosixRelative } from "../core/auditCoverage.js";
import { isPathContained } from "../core/safePath.js";
import { isPathIgnored } from "../core/auditorBase.js";
import { SharedAstContext } from "../core/astContext.js";
import path from "node:path";
import ts from "typescript";
//#region src/analyzers/constantAnalyzer.ts
/**
* scripts/maintenance/analyzers/constantAnalyzer.ts
*
* Scans codebase files for duplicate constant declarations across modules using TypeScript AST.
*/
const CONSTANT_ANALYZER_DESCRIPTOR = {
	id: "duplicate-constants",
	name: "Duplicate Constants Across Modules",
	category: "Constantes duplicadas entre módulos",
	aliases: [
		"duplicate-constants",
		"constants",
		"constantes",
		"constantes-duplicadas"
	]
};
const DEFAULT_IGNORED_CONSTANT_NAMES = [
	"ID",
	"NAME",
	"TYPE",
	"KEY",
	"INDEX",
	"COUNT",
	"DEFAULT",
	"SIZE",
	"MAX",
	"MIN",
	"VAL",
	"VALUE",
	"ITEM",
	"STATE",
	"MODE",
	"TAG",
	"URL",
	"PATH",
	"ERR",
	"ERROR",
	"MSG",
	"DATA",
	"INFO",
	"OPTIONS",
	"CONFIG",
	"RESULT",
	"RES",
	"REQ",
	"STATUS",
	"LEVEL",
	"STEP",
	"DELTA",
	"WIDTH",
	"HEIGHT",
	"X",
	"Y",
	"Z",
	"I",
	"J",
	"K",
	"TEST",
	"MOCK",
	"STUB",
	"DUMMY",
	"VERSION",
	"DESC",
	"TITLE",
	"LABEL",
	"ICON",
	"COLOR",
	"THEME",
	"STYLE",
	"PROPS",
	"EMITS",
	"MAP",
	"LIST",
	"ITEMS",
	"ACTIONS",
	"TYPES",
	"KEYS",
	"VALUES",
	"ROLES",
	"MODALS",
	"VIEWS",
	"COMPONENTS",
	"STORE",
	"SCHEMA",
	"KEY_CODES",
	"REF",
	"COMPOSABLE",
	"PROVIDE",
	"INJECT",
	"SLOTS",
	"SLOT"
];
function getEffectiveIgnoredConstantNames(projectRoot) {
	const custom = getAuditConfig(projectRoot).constants?.ignoredNames ?? [];
	return /* @__PURE__ */ new Set([...DEFAULT_IGNORED_CONSTANT_NAMES, ...custom]);
}
const IGNORED_CONSTANT_NAMES = new Set(DEFAULT_IGNORED_CONSTANT_NAMES);
function isValidConstantIdentifier(name, ignoredNames) {
	if (name.length < 4) return false;
	if (ignoredNames.has(name)) return false;
	return /^[A-Z0-9_]+$/.test(name);
}
function unwrapExpression(expr) {
	let current = expr;
	while (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isParenthesizedExpression(current) || ts.isNonNullExpression(current)) current = current.expression;
	return current;
}
function processVariableDeclaration(decl, sourceFile, filePath, isExported, ignoredNames) {
	if (!ts.isIdentifier(decl.name)) return null;
	const constName = decl.name.text;
	if (!isValidConstantIdentifier(constName, ignoredNames)) return null;
	const line = sourceFile.getLineAndCharacterOfPosition(decl.getStart(sourceFile)).line + 1;
	const unwrappedInitializer = decl.initializer ? unwrapExpression(decl.initializer) : null;
	return {
		name: constName,
		file: filePath,
		line,
		valueStr: unwrappedInitializer ? unwrappedInitializer.getText(sourceFile).trim() : "",
		isExported
	};
}
function extractConstantsFromStatement(statement, sourceFile, filePath, ignoredNames) {
	if (!ts.isVariableStatement(statement)) return [];
	if (!((statement.declarationList.flags & ts.NodeFlags.Const) !== 0)) return [];
	const isExported = !!statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
	const decls = [];
	for (const decl of statement.declarationList.declarations) {
		const constDecl = processVariableDeclaration(decl, sourceFile, filePath, isExported, ignoredNames);
		if (constDecl) decls.push(constDecl);
	}
	return decls;
}
/**
* Extracts top-level const declarations using TypeScript AST.
*/
function extractConstantsFromSource(sourceFile, filePath, ignoredNames) {
	const decls = [];
	const effectiveIgnored = ignoredNames ?? IGNORED_CONSTANT_NAMES;
	for (const statement of sourceFile.statements) decls.push(...extractConstantsFromStatement(statement, sourceFile, filePath, effectiveIgnored));
	return decls;
}
function isConstantAuditCandidate(filePath, projectRoot, config) {
	const isUnderRoot = isPathContained(projectRoot, filePath);
	const rel = toPosixRelative(projectRoot, filePath);
	if (isUnderRoot && isPathIgnored(rel)) return false;
	if (isDataPath(rel) || isDemoPath(rel)) return false;
	if (!isInCodeRoots(rel, config)) return false;
	if (isScriptPath(rel, config)) return false;
	if (isExemptFile(rel, config)) return false;
	if (rel.startsWith("src/suites/") || rel.startsWith("src/cli/")) return false;
	return true;
}
async function collectFileConstants(filePath, astEngine, effectiveIgnored, declarations) {
	const content = await safeReadFileAsync(filePath);
	if (!content) return;
	if (!content.includes("const ")) return;
	const constDecls = extractConstantsFromSource(astEngine.getSourceFile(filePath, content), filePath, effectiveIgnored);
	for (const decl of constDecls) {
		if (!declarations.has(decl.name)) declarations.set(decl.name, []);
		declarations.get(decl.name).push(decl);
	}
}
async function getCachedFileContent(filePath, fileContentCache) {
	const cached = fileContentCache.get(filePath);
	if (cached !== void 0) return cached;
	const content = await safeReadFileAsync(filePath) ?? "";
	fileContentCache.set(filePath, content);
	return content;
}
async function checkIsCrossImported(constName, uniqueFiles, fileContentCache) {
	if (uniqueFiles.length < 2) return false;
	const importRegex = new RegExp(`import\\s+[^;]*\\b${constName}\\b`);
	for (const file of uniqueFiles) {
		const content = await getCachedFileContent(file, fileContentCache);
		if (importRegex.test(content)) return true;
	}
	return false;
}
function createConstantViolations(constName, decls, uniqueFiles, targetConstantsDir, filter) {
	const normalizedValueA = decls[0].valueStr.replace(/\s+/g, "");
	const hasIdenticalValues = decls.every((d) => d.valueStr.replace(/\s+/g, "") === normalizedValueA);
	const fileList = uniqueFiles.map((f) => path.relative(process.cwd(), f)).join(", ");
	const violations = [];
	if (hasIdenticalValues) {
		if (filter === "divergent") return violations;
		for (const decl of decls) violations.push({
			file: decl.file,
			line: decl.line,
			message: `Duplicate constant '${constName}' with identical value declared across multiple modules (${fileList}). MUST be modularized into ${targetConstantsDir} for reuse.`,
			context: constName,
			severity: "error",
			fixable: false
		});
	} else {
		if (filter === "identical") return violations;
		for (const decl of decls) violations.push({
			file: decl.file,
			line: decl.line,
			message: `Constant '${constName}' declared with different values across multiple modules (${fileList}). Check for potential bug or unify/rename according to subdomain.`,
			context: constName,
			severity: "error",
			fixable: false
		});
	}
	return violations;
}
async function detectDuplicateConstants(files, astContext, projectRoot = process.cwd(), filter) {
	const declarations = /* @__PURE__ */ new Map();
	const astEngine = astContext ?? new SharedAstContext();
	const config = getAuditConfig(projectRoot);
	const targetConstantsDir = "un módulo compartido de constantes";
	const effectiveIgnored = getEffectiveIgnoredConstantNames(projectRoot);
	for (const filePath of files) {
		if (!isConstantAuditCandidate(filePath, projectRoot, config)) continue;
		await collectFileConstants(filePath, astEngine, effectiveIgnored, declarations);
	}
	const fileContentCache = /* @__PURE__ */ new Map();
	const violations = [];
	for (const [constName, decls] of declarations.entries()) {
		const uniqueFiles = Array.from(new Set(decls.map((d) => d.file)));
		if (uniqueFiles.length <= 1) continue;
		if (!await checkIsCrossImported(constName, uniqueFiles, fileContentCache)) violations.push(...createConstantViolations(constName, decls, uniqueFiles, targetConstantsDir, filter));
	}
	return violations;
}
//#endregion
export { CONSTANT_ANALYZER_DESCRIPTOR, DEFAULT_IGNORED_CONSTANT_NAMES, IGNORED_CONSTANT_NAMES, detectDuplicateConstants, extractConstantsFromSource, getEffectiveIgnoredConstantNames };
