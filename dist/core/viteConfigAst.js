import { CANONICAL_DYNAMIC_DEMO_OVERRIDE_RULES, CANONICAL_DYNAMIC_SCRIPT_OVERRIDE_RULES, CANONICAL_DYNAMIC_TEST_OVERRIDE_RULES, CANONICAL_DYNAMIC_TOOLING_OVERRIDE_RULES, DEFAULT_AUDIT_CONFIG, DEFAULT_CANONICAL_LINT_RULES, DEFAULT_VITE_PLUS_AUDIT_CONFIG } from "./auditConfigDefaults.js";
import { normalizePosixPath } from "./reportUtils.js";
import { getEffectiveIgnoreGlobs, getLockedSkillsIgnoreGlobs } from "./canonicalIgnoreRegistry.js";
import { isPatternContainedInGlobs } from "./globContainment.js";
import { isPathContained, stripGlobSuffix } from "./safePath.js";
import { getAllowedSatellitePathExcludes } from "./satelliteGlobMatcher.js";
import path from "node:path";
import fs from "node:fs";
import ts from "typescript";
// src/core/viteConfigAst.ts
/**
* packages/auditor/src/core/viteConfigAst.ts
*
* Pure TypeScript Compiler AST engine for reading, inspecting, constructing,
* and transforming vite.config.ts and legacy ESLint/Vitest configuration files.
* Zero regex or manual string manipulation.
*/
function normalizePosixRoot(rawRoot) {
	return (stripGlobSuffix(normalizePosixPath(rawRoot)) || ".").toLowerCase();
}
function isPathUnderRoot(candidatePath, rootDir, baseDir = process.cwd()) {
	return isPathContained(normalizePosixRoot(rootDir), normalizePosixRoot(candidatePath), baseDir);
}
function parseTsSourceFile(fileContent, fileName = "vite.config.ts") {
	return ts.createSourceFile(fileName, fileContent, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}
function getPropertyKeyName(name, sf) {
	if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
	const raw = name.getText(sf);
	if (raw.startsWith("'") && raw.endsWith("'") || raw.startsWith("\"") && raw.endsWith("\"")) return raw.slice(1, -1);
	return raw;
}
function isSimpleIdentifierKey(key) {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}
function createPropertyNameNode(key, forceQuote = false) {
	if (!forceQuote && isSimpleIdentifierKey(key)) return ts.factory.createIdentifier(key);
	return ts.factory.createStringLiteral(key, true);
}
function valueToAstExpression(val, quoteObjectKeys = false) {
	if (typeof val === "string") return ts.factory.createStringLiteral(val, true);
	if (typeof val === "number") return ts.factory.createNumericLiteral(val);
	if (typeof val === "boolean") return val ? ts.factory.createTrue() : ts.factory.createFalse();
	if (Array.isArray(val)) {
		const elements = val.map((item) => valueToAstExpression(item, false));
		return ts.factory.createArrayLiteralExpression(elements, val.length > 2);
	}
	if (typeof val === "object" && val !== null) {
		const props = Object.entries(val).filter(([, v]) => v !== void 0).map(([k, v]) => ts.factory.createPropertyAssignment(createPropertyNameNode(k, quoteObjectKeys), valueToAstExpression(v, false)));
		return ts.factory.createObjectLiteralExpression(props, true);
	}
	return ts.factory.createNull();
}
function astExpressionToValue(expr, sf) {
	if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
	if (ts.isNumericLiteral(expr)) return Number(expr.text);
	if (expr.kind === ts.SyntaxKind.TrueKeyword) return true;
	if (expr.kind === ts.SyntaxKind.FalseKeyword) return false;
	if (expr.kind === ts.SyntaxKind.NullKeyword) return null;
	if (ts.isArrayLiteralExpression(expr)) return expr.elements.map((el) => astExpressionToValue(el, sf));
	if (ts.isObjectLiteralExpression(expr)) {
		const obj = {};
		for (const prop of expr.properties) if (ts.isPropertyAssignment(prop)) {
			const key = getPropertyKeyName(prop.name, sf);
			obj[key] = astExpressionToValue(prop.initializer, sf);
		}
		return obj;
	}
	return expr.getText(sf);
}
function unwrapReturnedObject(fnBody) {
	if (ts.isParenthesizedExpression(fnBody) && ts.isObjectLiteralExpression(fnBody.expression)) return fnBody.expression;
	if (ts.isObjectLiteralExpression(fnBody)) return fnBody;
	if (ts.isBlock(fnBody)) {
		for (const stmt of fnBody.statements) if (ts.isReturnStatement(stmt) && stmt.expression) {
			if (ts.isObjectLiteralExpression(stmt.expression)) return stmt.expression;
			if (ts.isParenthesizedExpression(stmt.expression) && ts.isObjectLiteralExpression(stmt.expression.expression)) return stmt.expression.expression;
		}
	}
	return null;
}
function findConfigRootObject(sf) {
	let rootObj = null;
	function checkExpression(expr) {
		if (ts.isObjectLiteralExpression(expr)) return expr;
		if (ts.isCallExpression(expr) && expr.arguments.length > 0) {
			const firstArg = expr.arguments[0];
			if (ts.isObjectLiteralExpression(firstArg)) return firstArg;
			if (ts.isArrowFunction(firstArg) || ts.isFunctionExpression(firstArg)) return unwrapReturnedObject(firstArg.body);
		}
		return null;
	}
	for (const stmt of sf.statements) if (ts.isExportAssignment(stmt)) {
		const found = checkExpression(stmt.expression);
		if (found) return found;
	}
	function visit(node) {
		if (rootObj) return;
		if (ts.isCallExpression(node)) {
			const callee = node.expression.getText(sf);
			if (callee === "defineConfig" || callee.endsWith(".defineConfig")) {
				const found = checkExpression(node);
				if (found) {
					rootObj = found;
					return;
				}
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(sf);
	return rootObj;
}
function findPropertyAssignment(obj, propName, sf) {
	let matched = null;
	for (const prop of obj.properties) if (ts.isPropertyAssignment(prop) && getPropertyKeyName(prop.name, sf) === propName) matched = prop;
	return matched;
}
function extractAstPropertyBlock(fileContent, propName) {
	const sf = parseTsSourceFile(fileContent);
	const rootObj = findConfigRootObject(sf);
	if (rootObj) {
		const prop = findPropertyAssignment(rootObj, propName, sf);
		if (prop) return prop.getText(sf);
	}
	let fallbackProp = null;
	function visit(node) {
		if (fallbackProp) return;
		if (ts.isPropertyAssignment(node) && getPropertyKeyName(node.name, sf) === propName && ts.isObjectLiteralExpression(node.initializer)) {
			fallbackProp = node;
			return;
		}
		ts.forEachChild(node, visit);
	}
	visit(sf);
	return fallbackProp ? fallbackProp.getText(sf) : null;
}
function extractStringProp(obj, propName, sf) {
	const prop = findPropertyAssignment(obj, propName, sf);
	if (prop) {
		const val = astExpressionToValue(prop.initializer, sf);
		if (typeof val === "string") return val;
	}
	return null;
}
function extractArrayLiteralStrings(arrayExpr, sf) {
	const vals = [];
	for (const item of arrayExpr.elements) {
		const val = astExpressionToValue(item, sf);
		if (typeof val === "string") vals.push(val);
	}
	return vals;
}
function resolveVariableArrayElements(decl, sf) {
	if (!decl.initializer) return null;
	const initExpr = ts.isAsExpression(decl.initializer) ? decl.initializer.expression : decl.initializer;
	return ts.isArrayLiteralExpression(initExpr) ? extractArrayLiteralStrings(initExpr, sf) : null;
}
function resolveSpreadArrayElements(expr, sf) {
	if (!ts.isIdentifier(expr)) return [];
	const varName = expr.text;
	for (const stmt of sf.statements) {
		if (!ts.isVariableStatement(stmt)) continue;
		for (const decl of stmt.declarationList.declarations) if (ts.isIdentifier(decl.name) && decl.name.text === varName) {
			const res = resolveVariableArrayElements(decl, sf);
			if (res) return res;
		}
	}
	return [];
}
function extractStringArrayProp(obj, propName, sf) {
	const prop = findPropertyAssignment(obj, propName, sf);
	const items = [];
	if (prop && ts.isArrayLiteralExpression(prop.initializer)) for (const el of prop.initializer.elements) if (ts.isSpreadElement(el)) items.push(...resolveSpreadArrayElements(el.expression, sf));
	else {
		const v = astExpressionToValue(el, sf);
		if (typeof v === "string") items.push(v);
	}
	return items;
}
function extractLintSummaryFromAst(lintExpr, sf) {
	const lintRules = /* @__PURE__ */ new Map();
	let lintOptions = {};
	let lintPlugins = [];
	let lintJsPlugins = [];
	let lintIgnorePatterns = [];
	if (lintExpr && ts.isObjectLiteralExpression(lintExpr)) {
		const rulesProp = findPropertyAssignment(lintExpr, "rules", sf);
		if (rulesProp && ts.isObjectLiteralExpression(rulesProp.initializer)) {
			for (const rProp of rulesProp.initializer.properties) if (ts.isPropertyAssignment(rProp)) lintRules.set(getPropertyKeyName(rProp.name, sf), astExpressionToValue(rProp.initializer, sf));
		}
		const optProp = findPropertyAssignment(lintExpr, "options", sf);
		if (optProp && ts.isObjectLiteralExpression(optProp.initializer)) lintOptions = astExpressionToValue(optProp.initializer, sf);
		lintPlugins = extractStringArrayProp(lintExpr, "plugins", sf);
		lintJsPlugins = extractStringArrayProp(lintExpr, "jsPlugins", sf);
		lintIgnorePatterns = extractStringArrayProp(lintExpr, "ignorePatterns", sf);
	}
	return {
		lintRules,
		lintOptions,
		lintPlugins,
		lintJsPlugins,
		lintIgnorePatterns
	};
}
function collectConfigSections(sf) {
	const rootObj = findConfigRootObject(sf);
	const sections = /* @__PURE__ */ new Map();
	if (rootObj) {
		for (const prop of rootObj.properties) if (ts.isPropertyAssignment(prop)) sections.set(getPropertyKeyName(prop.name, sf), prop.initializer);
		return sections;
	}
	function visitTopProps(node) {
		if (ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.initializer)) {
			const key = getPropertyKeyName(node.name, sf);
			if ([
				"lint",
				"fmt",
				"test",
				"pack",
				"staged"
			].includes(key) && !sections.has(key)) sections.set(key, node.initializer);
		}
		ts.forEachChild(node, visitTopProps);
	}
	visitTopProps(sf);
	return sections;
}
function extractProjectInfoFromElement(el, sf) {
	const testPropInEl = findPropertyAssignment(el, "test", sf);
	const innerTestObj = testPropInEl && ts.isObjectLiteralExpression(testPropInEl.initializer) ? testPropInEl.initializer : null;
	const nameVal = innerTestObj ? extractStringProp(innerTestObj, "name", sf) ?? extractStringProp(el, "name", sf) : extractStringProp(el, "name", sf);
	const incList = innerTestObj ? extractStringArrayProp(innerTestObj, "include", sf) : extractStringArrayProp(el, "include", sf);
	return {
		name: nameVal ?? "",
		innerTestObj,
		include: incList
	};
}
function extractFmtSummaryFromAst(fmtExpr, sf) {
	let fmtConfig = {};
	let fmtIgnorePatterns = [];
	if (fmtExpr && ts.isObjectLiteralExpression(fmtExpr)) {
		fmtConfig = astExpressionToValue(fmtExpr, sf);
		fmtIgnorePatterns = extractStringArrayProp(fmtExpr, "ignorePatterns", sf);
	}
	return {
		fmtConfig,
		fmtIgnorePatterns
	};
}
function extractPackSummaryFromAst(packExpr, sf) {
	let packConfig = {};
	let hasPackAttw = false;
	if (packExpr && ts.isObjectLiteralExpression(packExpr)) {
		packConfig = astExpressionToValue(packExpr, sf);
		const attwProp = findPropertyAssignment(packExpr, "attw", sf);
		hasPackAttw = Boolean(attwProp && ts.isObjectLiteralExpression(attwProp.initializer));
	}
	return {
		packConfig,
		hasPackAttw
	};
}
function extractTestSummaryFromAst(testExpr, sf) {
	let hasRootTestInclude = false;
	let rootTestInclude = [];
	const testProjects = [];
	let testCoverageExclude = [];
	if (testExpr && ts.isObjectLiteralExpression(testExpr)) {
		if (findPropertyAssignment(testExpr, "include", sf)) {
			hasRootTestInclude = true;
			rootTestInclude = extractStringArrayProp(testExpr, "include", sf);
		}
		const coverageProp = findPropertyAssignment(testExpr, "coverage", sf);
		if (coverageProp && ts.isObjectLiteralExpression(coverageProp.initializer)) testCoverageExclude = extractStringArrayProp(coverageProp.initializer, "exclude", sf);
		const projectsProp = findPropertyAssignment(testExpr, "projects", sf);
		if (projectsProp && ts.isArrayLiteralExpression(projectsProp.initializer)) for (const el of projectsProp.initializer.elements) {
			if (!ts.isObjectLiteralExpression(el)) continue;
			const info = extractProjectInfoFromElement(el, sf);
			if (info.name || info.include.length > 0) testProjects.push({
				name: info.name,
				include: info.include
			});
		}
	}
	const hasTestProjects = testProjects.length > 0;
	const testInclude = hasTestProjects ? Array.from(/* @__PURE__ */ new Set([...rootTestInclude, ...testProjects.flatMap((p) => p.include)])) : rootTestInclude;
	return {
		hasRootTestInclude,
		rootTestInclude,
		testProjects,
		hasTestProjects,
		testInclude,
		testCoverageExclude
	};
}
function extractParsedConfigSummary(fileContent) {
	const sf = parseTsSourceFile(fileContent);
	const definesFromVitePlus = sf.statements.some((stmt) => ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier) && stmt.moduleSpecifier.text === "vite-plus");
	const sections = collectConfigSections(sf);
	const { lintRules, lintOptions, lintPlugins, lintJsPlugins, lintIgnorePatterns } = extractLintSummaryFromAst(sections.get("lint"), sf);
	const { fmtConfig, fmtIgnorePatterns } = extractFmtSummaryFromAst(sections.get("fmt"), sf);
	const { packConfig, hasPackAttw } = extractPackSummaryFromAst(sections.get("pack"), sf);
	const { hasRootTestInclude, rootTestInclude, testProjects, hasTestProjects, testInclude, testCoverageExclude } = extractTestSummaryFromAst(sections.get("test"), sf);
	return {
		definesFromVitePlus,
		hasSection: (name) => sections.has(name),
		lintRules,
		lintOptions,
		lintPlugins,
		lintJsPlugins,
		lintIgnorePatterns,
		fmtConfig,
		fmtIgnorePatterns,
		packConfig,
		hasPackAttw,
		testInclude,
		testProjects,
		hasTestProjects,
		hasRootTestInclude,
		rootTestInclude,
		testCoverageExclude
	};
}
function extractEslintIgnoresFromAst(rawContent) {
	const sf = parseTsSourceFile(rawContent, "eslint.config.ts");
	const globs = [];
	function collectStringsFromArray(arr) {
		for (const el of arr.elements) if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) {
			if (el.text) globs.push(el.text);
		}
	}
	function visit(node) {
		if (ts.isCallExpression(node) && node.expression.getText(sf) === "globalIgnores" && node.arguments.length > 0 && ts.isArrayLiteralExpression(node.arguments[0])) collectStringsFromArray(node.arguments[0]);
		else if (ts.isPropertyAssignment(node) && getPropertyKeyName(node.name, sf) === "ignores" && ts.isArrayLiteralExpression(node.initializer)) collectStringsFromArray(node.initializer);
		ts.forEachChild(node, visit);
	}
	visit(sf);
	return globs;
}
function createPackOutExtensionsReturnType() {
	return ts.factory.createTypeLiteralNode([ts.factory.createPropertySignature(void 0, ts.factory.createIdentifier("js"), void 0, ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)), ts.factory.createPropertySignature(void 0, ts.factory.createIdentifier("dts"), void 0, ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword))]);
}
const VOID_RETURN_FUNCTIONS = /* @__PURE__ */ new Set([
	"onwarn",
	"configureServer",
	"buildStart",
	"buildEnd",
	"closeBundle",
	"generateBundle"
]);
const STRING_OR_UNDEFINED_RETURN_FUNCTIONS = /* @__PURE__ */ new Set([
	"bypass",
	"manualChunks",
	"resolveManualChunk"
]);
const STRING_RETURN_FUNCTIONS = /* @__PURE__ */ new Set(["getPackageVersion"]);
function createStringOrUndefinedType() {
	return ts.factory.createUnionTypeNode([ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword), ts.factory.createKeywordTypeNode(ts.SyntaxKind.UndefinedKeyword)]);
}
function resolveKnownViteFunctionReturnType(name) {
	if (VOID_RETURN_FUNCTIONS.has(name)) return ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword);
	if (STRING_OR_UNDEFINED_RETURN_FUNCTIONS.has(name)) return createStringOrUndefinedType();
	if (STRING_RETURN_FUNCTIONS.has(name)) return ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
	if (name === "outExtensions") return createPackOutExtensionsReturnType();
	return null;
}
function buildPackAstObject() {
	const returnType = createPackOutExtensionsReturnType();
	const outExtensionsArrow = ts.factory.createArrowFunction(void 0, void 0, [], returnType, ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.factory.createParenthesizedExpression(valueToAstExpression({
		js: ".js",
		dts: ".d.ts"
	})));
	return ts.factory.createObjectLiteralExpression([
		ts.factory.createPropertyAssignment("entry", valueToAstExpression([
			"src/index.ts",
			"src/cli/*.ts",
			"src/suites/**/*.ts"
		])),
		ts.factory.createPropertyAssignment("unbundle", ts.factory.createTrue()),
		ts.factory.createPropertyAssignment("dts", ts.factory.createTrue()),
		ts.factory.createPropertyAssignment("publint", ts.factory.createTrue()),
		ts.factory.createPropertyAssignment("attw", valueToAstExpression({ profile: "esm-only" })),
		ts.factory.createPropertyAssignment("outExtensions", outExtensionsArrow)
	], true);
}
function buildLintOverridesArrayAst(overrides) {
	const ovElements = overrides.map((ov) => ts.factory.createObjectLiteralExpression([ts.factory.createPropertyAssignment("files", valueToAstExpression(ov.files)), ts.factory.createPropertyAssignment("rules", valueToAstExpression(ov.rules ?? {}, true))], true));
	return ts.factory.createArrayLiteralExpression(ovElements, true);
}
function candidateRootsToExemptGlobs(roots) {
	const globs = [];
	for (const root of roots) {
		const cleanRoot = stripGlobSuffix(normalizePosixPath(root));
		if (cleanRoot && cleanRoot !== ".") globs.push(`**/${cleanRoot}/**`);
	}
	return Array.from(new Set(globs));
}
function resolveDynamicTestExemptGlobs(auditConfig) {
	const paths = auditConfig.paths;
	if (!paths) return [];
	return candidateRootsToExemptGlobs([
		...paths.testRoots ?? [],
		...paths.e2eRoots ?? [],
		...paths.integrationRoots ?? []
	]);
}
function resolveDynamicScriptExemptGlobs(auditConfig) {
	const paths = auditConfig.paths;
	if (!paths) return [];
	return candidateRootsToExemptGlobs([...paths.scriptsRoots ?? [], ...paths.cliRoots ?? []]);
}
function resolveDynamicDemoExemptGlobs(auditConfig) {
	const paths = auditConfig.paths;
	if (!paths) return [];
	return candidateRootsToExemptGlobs([...paths.demoRoots ?? []]);
}
function mergeDynamicOverride(effective, globs, canonicalRules, discriminatorRule) {
	if (globs.length === 0) return;
	const existingIndex = effective.findIndex((ov) => Boolean(ov.rules && discriminatorRule in ov.rules && (discriminatorRule === "vitest/prefer-to-be-truthy" || ov.files.some((f) => globs.includes(f)))));
	const existing = existingIndex >= 0 ? effective[existingIndex] : void 0;
	if (existing) effective[existingIndex] = {
		...existing,
		files: Array.from(/* @__PURE__ */ new Set([...existing.files, ...globs])),
		rules: {
			...canonicalRules,
			...existing.rules
		}
	};
	else effective.push({
		files: globs,
		rules: { ...canonicalRules }
	});
}
function resolveEffectiveLintOverrides(auditConfig) {
	const effective = [...auditConfig.vitePlusConfig?.lint?.overrides ?? []];
	mergeDynamicOverride(effective, resolveDynamicTestExemptGlobs(auditConfig), CANONICAL_DYNAMIC_TEST_OVERRIDE_RULES, "vitest/prefer-to-be-truthy");
	mergeDynamicOverride(effective, resolveDynamicScriptExemptGlobs(auditConfig), CANONICAL_DYNAMIC_SCRIPT_OVERRIDE_RULES, "no-console");
	mergeDynamicOverride(effective, resolveDynamicDemoExemptGlobs(auditConfig), CANONICAL_DYNAMIC_DEMO_OVERRIDE_RULES, "no-console");
	const toolingFiles = auditConfig.paths?.toolingFiles ?? [];
	if (toolingFiles.length > 0) mergeDynamicOverride(effective, toolingFiles, CANONICAL_DYNAMIC_TOOLING_OVERRIDE_RULES, "typescript/no-floating-promises");
	const loggerFiles = auditConfig.paths?.loggerFiles ?? [];
	if (loggerFiles.length > 0) mergeDynamicOverride(effective, loggerFiles, { "no-console": "off" }, "no-console");
	const integrationGlobs = candidateRootsToExemptGlobs(auditConfig.paths?.integrationRoots ?? []);
	if (integrationGlobs.length > 0) {
		const existingIntegrationIdx = effective.findIndex((ov) => ov.rules && ov.rules["@francogp/domain-type/no-tautological-integration-mocks"] === "error" && ov.files.some((f) => integrationGlobs.includes(f)));
		const existingIntegration = existingIntegrationIdx >= 0 ? effective[existingIntegrationIdx] : void 0;
		if (existingIntegration) effective[existingIntegrationIdx] = {
			...existingIntegration,
			files: Array.from(/* @__PURE__ */ new Set([...existingIntegration.files, ...integrationGlobs])),
			rules: {
				...existingIntegration.rules,
				"@francogp/domain-type/no-tautological-integration-mocks": "error"
			}
		};
		else effective.push({
			files: integrationGlobs,
			rules: { "@francogp/domain-type/no-tautological-integration-mocks": "error" }
		});
	}
	return effective;
}
function buildIgnorePatternsAst(ignores, lockedSkillsIgnores = []) {
	if (lockedSkillsIgnores.length === 0) return valueToAstExpression([...ignores]);
	const lockedSet = new Set(lockedSkillsIgnores);
	const elements = ignores.filter((g) => !lockedSet.has(g)).map((g) => ts.factory.createStringLiteral(g, true));
	elements.push(ts.factory.createSpreadElement(ts.factory.createIdentifier("LOCKED_SKILLS_IGNORE_PATTERNS")));
	return ts.factory.createArrayLiteralExpression(elements, true);
}
function buildLockedSkillsVariableStatement(lockedSkillsIgnores) {
	return ts.factory.createVariableStatement(void 0, ts.factory.createVariableDeclarationList([ts.factory.createVariableDeclaration("LOCKED_SKILLS_IGNORE_PATTERNS", void 0, void 0, ts.factory.createAsExpression(ts.factory.createArrayLiteralExpression(lockedSkillsIgnores.map((s) => ts.factory.createStringLiteral(s, true)), true), ts.factory.createTypeReferenceNode("const", void 0)))], ts.NodeFlags.Const));
}
function buildLintAstObject(auditConfig, lintIgnores, lockedSkillsIgnores = []) {
	const lintCfg = auditConfig.vitePlusConfig?.lint;
	const typeAware = lintCfg?.typeAware ?? true;
	const typeCheck = lintCfg?.typeCheck ?? true;
	const mergedRules = { ...DEFAULT_CANONICAL_LINT_RULES };
	if (auditConfig.vitePlusConfig?.extraLintRules) for (const [k, v] of Object.entries(auditConfig.vitePlusConfig.extraLintRules)) mergedRules[k] = v;
	if (lintCfg?.rules) for (const [k, v] of Object.entries(lintCfg.rules)) mergedRules[k] = v;
	const props = [ts.factory.createPropertyAssignment("options", valueToAstExpression({
		typeAware,
		typeCheck
	}))];
	if (lintCfg?.categories && Object.keys(lintCfg.categories).length > 0) props.push(ts.factory.createPropertyAssignment("categories", valueToAstExpression(lintCfg.categories, true)));
	const configuredPlugins = lintCfg?.plugins ?? DEFAULT_VITE_PLUS_AUDIT_CONFIG.lint?.plugins ?? [];
	if (configuredPlugins.length > 0) props.push(ts.factory.createPropertyAssignment("plugins", valueToAstExpression([...configuredPlugins])));
	props.push(ts.factory.createPropertyAssignment("jsPlugins", valueToAstExpression(["@francogp/auditor/domain-type-plugin"])), ts.factory.createPropertyAssignment("rules", valueToAstExpression(mergedRules, true)), ts.factory.createPropertyAssignment("ignorePatterns", buildIgnorePatternsAst(lintIgnores, lockedSkillsIgnores)));
	const effectiveOverrides = resolveEffectiveLintOverrides(auditConfig);
	if (effectiveOverrides.length > 0) props.push(ts.factory.createPropertyAssignment("overrides", buildLintOverridesArrayAst(effectiveOverrides)));
	return ts.factory.createObjectLiteralExpression(props, true);
}
function buildFmtAstObject(auditConfig, fmtIgnores, lockedSkillsIgnores = []) {
	const fmtCfg = auditConfig.vitePlusConfig?.fmt;
	const props = [
		ts.factory.createPropertyAssignment("singleQuote", fmtCfg?.singleQuote ?? true ? ts.factory.createTrue() : ts.factory.createFalse()),
		ts.factory.createPropertyAssignment("semi", fmtCfg?.semi ?? true ? ts.factory.createTrue() : ts.factory.createFalse()),
		ts.factory.createPropertyAssignment("trailingComma", ts.factory.createStringLiteral(fmtCfg?.trailingComma ?? "none", true)),
		ts.factory.createPropertyAssignment("printWidth", ts.factory.createNumericLiteral(fmtCfg?.printWidth ?? 100)),
		ts.factory.createPropertyAssignment("sortPackageJson", fmtCfg?.sortPackageJson ?? true ? ts.factory.createTrue() : ts.factory.createFalse()),
		ts.factory.createPropertyAssignment("sortImports", fmtCfg?.sortImports ?? true ? ts.factory.createTrue() : ts.factory.createFalse()),
		ts.factory.createPropertyAssignment("ignorePatterns", buildIgnorePatternsAst(fmtIgnores, lockedSkillsIgnores))
	];
	if (fmtCfg?.tabWidth !== void 0) props.push(ts.factory.createPropertyAssignment("tabWidth", ts.factory.createNumericLiteral(fmtCfg.tabWidth)));
	if (fmtCfg?.useTabs !== void 0) props.push(ts.factory.createPropertyAssignment("useTabs", fmtCfg.useTabs ? ts.factory.createTrue() : ts.factory.createFalse()));
	return ts.factory.createObjectLiteralExpression(props, true);
}
function resolveVitestRoots(auditConfig) {
	const rawTestRoots = auditConfig.paths?.testRoots ?? DEFAULT_AUDIT_CONFIG.paths.testRoots;
	const normalizedE2eRoots = (auditConfig.paths?.e2eRoots ?? DEFAULT_AUDIT_CONFIG.paths.e2eRoots ?? ["e2e"]).map(normalizePosixRoot);
	const vitestRoots = rawTestRoots.filter((r) => {
		const normR = normalizePosixRoot(r);
		return !normalizedE2eRoots.some((e2e) => isPathUnderRoot(normR, e2e)) && normR !== "e2e";
	});
	return vitestRoots.length > 0 ? vitestRoots : DEFAULT_AUDIT_CONFIG.paths.testRoots;
}
function buildTestAstObject(auditConfig) {
	const coverageThreshold = auditConfig.testCoverage?.threshold ?? 80;
	const rawTestRoots = auditConfig.paths?.testRoots ?? DEFAULT_AUDIT_CONFIG.paths.testRoots;
	const e2eRootsList = auditConfig.paths?.e2eRoots ?? DEFAULT_AUDIT_CONFIG.paths.e2eRoots ?? ["e2e"];
	const testRoots = resolveVitestRoots(auditConfig);
	const srcRoots = auditConfig.paths?.srcRoots ?? DEFAULT_AUDIT_CONFIG.paths.srcRoots;
	const cliRoots = auditConfig.paths?.cliRoots ?? DEFAULT_AUDIT_CONFIG.paths.cliRoots ?? [];
	const testProjectsConfig = auditConfig.vitePlusConfig?.test?.projects;
	return valueToAstExpression({
		environment: "node",
		...Boolean(testProjectsConfig && Object.keys(testProjectsConfig).length > 0) && testProjectsConfig ? { projects: Object.entries(testProjectsConfig).map(([projName, roots]) => ({ test: {
			name: projName,
			include: roots.map((r) => r.includes("*") ? r : `${r}/**/*.{test,spec}.ts`)
		} })) } : { include: testRoots.map((r) => `${r}/**/*.{test,spec}.ts`) },
		coverage: {
			provider: "v8",
			reportsDirectory: "scratch/coverage",
			include: srcRoots.map((r) => `${r}/**/*.ts`),
			exclude: [
				...cliRoots.map((r) => `${r}/**`),
				...rawTestRoots.map((r) => `${r}/**`),
				...e2eRootsList.map((r) => `${r}/**`)
			],
			thresholds: {
				lines: coverageThreshold,
				functions: coverageThreshold,
				branches: coverageThreshold,
				statements: coverageThreshold
			}
		}
	});
}
function buildStagedAstObject(auditConfig) {
	const stagedCfg = auditConfig.vitePlusConfig?.staged;
	let rulesObj = { "*": "vp check --fix" };
	if (stagedCfg) {
		const candidate = "rules" in stagedCfg && stagedCfg.rules ? stagedCfg.rules : stagedCfg;
		if (typeof candidate === "object" && candidate !== null && !Array.isArray(candidate)) {
			const nextRules = {};
			for (const [k, v] of Object.entries(candidate)) if (typeof v === "string") nextRules[k] = v;
			if (Object.keys(nextRules).length > 0) rulesObj = nextRules;
		}
	}
	return valueToAstExpression(rulesObj, true);
}
function printAstNode(node, sf) {
	const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
	const sourceFile = sf ?? parseTsSourceFile("", "vite.config.ts");
	return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
}
function buildRunAstObject(auditConfig) {
	const cacheVal = auditConfig?.vitePlusConfig?.run?.cache !== false;
	return ts.factory.createObjectLiteralExpression([ts.factory.createPropertyAssignment("cache", cacheVal ? ts.factory.createTrue() : ts.factory.createFalse())], true);
}
function buildCanonicalVitePlusAstSource(auditConfig, lintIgnores, fmtIgnores, legacyTestProperty, lockedSkillsIgnores = []) {
	const isLibrary = auditConfig.packageDistribution?.enabled !== false;
	const rootProps = [];
	if (isLibrary) rootProps.push(ts.factory.createPropertyAssignment("pack", buildPackAstObject()));
	rootProps.push(ts.factory.createPropertyAssignment("run", buildRunAstObject(auditConfig)), ts.factory.createPropertyAssignment("lint", buildLintAstObject(auditConfig, lintIgnores, lockedSkillsIgnores)), ts.factory.createPropertyAssignment("fmt", buildFmtAstObject(auditConfig, fmtIgnores, lockedSkillsIgnores)), legacyTestProperty ?? ts.factory.createPropertyAssignment("test", buildTestAstObject(auditConfig)), ts.factory.createPropertyAssignment("staged", buildStagedAstObject(auditConfig)));
	const importDecl = ts.factory.createImportDeclaration(void 0, ts.factory.createImportClause(false, void 0, ts.factory.createNamedImports([ts.factory.createImportSpecifier(false, void 0, ts.factory.createIdentifier("defineConfig"))])), ts.factory.createStringLiteral("vite-plus", true));
	const exportDefault = ts.factory.createExportAssignment(void 0, false, ts.factory.createCallExpression(ts.factory.createIdentifier("defineConfig"), void 0, [ts.factory.createObjectLiteralExpression(rootProps, true)]));
	const statements = [importDecl];
	if (lockedSkillsIgnores.length > 0) statements.push(buildLockedSkillsVariableStatement(lockedSkillsIgnores));
	statements.push(exportDefault);
	const sf = ts.factory.createSourceFile(statements, ts.factory.createToken(ts.SyntaxKind.EndOfFileToken), ts.NodeFlags.None);
	return ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(sf);
}
function detachNodeFromSourceFile(node) {
	const transformer = (context) => {
		const visit = (curr) => {
			const visited = ts.visitEachChild(curr, visit, context);
			if (ts.isIdentifier(visited)) return ts.factory.createIdentifier(visited.text);
			if (ts.isStringLiteral(visited)) return ts.factory.createStringLiteral(visited.text, true);
			if (ts.isNumericLiteral(visited)) return ts.factory.createNumericLiteral(visited.text);
			return ts.setTextRange(visited, {
				pos: -1,
				end: -1
			});
		};
		return (root) => ts.visitNode(root, visit);
	};
	const res = ts.transform(node, [transformer]);
	const transformed = res.transformed[0];
	res.dispose();
	return transformed;
}
function parseLegacyTestPropertyNode(legacyTestBlock) {
	const sf = parseTsSourceFile(`export default defineConfig({\n${legacyTestBlock}\n});`, "vitest.config.ts");
	const rootObj = findConfigRootObject(sf);
	if (!rootObj) return null;
	const testProp = findPropertyAssignment(rootObj, "test", sf);
	if (!testProp) return null;
	return detachNodeFromSourceFile(testProp);
}
function toCanonicalLintRuleName(ruleName) {
	if (ruleName === "@typescript-eslint/no-unused-vars") return "no-unused-vars";
	if (ruleName.startsWith("@typescript-eslint/")) return `typescript/${ruleName.slice(19)}`;
	return ruleName;
}
const TUPLE_REQUIRED_RULES = /* @__PURE__ */ new Set([
	"typescript/consistent-type-assertions",
	"@typescript-eslint/consistent-type-assertions",
	"typescript/explicit-function-return-type",
	"@typescript-eslint/explicit-function-return-type",
	"no-empty",
	"eqeqeq"
]);
function checkTupleRuleOption(ruleName, second) {
	const canonical = toCanonicalLintRuleName(ruleName);
	if (canonical === "typescript/consistent-type-assertions") {
		const cfg = typeof second === "object" && second !== null ? second : null;
		return cfg !== null && cfg.assertionStyle === "as" && cfg.objectLiteralTypeAssertions === "never";
	}
	if (canonical === "typescript/explicit-function-return-type") {
		const cfg = typeof second === "object" && second !== null ? second : null;
		return cfg !== null && cfg.allowExpressions === true;
	}
	if (canonical === "no-empty") {
		const cfg = typeof second === "object" && second !== null ? second : null;
		return cfg !== null && cfg.allowEmptyCatch === false;
	}
	if (canonical === "eqeqeq") return second === "always";
	if (canonical === "no-unused-vars" || canonical === "typescript/no-unused-vars") return false;
	return true;
}
function isRuleValueCompliant(ruleName, val) {
	if (typeof val === "string") {
		if (TUPLE_REQUIRED_RULES.has(ruleName)) return false;
		return val.toLowerCase() === "error";
	}
	if (Array.isArray(val) && val.length > 0) {
		const first = val[0];
		if (typeof first !== "string" || first.toLowerCase() !== "error") return false;
		return checkTupleRuleOption(ruleName, val[1]);
	}
	return false;
}
function updateObjectProperty(props, key, newInitializer, sf, forceQuote = false) {
	const newProp = ts.factory.createPropertyAssignment(createPropertyNameNode(key, forceQuote), newInitializer);
	let replaced = false;
	const nextProps = props.map((prop) => {
		if (ts.isPropertyAssignment(prop) && getPropertyKeyName(prop.name, sf) === key) {
			replaced = true;
			return newProp;
		}
		return prop;
	});
	if (!replaced) nextProps.push(newProp);
	return nextProps;
}
function removeObjectProperty(props, key, sf) {
	let modified = false;
	return {
		props: props.filter((prop) => {
			if (ts.isPropertyAssignment(prop) && getPropertyKeyName(prop.name, sf) === key) {
				modified = true;
				return false;
			}
			return true;
		}),
		modified
	};
}
function deduplicateObjectProperties(props, sf) {
	const lastIdxByKey = /* @__PURE__ */ new Map();
	props.forEach((p, idx) => {
		if (ts.isPropertyAssignment(p)) lastIdxByKey.set(getPropertyKeyName(p.name, sf), idx);
	});
	let modified = false;
	return {
		props: props.filter((p, idx) => {
			if (ts.isPropertyAssignment(p)) {
				const key = getPropertyKeyName(p.name, sf);
				if (lastIdxByKey.get(key) !== idx) {
					modified = true;
					return false;
				}
			}
			return true;
		}),
		modified
	};
}
function syncStringArrayExpression(existingProp, requiredStrings, sf, exact = false) {
	const currentValues = [];
	if (existingProp && ts.isArrayLiteralExpression(existingProp.initializer)) for (const el of existingProp.initializer.elements) {
		const v = astExpressionToValue(el, sf);
		if (typeof v === "string") currentValues.push(v);
	}
	if (exact) {
		const allMatch = currentValues.length === requiredStrings.length && requiredStrings.every((req, i) => currentValues[i] === req);
		if (existingProp && ts.isArrayLiteralExpression(existingProp.initializer) && allMatch) return {
			expr: existingProp.initializer,
			modified: false
		};
		return {
			expr: valueToAstExpression([...requiredStrings]),
			modified: true
		};
	}
	const missing = requiredStrings.filter((req) => !currentValues.includes(req));
	if (existingProp && ts.isArrayLiteralExpression(existingProp.initializer) && missing.length === 0) return {
		expr: existingProp.initializer,
		modified: false
	};
	return {
		expr: valueToAstExpression(Array.from(/* @__PURE__ */ new Set([...currentValues, ...requiredStrings]))),
		modified: true
	};
}
function migrateLegacyLintRulesAst(rulesProps, sf) {
	let modified = false;
	const existingKeys = /* @__PURE__ */ new Set();
	for (const rp of rulesProps) if (ts.isPropertyAssignment(rp)) existingKeys.add(getPropertyKeyName(rp.name, sf));
	const nextProps = [];
	for (const rp of rulesProps) {
		if (ts.isPropertyAssignment(rp)) {
			const key = getPropertyKeyName(rp.name, sf);
			if (key.startsWith("@typescript-eslint/")) {
				const canonicalKey = toCanonicalLintRuleName(key);
				if (existingKeys.has(canonicalKey)) {
					modified = true;
					continue;
				}
				const newName = createPropertyNameNode(canonicalKey, true);
				nextProps.push(ts.factory.updatePropertyAssignment(rp, newName, rp.initializer));
				existingKeys.add(canonicalKey);
				existingKeys.delete(key);
				modified = true;
				continue;
			}
		}
		nextProps.push(rp);
	}
	return {
		rulesProps: nextProps,
		modified
	};
}
function syncLintRulesAst(rulesProp, auditConfig, sf) {
	let rulesProps = [];
	let rulesModified = false;
	if (rulesProp && ts.isObjectLiteralExpression(rulesProp.initializer)) {
		const rDedup = deduplicateObjectProperties(rulesProp.initializer.properties, sf);
		rulesProps = rDedup.props;
		if (rDedup.modified) rulesModified = true;
		const rMigrate = migrateLegacyLintRulesAst(rulesProps, sf);
		rulesProps = rMigrate.rulesProps;
		if (rMigrate.modified) rulesModified = true;
	} else rulesModified = true;
	const currentRuleMap = /* @__PURE__ */ new Map();
	for (const rp of rulesProps) if (ts.isPropertyAssignment(rp)) currentRuleMap.set(getPropertyKeyName(rp.name, sf), astExpressionToValue(rp.initializer, sf));
	for (const [ruleName, canonicalVal] of Object.entries(DEFAULT_CANONICAL_LINT_RULES)) if (!isRuleValueCompliant(ruleName, currentRuleMap.get(ruleName))) {
		rulesProps = updateObjectProperty(rulesProps, ruleName, valueToAstExpression(canonicalVal), sf, true);
		currentRuleMap.set(ruleName, canonicalVal);
		rulesModified = true;
	}
	if (auditConfig.vitePlusConfig?.extraLintRules) {
		for (const [ruleName, ruleLevel] of Object.entries(auditConfig.vitePlusConfig.extraLintRules)) if (currentRuleMap.get(ruleName) !== ruleLevel) {
			rulesProps = updateObjectProperty(rulesProps, ruleName, valueToAstExpression(ruleLevel), sf, true);
			currentRuleMap.set(ruleName, ruleLevel);
			rulesModified = true;
		}
	}
	if (auditConfig.vitePlusConfig?.lint?.rules) {
		for (const [ruleName, ruleVal] of Object.entries(auditConfig.vitePlusConfig.lint.rules)) if (JSON.stringify(currentRuleMap.get(ruleName)) !== JSON.stringify(ruleVal)) {
			rulesProps = updateObjectProperty(rulesProps, ruleName, valueToAstExpression(ruleVal), sf, true);
			currentRuleMap.set(ruleName, ruleVal);
			rulesModified = true;
		}
	}
	const allowedRuleKeys = /* @__PURE__ */ new Set([
		...Object.keys(DEFAULT_CANONICAL_LINT_RULES),
		...Object.keys(auditConfig.vitePlusConfig?.extraLintRules ?? {}),
		...Object.keys(auditConfig.vitePlusConfig?.lint?.rules ?? {})
	]);
	const purge = purgeOrphanLintRulesAst(rulesProps, currentRuleMap, allowedRuleKeys, sf);
	if (purge.modified) {
		rulesProps = purge.rulesProps;
		rulesModified = true;
	}
	return {
		rulesProps,
		modified: rulesModified
	};
}
function purgeOrphanLintRulesAst(rulesProps, currentRuleMap, allowedRuleKeys, sf) {
	let modified = false;
	let nextProps = rulesProps;
	for (const ruleKey of currentRuleMap.keys()) if (!allowedRuleKeys.has(ruleKey)) {
		const rmResult = removeObjectProperty(nextProps, ruleKey, sf);
		if (rmResult.modified) {
			nextProps = rmResult.props;
			currentRuleMap.delete(ruleKey);
			modified = true;
		}
	}
	return {
		rulesProps: nextProps,
		modified
	};
}
function syncIgnorePatternsProperty(existingProp, requiredIgnores, sf, lockedSkillsIgnores = []) {
	if (lockedSkillsIgnores.length === 0) return syncStringArrayExpression(existingProp, requiredIgnores, sf, true);
	const lockedSet = new Set(lockedSkillsIgnores);
	const requiredOther = requiredIgnores.filter((g) => !lockedSet.has(g));
	if (existingProp && ts.isArrayLiteralExpression(existingProp.initializer)) {
		const currentStrings = [];
		let hasSpread = false;
		for (const el of existingProp.initializer.elements) if (ts.isSpreadElement(el) && ts.isIdentifier(el.expression) && el.expression.text === "LOCKED_SKILLS_IGNORE_PATTERNS") hasSpread = true;
		else {
			const v = astExpressionToValue(el, sf);
			if (typeof v === "string") currentStrings.push(v);
		}
		const allMatch = currentStrings.length === requiredOther.length && requiredOther.every((req, i) => currentStrings[i] === req);
		if (hasSpread && allMatch) return {
			expr: existingProp.initializer,
			modified: false
		};
	}
	return {
		expr: buildIgnorePatternsAst(requiredIgnores, lockedSkillsIgnores),
		modified: true
	};
}
function syncLintSectionAst(lintObj, auditConfig, lintIgnores, sf, lockedSkillsIgnores = []) {
	const dedup = deduplicateObjectProperties(lintObj.properties, sf);
	let props = dedup.props;
	let modified = dedup.modified;
	const optProp = findPropertyAssignment(ts.factory.createObjectLiteralExpression(props, true), "options", sf);
	const typeAware = auditConfig.vitePlusConfig?.lint?.typeAware ?? true;
	const typeCheck = auditConfig.vitePlusConfig?.lint?.typeCheck ?? true;
	if (!optProp || !ts.isObjectLiteralExpression(optProp.initializer)) {
		props = [ts.factory.createPropertyAssignment("options", valueToAstExpression({
			typeAware,
			typeCheck
		})), ...props.filter((p) => !(ts.isPropertyAssignment(p) && getPropertyKeyName(p.name, sf) === "options"))];
		modified = true;
	} else {
		const optVal = astExpressionToValue(optProp.initializer, sf);
		if (optVal.typeAware === void 0 || optVal.typeCheck === void 0) {
			props = updateObjectProperty(props, "options", valueToAstExpression({
				...optVal,
				typeAware,
				typeCheck
			}), sf);
			modified = true;
		}
	}
	const requiredPlugins = auditConfig.vitePlusConfig?.lint?.plugins ?? DEFAULT_VITE_PLUS_AUDIT_CONFIG.lint?.plugins ?? [];
	if (requiredPlugins.length > 0) {
		const linterPluginSync = syncStringArrayExpression(findPropertyAssignment(ts.factory.createObjectLiteralExpression(props, true), "plugins", sf), requiredPlugins, sf);
		if (linterPluginSync.modified) {
			props = updateObjectProperty(props, "plugins", linterPluginSync.expr, sf);
			modified = true;
		}
	}
	const pluginSync = syncStringArrayExpression(findPropertyAssignment(ts.factory.createObjectLiteralExpression(props, true), "jsPlugins", sf), ["@francogp/auditor/domain-type-plugin"], sf);
	if (pluginSync.modified) {
		props = updateObjectProperty(props, "jsPlugins", pluginSync.expr, sf);
		modified = true;
	}
	const syncedRules = syncLintRulesAst(findPropertyAssignment(ts.factory.createObjectLiteralExpression(props, true), "rules", sf), auditConfig, sf);
	if (syncedRules.modified) {
		props = updateObjectProperty(props, "rules", ts.factory.createObjectLiteralExpression(syncedRules.rulesProps, true), sf);
		modified = true;
	}
	const ignoreSync = syncIgnorePatternsProperty(findPropertyAssignment(ts.factory.createObjectLiteralExpression(props, true), "ignorePatterns", sf), lintIgnores, sf, lockedSkillsIgnores);
	if (ignoreSync.modified) {
		props = updateObjectProperty(props, "ignorePatterns", ignoreSync.expr, sf);
		modified = true;
	}
	const effectiveOverrides = resolveEffectiveLintOverrides(auditConfig);
	if (effectiveOverrides && effectiveOverrides.length > 0) {
		const ovProp = findPropertyAssignment(ts.factory.createObjectLiteralExpression(props, true), "overrides", sf);
		const currentOvVal = ovProp ? astExpressionToValue(ovProp.initializer, sf) : void 0;
		if (JSON.stringify(currentOvVal) !== JSON.stringify(effectiveOverrides)) {
			props = updateObjectProperty(props, "overrides", buildLintOverridesArrayAst(effectiveOverrides), sf);
			modified = true;
		}
	}
	return {
		obj: modified ? ts.factory.createObjectLiteralExpression(props, true) : lintObj,
		modified
	};
}
function syncFmtSectionAst(fmtObj, auditConfig, fmtIgnores, sf, lockedSkillsIgnores = []) {
	const dedup = deduplicateObjectProperties(fmtObj.properties, sf);
	let props = dedup.props;
	let modified = dedup.modified;
	const sortPackageJson = auditConfig.vitePlusConfig?.fmt?.sortPackageJson ?? true;
	const sortImports = auditConfig.vitePlusConfig?.fmt?.sortImports ?? true;
	const curVal = astExpressionToValue(fmtObj, sf);
	if (sortPackageJson && curVal.sortPackageJson !== true) {
		props = updateObjectProperty(props, "sortPackageJson", ts.factory.createTrue(), sf);
		modified = true;
	}
	if (sortImports && curVal.sortImports !== true) {
		props = updateObjectProperty(props, "sortImports", ts.factory.createTrue(), sf);
		modified = true;
	}
	const ignoreSync = syncIgnorePatternsProperty(findPropertyAssignment(ts.factory.createObjectLiteralExpression(props, true), "ignorePatterns", sf), fmtIgnores, sf, lockedSkillsIgnores);
	if (ignoreSync.modified) {
		props = updateObjectProperty(props, "ignorePatterns", ignoreSync.expr, sf);
		modified = true;
	}
	return {
		obj: modified ? ts.factory.createObjectLiteralExpression(props, true) : fmtObj,
		modified
	};
}
function syncTestIncludeAst(props, auditConfig, sf) {
	let modified = false;
	const normalizedE2eRoots = (auditConfig.paths?.e2eRoots ?? ["e2e"]).map(normalizePosixRoot);
	const testRoots = resolveVitestRoots(auditConfig);
	const includeProp = findPropertyAssignment(ts.factory.createObjectLiteralExpression(props, true), "include", sf);
	const existingIncludes = [];
	if (includeProp && ts.isArrayLiteralExpression(includeProp.initializer)) for (const el of includeProp.initializer.elements) {
		const v = astExpressionToValue(el, sf);
		if (typeof v === "string") {
			if (!(normalizedE2eRoots.some((e2e) => isPathUnderRoot(v, e2e)) || isPathUnderRoot(v, "e2e"))) existingIncludes.push(v);
			else modified = true;
		}
	}
	const missingRoots = [];
	for (const root of testRoots) {
		const pattern = `${root}/**/*.{test,spec}.ts`;
		const simple = `${root}/**/*.test.ts`;
		if (!existingIncludes.some((inc) => inc === pattern || inc === simple || isPathUnderRoot(inc, root))) missingRoots.push(pattern);
	}
	if (missingRoots.length > 0 || includeProp && modified) return {
		props: updateObjectProperty(props, "include", valueToAstExpression(Array.from(/* @__PURE__ */ new Set([...existingIncludes, ...missingRoots]))), sf),
		modified: true
	};
	return {
		props,
		modified
	};
}
function buildAllowedCoverageExcludes(auditConfig, projectRoot) {
	const root = projectRoot ?? process.cwd();
	const srcRoots = auditConfig.paths?.srcRoots ?? DEFAULT_AUDIT_CONFIG.paths.srcRoots;
	const coverageExemptGlobs = (auditConfig.coverage?.exemptGlobs ?? []).map((e) => e.glob);
	const rawAllowedGlobs = [
		"**/*.d.ts",
		...srcRoots.map((r) => `${normalizePosixRoot(r)}/**/*.d.ts`),
		...getAllowedSatellitePathExcludes(auditConfig, root),
		...(auditConfig.testCoverage?.exemptGlobs ?? []).map((p) => normalizePosixPath(p)),
		...coverageExemptGlobs.map((p) => normalizePosixPath(p))
	];
	return new Set(rawAllowedGlobs);
}
function syncCoverageCorePropertiesAst(covObj, sf) {
	let covProps = [...covObj.properties];
	let covModified = false;
	const repDirProp = findPropertyAssignment(covObj, "reportsDirectory", sf);
	const repVal = repDirProp ? astExpressionToValue(repDirProp.initializer, sf) : null;
	if (!repDirProp || typeof repVal === "string" && repVal !== "scratch/coverage") {
		covProps = updateObjectProperty(covProps, "reportsDirectory", ts.factory.createStringLiteral("scratch/coverage", true), sf);
		covModified = true;
	}
	if (!findPropertyAssignment(covObj, "provider", sf)) {
		covProps = updateObjectProperty(covProps, "provider", ts.factory.createStringLiteral("v8", true), sf);
		covModified = true;
	}
	return {
		props: covProps,
		modified: covModified
	};
}
function syncCoverageExcludePropertyAst(covProps, covObj, auditConfig, sf, projectRoot) {
	const excludeProp = findPropertyAssignment(covObj, "exclude", sf);
	if (!excludeProp || !ts.isArrayLiteralExpression(excludeProp.initializer)) return {
		props: covProps,
		modified: false
	};
	const allowedCoverageExcludes = buildAllowedCoverageExcludes(auditConfig, projectRoot);
	const effectiveGlobs = getEffectiveIgnoreGlobs(projectRoot ?? process.cwd());
	const remainingElements = [];
	let excludeModified = false;
	for (const el of excludeProp.initializer.elements) {
		const text = astExpressionToValue(el, sf);
		if (typeof text !== "string") {
			remainingElements.push(el);
			continue;
		}
		if (isPatternContainedInGlobs(text, allowedCoverageExcludes, effectiveGlobs)) remainingElements.push(el);
		else excludeModified = true;
	}
	if (!excludeModified) return {
		props: covProps,
		modified: false
	};
	const finalElements = remainingElements.length > 0 ? remainingElements : [ts.factory.createStringLiteral("**/*.d.ts", true)];
	return {
		props: updateObjectProperty(covProps, "exclude", ts.factory.createArrayLiteralExpression(finalElements, true), sf),
		modified: true
	};
}
function syncTestCoverageAst(props, auditConfig, sf, projectRoot) {
	const coverageProp = findPropertyAssignment(ts.factory.createObjectLiteralExpression(props, true), "coverage", sf);
	if (!coverageProp) return {
		props: updateObjectProperty(props, "coverage", ts.factory.createObjectLiteralExpression([ts.factory.createPropertyAssignment("provider", ts.factory.createStringLiteral("v8", true)), ts.factory.createPropertyAssignment("reportsDirectory", ts.factory.createStringLiteral("scratch/coverage", true))], true), sf),
		modified: true
	};
	if (!ts.isObjectLiteralExpression(coverageProp.initializer)) return {
		props,
		modified: false
	};
	const covObj = coverageProp.initializer;
	const coreRes = syncCoverageCorePropertiesAst(covObj, sf);
	const excludeRes = syncCoverageExcludePropertyAst(coreRes.props, covObj, auditConfig, sf, projectRoot);
	if (!(coreRes.modified || excludeRes.modified)) return {
		props,
		modified: false
	};
	return {
		props: updateObjectProperty(props, "coverage", ts.factory.createObjectLiteralExpression(excludeRes.props, true), sf),
		modified: true
	};
}
function toTestGlobPattern(root) {
	return root.includes("*") ? root : `${root}/**/*.{test,spec}.ts`;
}
function findPropInList(props, propName, sf) {
	for (const prop of props) if (ts.isPropertyAssignment(prop) && getPropertyKeyName(prop.name, sf) === propName) return prop;
}
function syncTestProjectsAst(props, testProjectsConfig, sf) {
	let modified = false;
	const projectsProp = findPropInList(props, "projects", sf);
	const updatedElements = [...projectsProp && ts.isArrayLiteralExpression(projectsProp.initializer) ? [...projectsProp.initializer.elements] : []];
	const handledProjects = /* @__PURE__ */ new Set();
	for (let i = 0; i < updatedElements.length; i++) {
		const el = updatedElements[i];
		if (!el || !ts.isObjectLiteralExpression(el)) continue;
		const info = extractProjectInfoFromElement(el, sf);
		const configuredRoots = info.name ? testProjectsConfig[info.name] : void 0;
		if (info.name && configuredRoots) {
			handledProjects.add(info.name);
			const expectedPatterns = configuredRoots.map(toTestGlobPattern);
			const targetObj = info.innerTestObj ?? el;
			const targetProps = [...targetObj.properties];
			const existingIncludes = extractStringArrayProp(targetObj, "include", sf);
			const missing = expectedPatterns.filter((p) => !existingIncludes.some((inc) => inc === p || isPathUnderRoot(inc, p)));
			if (missing.length > 0) {
				const updatedTargetProps = updateObjectProperty(targetProps, "include", valueToAstExpression(Array.from(/* @__PURE__ */ new Set([...existingIncludes, ...missing]))), sf);
				if (info.innerTestObj) {
					const updatedOuterProps = updateObjectProperty(el.properties, "test", ts.factory.createObjectLiteralExpression(updatedTargetProps, true), sf);
					updatedElements[i] = ts.factory.createObjectLiteralExpression(updatedOuterProps, true);
				} else updatedElements[i] = ts.factory.createObjectLiteralExpression(updatedTargetProps, true);
				modified = true;
			}
		}
	}
	for (const [projName, roots] of Object.entries(testProjectsConfig)) if (!handledProjects.has(projName)) {
		const patterns = roots.map(toTestGlobPattern);
		const newProj = ts.factory.createObjectLiteralExpression([ts.factory.createPropertyAssignment("test", ts.factory.createObjectLiteralExpression([ts.factory.createPropertyAssignment("name", ts.factory.createStringLiteral(projName, true)), ts.factory.createPropertyAssignment("include", valueToAstExpression(patterns))], true))], true);
		updatedElements.push(newProj);
		modified = true;
	}
	if (modified || !projectsProp) return {
		props: updateObjectProperty(props, "projects", ts.factory.createArrayLiteralExpression(updatedElements, true), sf),
		modified: true
	};
	return {
		props,
		modified: false
	};
}
function syncTestSectionAst(testObj, auditConfig, sf, projectRoot) {
	const dedup = deduplicateObjectProperties(testObj.properties, sf);
	let props = dedup.props;
	let modified = dedup.modified;
	const testProjectsConfig = auditConfig.vitePlusConfig?.test?.projects;
	const hasConfiguredProjects = Boolean(testProjectsConfig && Object.keys(testProjectsConfig).length > 0);
	const projectsProp = findPropInList(props, "projects", sf);
	const hasExistingProjects = Boolean(projectsProp && ts.isArrayLiteralExpression(projectsProp.initializer));
	if (hasConfiguredProjects || hasExistingProjects) {
		const rmRes = removeObjectProperty(props, "include", sf);
		props = rmRes.props;
		if (rmRes.modified) modified = true;
		if (hasConfiguredProjects && testProjectsConfig) {
			const projRes = syncTestProjectsAst(props, testProjectsConfig, sf);
			props = projRes.props;
			if (projRes.modified) modified = true;
		}
	} else {
		const includeRes = syncTestIncludeAst(props, auditConfig, sf);
		props = includeRes.props;
		if (includeRes.modified) modified = true;
	}
	const covRes = syncTestCoverageAst(props, auditConfig, sf, projectRoot);
	props = covRes.props;
	if (covRes.modified) modified = true;
	return {
		obj: modified ? ts.factory.createObjectLiteralExpression(props, true) : testObj,
		modified
	};
}
function syncPackSectionOnRoot(rootProps, sf) {
	const packProp = findPropertyAssignment(ts.factory.createObjectLiteralExpression(rootProps, true), "pack", sf);
	if (!packProp || !ts.isObjectLiteralExpression(packProp.initializer)) return {
		props: [ts.factory.createPropertyAssignment("pack", buildPackAstObject()), ...rootProps],
		modified: true
	};
	const packVal = astExpressionToValue(packProp.initializer, sf);
	let packSubProps = [...packProp.initializer.properties];
	let packModified = false;
	if (packVal.publint !== true) {
		packSubProps = updateObjectProperty(packSubProps, "publint", ts.factory.createTrue(), sf);
		packModified = true;
	}
	if (typeof packVal.attw !== "object" || packVal.attw === null) {
		packSubProps = updateObjectProperty(packSubProps, "attw", valueToAstExpression({ profile: "esm-only" }), sf);
		packModified = true;
	}
	const outExtProp = findPropertyAssignment(packProp.initializer, "outExtensions", sf);
	if (outExtProp && ts.isArrowFunction(outExtProp.initializer) && !outExtProp.initializer.type) {
		const returnType = createPackOutExtensionsReturnType();
		const typedArrow = ts.factory.createArrowFunction(outExtProp.initializer.modifiers, outExtProp.initializer.typeParameters, outExtProp.initializer.parameters, returnType, outExtProp.initializer.equalsGreaterThanToken, outExtProp.initializer.body);
		packSubProps = updateObjectProperty(packSubProps, "outExtensions", typedArrow, sf);
		packModified = true;
	}
	if (!packModified) return {
		props: rootProps,
		modified: false
	};
	return {
		props: updateObjectProperty(rootProps, "pack", ts.factory.createObjectLiteralExpression(packSubProps, true), sf),
		modified: true
	};
}
function printTransformedSourceFile(sf, transformer) {
	const result = ts.transform(sf, [transformer]);
	const transformedSf = result.transformed[0];
	const printed = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(transformedSf);
	result.dispose();
	return printed;
}
function syncRunSectionAst(runObj, auditConfig, sf) {
	let modified = false;
	let props = runObj.properties;
	const cacheProp = findPropertyAssignment(runObj, "cache", sf);
	const shouldCache = auditConfig.vitePlusConfig?.run?.cache !== false;
	if (!cacheProp) {
		props = [...props, ts.factory.createPropertyAssignment("cache", shouldCache ? ts.factory.createTrue() : ts.factory.createFalse())];
		modified = true;
	} else if (shouldCache && cacheProp.initializer.kind !== ts.SyntaxKind.TrueKeyword) {
		props = updateObjectProperty(props, "cache", ts.factory.createTrue(), sf);
		modified = true;
	}
	return {
		obj: modified ? ts.factory.createObjectLiteralExpression(props, true) : runObj,
		modified
	};
}
function transformImportDeclaration(node) {
	if (ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "vite") return {
		transformed: ts.factory.updateImportDeclaration(node, node.modifiers, node.importClause, ts.factory.createStringLiteral("vite-plus", true), node.attributes),
		modified: true
	};
	return {
		transformed: node,
		modified: false
	};
}
function transformMethodDeclaration(node, sf, visitBody) {
	if (node.type) return {
		transformed: node,
		modified: false
	};
	const returnType = resolveKnownViteFunctionReturnType(getPropertyKeyName(node.name, sf));
	if (!returnType) return {
		transformed: node,
		modified: false
	};
	return {
		transformed: ts.factory.updateMethodDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.questionToken, node.typeParameters, node.parameters, returnType, node.body ? visitBody(node.body) : void 0),
		modified: true
	};
}
function transformPropertyAssignment(node, sf, visitChild) {
	const name = getPropertyKeyName(node.name, sf);
	if (name === "plugins" && ts.isArrowFunction(node.initializer) && node.initializer.type && ts.isArrayTypeNode(node.initializer.type) && node.initializer.type.elementType.kind === ts.SyntaxKind.UnknownKeyword) {
		const arrow = node.initializer;
		return {
			transformed: ts.factory.updatePropertyAssignment(node, node.name, ts.factory.updateArrowFunction(arrow, arrow.modifiers, arrow.typeParameters, arrow.parameters, void 0, arrow.equalsGreaterThanToken, ts.visitNode(arrow.body, visitChild) ?? arrow.body)),
			modified: true
		};
	}
	const returnType = resolveKnownViteFunctionReturnType(name);
	if (!returnType) return {
		transformed: node,
		modified: false
	};
	if (ts.isArrowFunction(node.initializer) && !node.initializer.type) {
		const arrow = node.initializer;
		return {
			transformed: ts.factory.updatePropertyAssignment(node, node.name, ts.factory.updateArrowFunction(arrow, arrow.modifiers, arrow.typeParameters, arrow.parameters, returnType, arrow.equalsGreaterThanToken, ts.visitNode(arrow.body, visitChild) ?? arrow.body)),
			modified: true
		};
	}
	if (ts.isFunctionExpression(node.initializer) && !node.initializer.type) {
		const fn = node.initializer;
		return {
			transformed: ts.factory.updatePropertyAssignment(node, node.name, ts.factory.updateFunctionExpression(fn, fn.modifiers, fn.asteriskToken, fn.name, fn.typeParameters, fn.parameters, returnType, ts.visitNode(fn.body, visitChild) ?? fn.body)),
			modified: true
		};
	}
	return {
		transformed: node,
		modified: false
	};
}
function transformFunctionDeclaration(node, visitBody) {
	if (node.type || !node.name) return {
		transformed: node,
		modified: false
	};
	const returnType = resolveKnownViteFunctionReturnType(node.name.text);
	if (!returnType) return {
		transformed: node,
		modified: false
	};
	return {
		transformed: ts.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, returnType, node.body ? visitBody(node.body) : void 0),
		modified: true
	};
}
function transformLockedSkillsVariableStatement(stmt, lockedSkillsIgnores) {
	const decl = stmt.declarationList.declarations[0];
	if (!decl || !decl.initializer) return {
		transformed: stmt,
		modified: false
	};
	let init = decl.initializer;
	if (ts.isAsExpression(init)) init = init.expression;
	if (!ts.isArrayLiteralExpression(init)) return {
		transformed: stmt,
		modified: false
	};
	const currentVals = [];
	for (const el of init.elements) if (ts.isStringLiteral(el)) currentVals.push(el.text);
	if (currentVals.length === lockedSkillsIgnores.length && lockedSkillsIgnores.every((g, i) => currentVals[i] === g)) return {
		transformed: stmt,
		modified: false
	};
	return {
		transformed: buildLockedSkillsVariableStatement(lockedSkillsIgnores),
		modified: true
	};
}
function applyViteConfigAstTransformations(sf, rootObj, updatedRootObj, lockedSkillsIgnores = []) {
	let modified = false;
	const existingLockedVar = findVariableStatementForName(sf, "LOCKED_SKILLS_IGNORE_PATTERNS");
	const transformer = (context) => {
		const visit = (node) => {
			if (ts.isVariableStatement(node) && node === existingLockedVar && lockedSkillsIgnores.length > 0) {
				const res = transformLockedSkillsVariableStatement(node, lockedSkillsIgnores);
				if (res.modified) {
					modified = true;
					return res.transformed;
				}
			}
			if (ts.isImportDeclaration(node)) {
				const imp = transformImportDeclaration(node);
				if (imp.modified) {
					modified = true;
					return imp.transformed;
				}
			}
			if (ts.isMethodDeclaration(node)) {
				const method = transformMethodDeclaration(node, sf, (b) => ts.visitEachChild(b, visit, context));
				if (method.modified) {
					modified = true;
					return method.transformed;
				}
			}
			if (ts.isPropertyAssignment(node)) {
				const prop = transformPropertyAssignment(node, sf, visit);
				if (prop.modified) {
					modified = true;
					return prop.transformed;
				}
			}
			if (ts.isFunctionDeclaration(node)) {
				const fn = transformFunctionDeclaration(node, (b) => ts.visitEachChild(b, visit, context));
				if (fn.modified) {
					modified = true;
					return fn.transformed;
				}
			}
			if (node === rootObj) return ts.visitEachChild(updatedRootObj, visit, context);
			return ts.visitEachChild(node, visit, context);
		};
		return (source) => {
			let visitedStatements = source.statements.map((stmt) => ts.visitNode(stmt, visit));
			if (lockedSkillsIgnores.length > 0 && !existingLockedVar) {
				const exportIdx = visitedStatements.findIndex((s) => ts.isExportAssignment(s));
				const lockedConst = buildLockedSkillsVariableStatement(lockedSkillsIgnores);
				if (exportIdx >= 0) visitedStatements = [
					...visitedStatements.slice(0, exportIdx),
					lockedConst,
					...visitedStatements.slice(exportIdx)
				];
				else visitedStatements.push(lockedConst);
				modified = true;
			}
			return ts.factory.updateSourceFile(source, visitedStatements);
		};
	};
	return {
		transformedContent: printTransformedSourceFile(sf, transformer),
		modified
	};
}
function syncViteRunSection(rootProps, sf, auditConfig) {
	const runProp = findPropertyAssignment(ts.factory.createObjectLiteralExpression(rootProps, true), "run", sf);
	if (!runProp || !ts.isObjectLiteralExpression(runProp.initializer)) return {
		props: [...rootProps, ts.factory.createPropertyAssignment("run", buildRunAstObject(auditConfig))],
		modified: true
	};
	const syncedRun = syncRunSectionAst(runProp.initializer, auditConfig, sf);
	if (syncedRun.modified) return {
		props: updateObjectProperty(rootProps, "run", syncedRun.obj, sf),
		modified: true
	};
	return {
		props: rootProps,
		modified: false
	};
}
function syncViteTestSection(rootProps, sf, auditConfig, legacyTestProp, projectRoot) {
	const testProp = findPropertyAssignment(ts.factory.createObjectLiteralExpression(rootProps, true), "test", sf);
	if (!testProp || !ts.isObjectLiteralExpression(testProp.initializer)) {
		const newTestProp = legacyTestProp ?? ts.factory.createPropertyAssignment("test", buildTestAstObject(auditConfig));
		return {
			props: [...rootProps, newTestProp],
			modified: true
		};
	}
	const syncedTest = syncTestSectionAst(testProp.initializer, auditConfig, sf, projectRoot);
	if (syncedTest.modified) return {
		props: updateObjectProperty(rootProps, "test", syncedTest.obj, sf),
		modified: true
	};
	return {
		props: rootProps,
		modified: false
	};
}
function syncViteLintAndFmtSections(rootProps, sf, auditConfig, lintIgnores, fmtIgnores, lockedSkillsIgnores = []) {
	let props = rootProps;
	let modified = false;
	const currentRoot = () => ts.factory.createObjectLiteralExpression(props, true);
	const lintProp = findPropertyAssignment(currentRoot(), "lint", sf);
	if (!lintProp || !ts.isObjectLiteralExpression(lintProp.initializer)) {
		props = [...props, ts.factory.createPropertyAssignment("lint", buildLintAstObject(auditConfig, lintIgnores, lockedSkillsIgnores))];
		modified = true;
	} else {
		const syncedLint = syncLintSectionAst(lintProp.initializer, auditConfig, lintIgnores, sf, lockedSkillsIgnores);
		if (syncedLint.modified) {
			props = updateObjectProperty(props, "lint", syncedLint.obj, sf);
			modified = true;
		}
	}
	const fmtProp = findPropertyAssignment(currentRoot(), "fmt", sf);
	if (!fmtProp || !ts.isObjectLiteralExpression(fmtProp.initializer)) {
		props = [...props, ts.factory.createPropertyAssignment("fmt", buildFmtAstObject(auditConfig, fmtIgnores, lockedSkillsIgnores))];
		modified = true;
	} else {
		const syncedFmt = syncFmtSectionAst(fmtProp.initializer, auditConfig, fmtIgnores, sf, lockedSkillsIgnores);
		if (syncedFmt.modified) {
			props = updateObjectProperty(props, "fmt", syncedFmt.obj, sf);
			modified = true;
		}
	}
	const stagedProp = findPropertyAssignment(currentRoot(), "staged", sf);
	if (!stagedProp || !ts.isObjectLiteralExpression(stagedProp.initializer)) {
		props = [...props, ts.factory.createPropertyAssignment("staged", buildStagedAstObject(auditConfig))];
		modified = true;
	}
	return {
		props,
		modified
	};
}
function synchronizeViteConfigAst(fileContent, auditConfig, lintIgnores, fmtIgnores, legacyTestProp, projectRoot = process.cwd()) {
	const sf = parseTsSourceFile(fileContent);
	const rootObj = findConfigRootObject(sf);
	if (!rootObj) return {
		content: fileContent,
		modified: false
	};
	const lockedSkillsIgnores = getLockedSkillsIgnoreGlobs(projectRoot).filter((g) => lintIgnores.includes(g) || fmtIgnores.includes(g));
	const dedupRoot = deduplicateObjectProperties(rootObj.properties, sf);
	let rootProps = dedupRoot.props;
	let modified = dedupRoot.modified;
	if (auditConfig.packageDistribution?.enabled === true) {
		const syncedPack = syncPackSectionOnRoot(rootProps, sf);
		rootProps = syncedPack.props;
		if (syncedPack.modified) modified = true;
	}
	const runResult = syncViteRunSection(rootProps, sf, auditConfig);
	rootProps = runResult.props;
	if (runResult.modified) modified = true;
	const testResult = syncViteTestSection(rootProps, sf, auditConfig, legacyTestProp, projectRoot);
	rootProps = testResult.props;
	if (testResult.modified) modified = true;
	const lintFmtResult = syncViteLintAndFmtSections(rootProps, sf, auditConfig, lintIgnores, fmtIgnores, lockedSkillsIgnores);
	rootProps = lintFmtResult.props;
	if (lintFmtResult.modified) modified = true;
	if (sf.statements.some((stmt) => ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier) && stmt.moduleSpecifier.text === "vite")) modified = true;
	const astTransformResult = applyViteConfigAstTransformations(sf, rootObj, ts.factory.createObjectLiteralExpression(rootProps, true), lockedSkillsIgnores);
	if (!modified && !astTransformResult.modified) return {
		content: fileContent,
		modified: false
	};
	return {
		content: astTransformResult.transformedContent,
		modified: true
	};
}
/**
* Rewrites import/export module specifiers from 'vitest' -> 'vite-plus/test' and 'vite' -> 'vite-plus'
* strictly via TypeScript Compiler AST spans (never touching string literals inside code or comments).
*/
function rewriteModuleSpecifiersToVitePlusAst(content, fileName) {
	const sf = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
	const replacements = [];
	function checkLiteral(lit) {
		if (lit.text === "vitest") replacements.push({
			start: lit.getStart(sf),
			end: lit.getEnd(),
			text: "'vite-plus/test'"
		});
		else if (lit.text === "vite") replacements.push({
			start: lit.getStart(sf),
			end: lit.getEnd(),
			text: "'vite-plus'"
		});
	}
	function visit(node) {
		if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) checkLiteral(node.moduleSpecifier);
		else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) checkLiteral(node.arguments[0]);
		ts.forEachChild(node, visit);
	}
	visit(sf);
	if (replacements.length === 0) return content;
	replacements.sort((a, b) => b.start - a.start);
	let updated = content;
	for (const r of replacements) updated = updated.slice(0, r.start) + r.text + updated.slice(r.end);
	return updated;
}
function countIdentifierOccurrences(id, node) {
	let count = 0;
	function visit(n) {
		if (ts.isIdentifier(n) && n.text === id) count++;
		ts.forEachChild(n, visit);
	}
	visit(node);
	return count;
}
function collectIdentifiersInNode(node) {
	const ids = /* @__PURE__ */ new Set();
	function visit(n) {
		if (ts.isIdentifier(n)) ids.add(n.text);
		ts.forEachChild(n, visit);
	}
	visit(node);
	return ids;
}
function findVariableStatementForName(rootNode, varName) {
	let found = null;
	function walk(node) {
		if (found) return;
		if (ts.isVariableStatement(node) && node.declarationList.declarations.some((decl) => ts.isIdentifier(decl.name) && decl.name.text === varName)) {
			found = node;
			return;
		}
		ts.forEachChild(node, walk);
	}
	walk(rootNode);
	return found;
}
function isPluginsPushCall(expr, varName) {
	if (!ts.isCallExpression(expr)) return false;
	const callee = expr.expression;
	if (!ts.isPropertyAccessExpression(callee)) return false;
	return ts.isIdentifier(callee.expression) && callee.expression.text === varName && callee.name.text === "push";
}
function hasPluginsPushInNode(root, varName) {
	let found = false;
	function walk(node) {
		if (found) return;
		if (ts.isCallExpression(node) && isPluginsPushCall(node, varName)) {
			found = true;
			return;
		}
		ts.forEachChild(node, walk);
	}
	walk(root);
	return found;
}
function collectPluginsPushArguments(root, varName, sf) {
	const args = [];
	function walk(node) {
		if (ts.isCallExpression(node) && isPluginsPushCall(node, varName)) for (const arg of node.arguments) args.push(arg.getText(sf));
		ts.forEachChild(node, walk);
	}
	walk(root);
	return args;
}
function shouldRemovePluginStatement(stmt, varStmtToRemove, varName, movedFunctionStmts, movedVariableStmts) {
	if (varStmtToRemove && stmt === varStmtToRemove) return true;
	if (ts.isFunctionDeclaration(stmt) && movedFunctionStmts?.has(stmt)) return true;
	if (ts.isVariableStatement(stmt) && movedVariableStmts?.has(stmt)) return true;
	if (!varName) return false;
	if (ts.isExpressionStatement(stmt) && isPluginsPushCall(stmt.expression, varName)) return true;
	if (ts.isIfStatement(stmt)) {
		if (ts.isExpressionStatement(stmt.thenStatement) && isPluginsPushCall(stmt.thenStatement.expression, varName)) return !stmt.elseStatement;
		if (ts.isBlock(stmt.thenStatement)) {
			const blockStmts = stmt.thenStatement.statements;
			if (blockStmts.length > 0 && blockStmts.every((s) => ts.isExpressionStatement(s) && isPluginsPushCall(s.expression, varName))) return !stmt.elseStatement;
		}
	}
	return false;
}
function countIdentifierOccurrencesInRemovableStatements(name, sf, varStmtToRemove, pluginVarName, movedFunctionStmts, movedVariableStmts) {
	let count = 0;
	function walk(node) {
		if (ts.isStatement(node) && shouldRemovePluginStatement(node, varStmtToRemove, pluginVarName, movedFunctionStmts, movedVariableStmts)) {
			count += countIdentifierOccurrences(name, node);
			return;
		}
		ts.forEachChild(node, walk);
	}
	walk(sf);
	return count;
}
function countIdentifierOccurrencesInRemovable(name, sf, varStmtToRemove, pluginProp, pluginVarName, movedFunctionStmts, movedVariableStmts) {
	let count = countIdentifierOccurrencesInRemovableStatements(name, sf, varStmtToRemove, pluginVarName, movedFunctionStmts, movedVariableStmts);
	if (!varStmtToRemove && pluginProp && ts.isPropertyAssignment(pluginProp)) count += countIdentifierOccurrences(name, pluginProp.initializer);
	return count;
}
function isSpecifierUsedElsewhere(specName, sf, importStmt, varStmtToRemove, pluginProp, pluginVarName, movedFunctionStmts, movedVariableStmts) {
	if (specName === "defineConfig") return true;
	return countIdentifierOccurrences(specName, sf) > countIdentifierOccurrences(specName, importStmt) + countIdentifierOccurrencesInRemovable(specName, sf, varStmtToRemove, pluginProp, pluginVarName, movedFunctionStmts, movedVariableStmts);
}
function combinePluginsExpressions(baseExprText, pushedPluginTexts) {
	if (pushedPluginTexts.length === 0) return baseExprText;
	const trimmed = baseExprText.trim();
	if (trimmed === "[]") return `[\n  ${pushedPluginTexts.join(",\n  ")}\n]`;
	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		const inner = trimmed.slice(1, -1).trim();
		if (!inner) return `[\n  ${pushedPluginTexts.join(",\n  ")}\n]`;
		return `[\n  ${inner},\n  ${pushedPluginTexts.join(",\n  ")}\n]`;
	}
	return `[\n  ...${trimmed},\n  ${pushedPluginTexts.join(",\n  ")}\n]`;
}
function hasVitePluginsImportDeclaration(sf) {
	return sf.statements.some((stmt) => ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier) && (stmt.moduleSpecifier.text === "./vite.plugins.ts" || stmt.moduleSpecifier.text === "./vite.plugins"));
}
function isPluginFunctionDeclaration(stmt, sf, pluginIds) {
	if (!ts.isFunctionDeclaration(stmt) || !stmt.name) return false;
	const name = stmt.name.text;
	if (pluginIds?.has(name)) return true;
	const isPluginNaming = name.endsWith("Plugin") || name.endsWith("Plugins");
	let isPluginReturnType = false;
	if (stmt.type) {
		const typeText = stmt.type.getText(sf);
		if (typeText === "Plugin" || typeText === "PluginOption" || typeText.includes("Plugin")) isPluginReturnType = true;
	}
	return isPluginNaming || isPluginReturnType;
}
function hasUnmigratedPluginFunctions(sf) {
	for (const stmt of sf.statements) if (isPluginFunctionDeclaration(stmt, sf)) {
		if (countIdentifierOccurrences(stmt.name.text, sf) <= 1) return true;
	}
	return false;
}
/**
* Detects whether vite.config.ts contains inline Vite plugins vs modular vite.plugins.ts.
*/
function detectInlineVitePlugins(sf) {
	const hasVitePluginsImport = hasVitePluginsImportDeclaration(sf);
	const rootObj = findConfigRootObject(sf);
	if (!rootObj) return {
		hasPlugins: false,
		isAlreadyModular: false,
		hasInlinePlugins: false
	};
	let pluginsProperty;
	for (const p of rootObj.properties) if (ts.isPropertyAssignment(p) && getPropertyKeyName(p.name, sf) === "plugins" || ts.isShorthandPropertyAssignment(p) && p.name.text === "plugins") {
		pluginsProperty = p;
		break;
	}
	if (!pluginsProperty) return {
		hasPlugins: false,
		isAlreadyModular: false,
		hasInlinePlugins: false
	};
	const localPluginsVar = findVariableStatementForName(sf, "plugins");
	const hasPluginsPush = hasPluginsPushInNode(sf, "plugins");
	const hasPluginFunctions = hasUnmigratedPluginFunctions(sf);
	if (hasVitePluginsImport) {
		const isShorthand = ts.isShorthandPropertyAssignment(pluginsProperty);
		const isIdentifierMatch = ts.isPropertyAssignment(pluginsProperty) && ts.isIdentifier(pluginsProperty.initializer) && pluginsProperty.initializer.text === "plugins";
		if ((isShorthand || isIdentifierMatch) && !localPluginsVar && !hasPluginsPush && !hasPluginFunctions) return {
			hasPlugins: true,
			isAlreadyModular: true,
			hasInlinePlugins: false,
			pluginsProperty
		};
		return {
			hasPlugins: true,
			isAlreadyModular: false,
			hasInlinePlugins: true,
			pluginsProperty
		};
	}
	if (ts.isPropertyAssignment(pluginsProperty) && ts.isArrayLiteralExpression(pluginsProperty.initializer)) {
		const elements = pluginsProperty.initializer.elements;
		if (elements.length > 0 && elements.every((el) => el.getText(sf).includes("vitePrecompressPlugin"))) return {
			hasPlugins: true,
			isAlreadyModular: true,
			hasInlinePlugins: false,
			pluginsProperty
		};
		return {
			hasPlugins: true,
			isAlreadyModular: false,
			hasInlinePlugins: true,
			pluginsProperty
		};
	}
	return {
		hasPlugins: true,
		isAlreadyModular: false,
		hasInlinePlugins: Boolean(localPluginsVar || hasPluginsPush || hasPluginFunctions),
		pluginsProperty
	};
}
function extractImportedNames(importClause) {
	if (!importClause) return [];
	const names = [];
	if (importClause.name) names.push(importClause.name.text);
	const bindings = importClause.namedBindings;
	if (!bindings) return names;
	if (ts.isNamedImports(bindings)) for (const el of bindings.elements) names.push(el.name.text);
	else if (ts.isNamespaceImport(bindings)) names.push(bindings.name.text);
	return names;
}
function resolvePluginsExpressionAndVariable(sf, pluginProp) {
	let pluginsExprText = "[]";
	let varName = null;
	if (ts.isShorthandPropertyAssignment(pluginProp)) varName = pluginProp.name.text;
	else if (ts.isPropertyAssignment(pluginProp)) {
		const init = pluginProp.initializer;
		if (ts.isArrayLiteralExpression(init)) pluginsExprText = init.getText(sf);
		else if (ts.isIdentifier(init)) varName = init.text;
		else if ((ts.isAsExpression(init) || ts.isTypeAssertionExpression(init)) && ts.isIdentifier(init.expression)) varName = init.expression.text;
		else pluginsExprText = init.getText(sf);
	}
	const effectiveVarName = varName ?? "plugins";
	const foundStmt = findVariableStatementForName(sf, effectiveVarName);
	let varStmtToRemove = null;
	if (foundStmt && ts.isVariableStatement(foundStmt)) {
		const decl = foundStmt.declarationList.declarations.find((d) => ts.isIdentifier(d.name) && d.name.text === effectiveVarName);
		if (decl?.initializer) pluginsExprText = decl.initializer.getText(sf);
		varStmtToRemove = foundStmt;
	}
	const pushedPluginTexts = collectPluginsPushArguments(sf, effectiveVarName, sf);
	return {
		pluginsExprText: combinePluginsExpressions(pluginsExprText, pushedPluginTexts),
		varStmtToRemove,
		pushedPluginTexts,
		pluginVarName: effectiveVarName
	};
}
function isPluginModuleSpecifier(modSpec) {
	return modSpec.startsWith("@vitejs/plugin-") || modSpec.startsWith("vite-plugin-") || modSpec.startsWith("rollup-plugin-") || modSpec === "@tailwindcss/vite" || modSpec.includes("vite-plugin");
}
function isImportUsedElsewhere(names, sf, stmt, varStmtToRemove, pluginProp, pluginVarName, movedFunctionStmts, movedVariableStmts) {
	for (const name of names) if (countIdentifierOccurrences(name, sf) > countIdentifierOccurrences(name, stmt) + countIdentifierOccurrencesInRemovable(name, sf, varStmtToRemove, pluginProp, pluginVarName, movedFunctionStmts, movedVariableStmts)) return true;
	return false;
}
function tryCollectPluginFunction(stmt, sf, expandedPluginIds, movedFunctionStmts, varStmtToRemove, pluginProp, pluginVarName, movedVariableStmts) {
	if (!ts.isFunctionDeclaration(stmt) || !stmt.name || movedFunctionStmts.has(stmt) || !isPluginFunctionDeclaration(stmt, sf, expandedPluginIds)) return false;
	const fnName = stmt.name.text;
	if (countIdentifierOccurrences(fnName, sf) > 1 + countIdentifierOccurrencesInRemovable(fnName, sf, varStmtToRemove, pluginProp, pluginVarName, movedFunctionStmts, movedVariableStmts)) return false;
	movedFunctionStmts.add(stmt);
	for (const id of collectIdentifiersInNode(stmt)) expandedPluginIds.add(id);
	return true;
}
function isRemovablePluginVariableDeclaration(decl, sf, expandedPluginIds, varStmtToRemove, pluginProp, pluginVarName, movedFunctionStmts, movedVariableStmts) {
	if (!ts.isIdentifier(decl.name)) return false;
	const varName = decl.name.text;
	const isPluginName = varName.endsWith("Plugin") || varName.endsWith("Plugins");
	const isReferenced = expandedPluginIds.has(varName);
	if (!isPluginName && !isReferenced) return false;
	return countIdentifierOccurrences(varName, sf) <= 1 + countIdentifierOccurrencesInRemovable(varName, sf, varStmtToRemove, pluginProp, pluginVarName, movedFunctionStmts, movedVariableStmts);
}
function tryCollectPluginVariable(stmt, sf, expandedPluginIds, movedVariableStmts, varStmtToRemove, pluginProp, pluginVarName, movedFunctionStmts) {
	if (!ts.isVariableStatement(stmt) || stmt === varStmtToRemove || movedVariableStmts.has(stmt)) return false;
	if (!stmt.declarationList.declarations.some((d) => isRemovablePluginVariableDeclaration(d, sf, expandedPluginIds, varStmtToRemove, pluginProp, pluginVarName, movedFunctionStmts, movedVariableStmts))) return false;
	movedVariableStmts.add(stmt);
	for (const id of collectIdentifiersInNode(stmt)) expandedPluginIds.add(id);
	return true;
}
function collectMovedPluginDeclarations(sf, pluginIds, varStmtToRemove, pluginProp, pluginVarName) {
	const movedFunctionStmts = /* @__PURE__ */ new Set();
	const movedVariableStmts = /* @__PURE__ */ new Set();
	const expandedPluginIds = new Set(pluginIds);
	let addedMore = true;
	while (addedMore) {
		addedMore = false;
		for (const stmt of sf.statements) if (tryCollectPluginFunction(stmt, sf, expandedPluginIds, movedFunctionStmts, varStmtToRemove, pluginProp, pluginVarName, movedVariableStmts)) addedMore = true;
		else if (tryCollectPluginVariable(stmt, sf, expandedPluginIds, movedVariableStmts, varStmtToRemove, pluginProp, pluginVarName, movedFunctionStmts)) addedMore = true;
	}
	return {
		movedFunctionStmts,
		movedVariableStmts,
		expandedPluginIds
	};
}
function collectVitePlusTypes(stmt, pluginIds, extraVitePlusTypes) {
	const namedBindings = stmt.importClause?.namedBindings;
	if (!namedBindings || !ts.isNamedImports(namedBindings)) return;
	for (const el of namedBindings.elements) if (el.name.text !== "defineConfig" && pluginIds.has(el.name.text)) extraVitePlusTypes.add(el.name.text);
}
function categorizePluginImports(sf, pluginIds, varStmtToRemove, pluginProp, pluginVarName, movedFunctionStmts, movedVariableStmts) {
	const movedImportStmts = /* @__PURE__ */ new Set();
	const pluginImportsForNewFile = [];
	const extraVitePlusTypes = /* @__PURE__ */ new Set();
	for (const stmt of sf.statements) {
		if (!ts.isImportDeclaration(stmt)) continue;
		const importedNames = extractImportedNames(stmt.importClause);
		const modSpec = stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier) ? stmt.moduleSpecifier.text : "";
		if (modSpec === "vite" || modSpec === "vite-plus") {
			collectVitePlusTypes(stmt, pluginIds, extraVitePlusTypes);
			continue;
		}
		const isPluginPackage = isPluginModuleSpecifier(modSpec);
		const matchesPluginId = importedNames.some((n) => pluginIds.has(n));
		if (!isPluginPackage && !matchesPluginId) continue;
		if (!isImportUsedElsewhere(importedNames, sf, stmt, varStmtToRemove, pluginProp, pluginVarName, movedFunctionStmts, movedVariableStmts)) movedImportStmts.add(stmt);
		pluginImportsForNewFile.push(stmt.getText(sf));
	}
	return {
		movedImportStmts,
		pluginImportsForNewFile,
		extraVitePlusTypes
	};
}
function injectExtraNamedImports(stmt, extraTypes) {
	const clause = stmt.importClause;
	if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) return stmt;
	const currentNames = new Set(clause.namedBindings.elements.map((e) => e.name.text));
	const newElements = [...clause.namedBindings.elements];
	for (const extraType of extraTypes) if (!currentNames.has(extraType)) {
		newElements.push(ts.factory.createImportSpecifier(false, void 0, ts.factory.createIdentifier(extraType)));
		currentNames.add(extraType);
	}
	return ts.factory.updateImportDeclaration(stmt, stmt.modifiers, ts.factory.updateImportClause(clause, clause.isTypeOnly, clause.name, ts.factory.updateNamedImports(clause.namedBindings, newElements)), stmt.moduleSpecifier, stmt.attributes);
}
function collectExistingPluginsAstMetadata(sf) {
	const existingFnNames = /* @__PURE__ */ new Set();
	const existingVarNames = /* @__PURE__ */ new Set();
	const existingImportNames = /* @__PURE__ */ new Set();
	for (const stmt of sf.statements) {
		if (ts.isFunctionDeclaration(stmt) && stmt.name) {
			existingFnNames.add(stmt.name.text);
			continue;
		}
		if (ts.isImportDeclaration(stmt)) {
			for (const n of extractImportedNames(stmt.importClause)) existingImportNames.add(n);
			continue;
		}
		if (!ts.isVariableStatement(stmt)) continue;
		for (const d of stmt.declarationList.declarations) {
			if (!ts.isIdentifier(d.name)) continue;
			existingVarNames.add(d.name.text);
		}
	}
	return {
		existingFnNames,
		existingVarNames,
		existingImportNames
	};
}
function collectMissingPluginDeclarations(movedFunctionStmts, movedVariableStmts, existingFnNames, existingVarNames, sfConfig) {
	const missing = [];
	for (const fn of movedFunctionStmts) if (fn.name && !existingFnNames.has(fn.name.text)) missing.push(fn.getFullText(sfConfig).trim());
	for (const v of movedVariableStmts) if (!v.declarationList.declarations.filter((d) => ts.isIdentifier(d.name)).map((d) => d.name.text).some((n) => existingVarNames.has(n))) missing.push(v.getFullText(sfConfig).trim());
	return missing;
}
function collectMissingPluginImportLines(pluginImportsForNewFile, existingImportNames) {
	const missingLines = [];
	for (const impLine of pluginImportsForNewFile) {
		const tempSf = parseTsSourceFile(impLine, "temp.ts");
		for (const stmt of tempSf.statements) {
			if (!ts.isImportDeclaration(stmt)) continue;
			const names = extractImportedNames(stmt.importClause);
			if (!names.some((n) => !existingImportNames.has(n))) continue;
			missingLines.push(impLine);
			for (const n of names) existingImportNames.add(n);
		}
	}
	return missingLines;
}
function updateVitePlusImportTypes(content, extraVitePlusTypes) {
	if (extraVitePlusTypes.size === 0) return content;
	const sf = parseTsSourceFile(content, "vite.plugins.ts");
	let vitePlusImportStmt = null;
	for (const stmt of sf.statements) if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier) && (stmt.moduleSpecifier.text === "vite-plus" || stmt.moduleSpecifier.text === "vite")) {
		vitePlusImportStmt = stmt;
		break;
	}
	if (!vitePlusImportStmt) return content;
	const currentTypes = extractImportedNames(vitePlusImportStmt.importClause);
	if ([...extraVitePlusTypes].filter((t) => !currentTypes.includes(t)).length === 0) return content;
	const oldImportText = vitePlusImportStmt.getText(sf);
	const updatedImportStmt = injectExtraNamedImports(vitePlusImportStmt, extraVitePlusTypes);
	const newImportText = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printNode(ts.EmitHint.Unspecified, updatedImportStmt, sf);
	return content.replace(oldImportText, newImportText);
}
function insertMissingPluginImports(content, missingImportLines) {
	if (missingImportLines.length === 0) return content;
	const sf = parseTsSourceFile(content, "vite.plugins.ts");
	let lastImportEndPos = 0;
	for (const stmt of sf.statements) if (ts.isImportDeclaration(stmt)) lastImportEndPos = Math.max(lastImportEndPos, stmt.end);
	const importsBlock = missingImportLines.join("\n") + "\n";
	if (lastImportEndPos > 0) {
		const nextNewline = content.indexOf("\n", lastImportEndPos);
		const insertAt = nextNewline !== -1 ? nextNewline + 1 : lastImportEndPos;
		return content.slice(0, insertAt) + importsBlock + content.slice(insertAt);
	}
	return importsBlock + content;
}
function insertMissingDeclarationsIntoPlugins(content, missingDeclarations) {
	if (missingDeclarations.length === 0) return content;
	const sf = parseTsSourceFile(content, "vite.plugins.ts");
	let exportPluginsStartPos = -1;
	for (const stmt of sf.statements) if (ts.isVariableStatement(stmt)) {
		for (const d of stmt.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === "plugins") {
			exportPluginsStartPos = stmt.getStart(sf);
			break;
		}
		if (exportPluginsStartPos !== -1) break;
	}
	const declsBlock = "\n" + missingDeclarations.join("\n\n") + "\n\n";
	if (exportPluginsStartPos === -1) return content + declsBlock;
	return content.slice(0, exportPluginsStartPos) + declsBlock + content.slice(exportPluginsStartPos);
}
function updatePluginsInitializerAst(content, pluginsExprText) {
	if (pluginsExprText === "[]") return content;
	const sf = parseTsSourceFile(content, "vite.plugins.ts");
	for (const stmt of sf.statements) {
		if (!ts.isVariableStatement(stmt)) continue;
		for (const d of stmt.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === "plugins" && d.initializer && ts.isArrayLiteralExpression(d.initializer) && d.initializer.elements.length === 0) {
			const initStart = d.initializer.getStart(sf);
			const initEnd = d.initializer.getEnd();
			return content.slice(0, initStart) + pluginsExprText + content.slice(initEnd);
		}
	}
	return content;
}
function updateExistingVitePluginsAst(existingContent, movedFunctionStmts, movedVariableStmts, extraVitePlusTypes, pluginImportsForNewFile, pluginsExprText, sfConfig) {
	const meta = collectExistingPluginsAstMetadata(parseTsSourceFile(existingContent, "vite.plugins.ts"));
	const missingDeclarations = collectMissingPluginDeclarations(movedFunctionStmts, movedVariableStmts, meta.existingFnNames, meta.existingVarNames, sfConfig);
	const missingImportLines = collectMissingPluginImportLines(pluginImportsForNewFile, meta.existingImportNames);
	let updatedContent = updateVitePlusImportTypes(existingContent, extraVitePlusTypes);
	updatedContent = insertMissingPluginImports(updatedContent, missingImportLines);
	updatedContent = insertMissingDeclarationsIntoPlugins(updatedContent, missingDeclarations);
	updatedContent = updatePluginsInitializerAst(updatedContent, pluginsExprText);
	return updatedContent;
}
/**
* Extracts inline Vite plugins from vite.config.ts into a modular vite.plugins.ts file.
* Returns the transformed vite.config.ts and the generated vite.plugins.ts content.
*/
function extractVitePluginsToModule(viteConfigContent, projectRoot) {
	const sf = parseTsSourceFile(viteConfigContent, "vite.config.ts");
	const detection = detectInlineVitePlugins(sf);
	if (!detection.hasPlugins) return {
		hasPlugins: false,
		isAlreadyModular: false,
		viteConfigContent,
		vitePluginsContent: null,
		modified: false
	};
	const rootObj = findConfigRootObject(sf);
	if (!rootObj || !detection.pluginsProperty) return {
		hasPlugins: false,
		isAlreadyModular: false,
		viteConfigContent,
		vitePluginsContent: null,
		modified: false
	};
	if (detection.isAlreadyModular && !detection.hasInlinePlugins) return {
		hasPlugins: true,
		isAlreadyModular: true,
		viteConfigContent,
		vitePluginsContent: null,
		modified: false
	};
	const pluginsFileExists = projectRoot ? fs.existsSync(path.resolve(projectRoot, "vite.plugins.ts")) : false;
	const pluginProp = detection.pluginsProperty;
	const { pluginsExprText, varStmtToRemove, pushedPluginTexts, pluginVarName } = resolvePluginsExpressionAndVariable(sf, pluginProp);
	const initialPluginIds = /* @__PURE__ */ new Set();
	if (varStmtToRemove) for (const id of collectIdentifiersInNode(varStmtToRemove)) initialPluginIds.add(id);
	if (ts.isPropertyAssignment(pluginProp)) for (const id of collectIdentifiersInNode(pluginProp.initializer)) initialPluginIds.add(id);
	for (const pushedText of pushedPluginTexts) {
		const tempSf = parseTsSourceFile(pushedText, "temp.ts");
		for (const id of collectIdentifiersInNode(tempSf)) initialPluginIds.add(id);
	}
	const { movedFunctionStmts, movedVariableStmts, expandedPluginIds } = collectMovedPluginDeclarations(sf, initialPluginIds, varStmtToRemove, pluginProp, pluginVarName);
	const { movedImportStmts, pluginImportsForNewFile, extraVitePlusTypes } = categorizePluginImports(sf, expandedPluginIds, varStmtToRemove, pluginProp, pluginVarName, movedFunctionStmts, movedVariableStmts);
	let generatedPluginsContent = null;
	if (!pluginsFileExists) {
		const importLines = pluginImportsForNewFile.length > 0 ? pluginImportsForNewFile.join("\n") + "\n\n" : "\n";
		const functionsBlock = movedFunctionStmts.size > 0 ? [...movedFunctionStmts].map((fn) => fn.getFullText(sf).trim()).join("\n\n") + "\n\n" : "";
		const variablesBlock = movedVariableStmts.size > 0 ? [...movedVariableStmts].map((v) => v.getFullText(sf).trim()).join("\n\n") + "\n\n" : "";
		const vitePlusTypes = ["PluginOption", ...extraVitePlusTypes];
		generatedPluginsContent = `${`import type { ${[...new Set(vitePlusTypes)].join(", ")} } from 'vite-plus';\n`}${importLines}${functionsBlock}${variablesBlock}export const plugins: PluginOption[] = ${pluginsExprText};\n`;
	} else if (projectRoot) {
		const existingPluginsPath = path.resolve(projectRoot, "vite.plugins.ts");
		if (fs.existsSync(existingPluginsPath)) generatedPluginsContent = updateExistingVitePluginsAst(fs.readFileSync(existingPluginsPath, "utf8"), movedFunctionStmts, movedVariableStmts, extraVitePlusTypes, pluginImportsForNewFile, pluginsExprText, sf);
	}
	const hasVitePluginsImportAlready = hasVitePluginsImportDeclaration(sf);
	const newImportDecl = ts.factory.createImportDeclaration(void 0, ts.factory.createImportClause(false, void 0, ts.factory.createNamedImports([ts.factory.createImportSpecifier(false, void 0, ts.factory.createIdentifier("plugins"))])), ts.factory.createStringLiteral("./vite.plugins.ts", true));
	const updatedProperties = rootObj.properties.map((p) => {
		if (p === pluginProp) return ts.factory.createShorthandPropertyAssignment(ts.factory.createIdentifier("plugins"));
		return p;
	});
	const updatedRootObj = ts.factory.createObjectLiteralExpression(updatedProperties, true);
	function pruneUnusedSpecifiersFromImport(stmt, sf, varStmtToRemove, pluginProp, pluginVarName, movedFunctionStmts, movedVariableStmts) {
		if (!ts.isStringLiteral(stmt.moduleSpecifier) || stmt.moduleSpecifier.text !== "vite-plus" && stmt.moduleSpecifier.text !== "vite" || !stmt.importClause?.namedBindings || !ts.isNamedImports(stmt.importClause.namedBindings)) return stmt;
		const remainingSpecifiers = stmt.importClause.namedBindings.elements.filter((spec) => isSpecifierUsedElsewhere(spec.name.text, sf, stmt, varStmtToRemove, pluginProp, pluginVarName, movedFunctionStmts, movedVariableStmts));
		if (remainingSpecifiers.length === stmt.importClause.namedBindings.elements.length) return stmt;
		if (remainingSpecifiers.length === 0) return null;
		return ts.factory.updateImportDeclaration(stmt, stmt.modifiers, ts.factory.updateImportClause(stmt.importClause, stmt.importClause.isTypeOnly, stmt.importClause.name, ts.factory.updateNamedImports(stmt.importClause.namedBindings, remainingSpecifiers)), stmt.moduleSpecifier, stmt.attributes);
	}
	function createConfigSubtreeVisitor(rootObj, updatedRootObj, varStmtToRemove, pluginVarName, movedFunctionStmts, movedVariableStmts, context) {
		function visitSubtree(node) {
			if (ts.isStatement(node) && shouldRemovePluginStatement(node, varStmtToRemove, pluginVarName, movedFunctionStmts, movedVariableStmts)) return;
			if (node === rootObj) return updatedRootObj;
			if (ts.isBlock(node)) {
				const remainingStmts = [];
				for (const childStmt of node.statements) {
					if (shouldRemovePluginStatement(childStmt, varStmtToRemove, pluginVarName, movedFunctionStmts, movedVariableStmts)) continue;
					const visited = visitSubtree(childStmt);
					if (visited && ts.isStatement(visited)) remainingStmts.push(visited);
				}
				return ts.factory.updateBlock(node, remainingStmts);
			}
			return context ? ts.visitEachChild(node, visitSubtree, context) : node;
		}
		return visitSubtree;
	}
	const transformer = (context) => {
		return (source) => {
			const newStatements = [];
			let importInjected = hasVitePluginsImportAlready;
			let lastImportIdx = -1;
			for (let i = 0; i < source.statements.length; i++) if (ts.isImportDeclaration(source.statements[i])) lastImportIdx = i;
			const visitSubtree = createConfigSubtreeVisitor(rootObj, updatedRootObj, varStmtToRemove, pluginVarName, movedFunctionStmts, movedVariableStmts, context);
			for (let i = 0; i < source.statements.length; i++) {
				let stmt = source.statements[i];
				if (movedImportStmts.has(stmt)) continue;
				if (shouldRemovePluginStatement(stmt, varStmtToRemove, pluginVarName, movedFunctionStmts, movedVariableStmts)) continue;
				if (ts.isImportDeclaration(stmt)) {
					const pruned = pruneUnusedSpecifiersFromImport(stmt, sf, varStmtToRemove, pluginProp, pluginVarName, movedFunctionStmts, movedVariableStmts);
					if (!pruned) continue;
					stmt = pruned;
				}
				const visitedStmt = visitSubtree(stmt);
				if (visitedStmt && ts.isStatement(visitedStmt)) newStatements.push(visitedStmt);
				if (i === lastImportIdx && !importInjected) {
					newStatements.push(newImportDecl);
					importInjected = true;
				}
			}
			if (!importInjected) newStatements.unshift(newImportDecl);
			return ts.factory.updateSourceFile(source, newStatements);
		};
	};
	return {
		hasPlugins: true,
		isAlreadyModular: true,
		viteConfigContent: printTransformedSourceFile(sf, transformer),
		vitePluginsContent: generatedPluginsContent,
		modified: true
	};
}
/**
* Detects empty catch blocks (catch {}) in vite.config.ts and injects a fallback comment
* to satisfy strict linter hygiene (eslint no-empty).
*/
function sanitizeEmptyCatchClausesInViteConfig(content) {
	const sf = parseTsSourceFile(content, "vite.config.ts");
	let hasEmptyCatch = false;
	function checkEmptyCatch(node) {
		if (ts.isCatchClause(node) && node.block.statements.length === 0) {
			const blockText = node.block.getText(sf);
			if (!blockText.includes("/*") && !blockText.includes("//")) hasEmptyCatch = true;
		}
		ts.forEachChild(node, checkEmptyCatch);
	}
	checkEmptyCatch(sf);
	if (!hasEmptyCatch) return {
		content,
		modified: false
	};
	const transformer = (context) => {
		return (source) => {
			const visitor = (node) => {
				if (ts.isCatchClause(node) && node.block.statements.length === 0) {
					const blockText = node.block.getText(source);
					if (!blockText.includes("/*") && !blockText.includes("//")) {
						const commentNode = ts.addSyntheticTrailingComment(ts.factory.createEmptyStatement(), ts.SyntaxKind.MultiLineCommentTrivia, " fallback to default ", true);
						return ts.factory.updateCatchClause(node, node.variableDeclaration, ts.factory.createBlock([commentNode], false));
					}
				}
				return ts.visitEachChild(node, visitor, context);
			};
			return ts.visitNode(source, visitor);
		};
	};
	return {
		content: printTransformedSourceFile(sf, transformer),
		modified: true
	};
}
export { DEFAULT_CANONICAL_LINT_RULES as CANONICAL_LINT_RULES_MAP, applyViteConfigAstTransformations, astExpressionToValue, buildAllowedCoverageExcludes, buildCanonicalVitePlusAstSource, buildFmtAstObject, buildIgnorePatternsAst, buildLintAstObject, buildLockedSkillsVariableStatement, buildPackAstObject, buildRunAstObject, buildStagedAstObject, buildTestAstObject, createPropertyNameNode, detachNodeFromSourceFile, detectInlineVitePlugins, extractAstPropertyBlock, extractEslintIgnoresFromAst, extractParsedConfigSummary, extractVitePluginsToModule, findConfigRootObject, findPropertyAssignment, getPropertyKeyName, isRuleValueCompliant, parseLegacyTestPropertyNode, parseTsSourceFile, printAstNode, printTransformedSourceFile, resolveDynamicDemoExemptGlobs, resolveDynamicTestExemptGlobs, resolveEffectiveLintOverrides, resolveKnownViteFunctionReturnType, resolveVitestRoots, rewriteModuleSpecifiersToVitePlusAst, sanitizeEmptyCatchClausesInViteConfig, synchronizeViteConfigAst, toCanonicalLintRuleName, valueToAstExpression };
