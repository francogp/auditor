import ts from "typescript";
//#region src/core/viteConfigAst.ts
/**
* packages/auditor/src/core/viteConfigAst.ts
*
* Pure TypeScript Compiler AST engine for reading, inspecting, constructing,
* and transforming vite.config.ts and legacy ESLint/Vitest configuration files.
* Zero regex or manual string manipulation.
*/
const CANONICAL_LINT_RULES_MAP = {
	"@typescript-eslint/no-explicit-any": "error",
	"@typescript-eslint/ban-ts-comment": "error",
	"@typescript-eslint/consistent-type-assertions": ["error", {
		assertionStyle: "as",
		objectLiteralTypeAssertions: "never"
	}],
	"@typescript-eslint/no-floating-promises": "error",
	"@francogp/domain-type/no-double-cast-unknown": "error",
	"@francogp/domain-type/no-legacy-date": "error",
	"unicorn/prefer-node-protocol": "error",
	"no-debugger": "error",
	"no-else-return": "error",
	"no-empty": ["error", { allowEmptyCatch: false }],
	"max-depth": ["error", 4],
	"import/no-duplicates": "error",
	eqeqeq: ["error", "always"],
	"prefer-const": "error",
	"no-var": "error",
	"no-self-compare": "error",
	"no-eval": "error",
	"vue/no-async-in-computed-properties": "error",
	"vue/no-side-effects-in-computed-properties": "error",
	"vue/no-export-in-script-setup": "error",
	"vue/no-lifecycle-after-await": "error",
	"vue/no-watch-after-await": "error",
	"vue/prefer-import-from-vue": "error",
	"vitest/no-identical-title": "error",
	"vitest/no-focused-tests": "error",
	"vitest/no-disabled-tests": "error",
	"vitest/prefer-to-have-length": "error",
	"vitest/valid-title": "error",
	"import/no-self-import": "error",
	"import/no-empty-named-blocks": "error",
	"no-useless-catch": "error",
	"no-useless-rename": "error",
	"no-sparse-arrays": "error",
	"no-shadow-restricted-names": "error",
	"unicorn/prefer-string-starts-ends-with": "error",
	"unicorn/throw-new-error": "error",
	"unicorn/no-useless-spread": "error",
	"@typescript-eslint/no-unnecessary-type-assertion": "error",
	"@typescript-eslint/consistent-indexed-object-style": "error",
	"@typescript-eslint/no-empty-object-type": "error",
	"@typescript-eslint/no-unnecessary-template-expression": "error",
	"@typescript-eslint/no-unnecessary-type-arguments": "error",
	"@typescript-eslint/no-unnecessary-type-constraint": "error",
	"@typescript-eslint/prefer-function-type": "error",
	"@typescript-eslint/prefer-return-this-type": "error",
	"@typescript-eslint/ban-tslint-comment": "error",
	"import/no-mutable-exports": "error",
	"no-extend-native": "error",
	"no-proto": "error",
	"no-iterator": "error",
	"prefer-object-has-own": "error",
	"no-useless-computed-key": "error",
	"node/no-exports-assign": "error",
	"import/no-webpack-loader-syntax": "error",
	"import/no-dynamic-require": "error",
	"import/no-amd": "error",
	"import/no-named-default": "error",
	"no-new-wrappers": "error",
	"no-array-constructor": "error",
	"no-caller": "error",
	"unicorn/no-new-buffer": "error",
	"no-implied-eval": "error",
	"no-new-func": "error",
	"no-script-url": "error",
	"default-case-last": "error",
	radix: "error",
	"no-return-assign": "error",
	"no-multi-assign": "error",
	"no-sequences": "error",
	"no-labels": "error",
	"no-void": "error",
	"no-useless-call": "error",
	yoda: "error",
	"no-unneeded-ternary": "error",
	"promise/no-new-statics": "error",
	"promise/valid-params": "error",
	"promise/no-return-in-finally": "error",
	"node/no-new-require": "error",
	"node/no-path-concat": "error",
	"unicorn/no-unnecessary-array-flat-depth": "error",
	"unicorn/no-unnecessary-array-splice-count": "error",
	"unicorn/no-unreadable-iife": "error",
	"unicorn/no-useless-switch-case": "error",
	"unicorn/no-useless-promise-resolve-reject": "error",
	"unicorn/prefer-array-some": "error",
	"unicorn/no-unnecessary-slice-end": "error",
	"unicorn/explicit-timer-delay": "error",
	"unicorn/prefer-date-now": "error",
	"unicorn/prefer-math-min-max": "error",
	"unicorn/prefer-math-trunc": "error",
	"unicorn/prefer-prototype-methods": "error",
	"unicorn/prefer-regexp-test": "error",
	"unicorn/prefer-default-parameters": "error",
	"unicorn/prefer-global-this": "error",
	"unicorn/prefer-optional-catch-binding": "error",
	"unicorn/prefer-string-trim-start-end": "error",
	"prefer-exponentiation-operator": "error",
	"prefer-numeric-literals": "error",
	"prefer-rest-params": "error",
	"vitest/no-duplicate-hooks": "error",
	"vitest/no-test-prefixes": "error",
	"vitest/no-test-return-statement": "error",
	"vitest/prefer-to-contain": "error",
	"vitest/prefer-to-be": "error",
	"vitest/prefer-comparison-matcher": "error",
	"vitest/no-import-node-test": "error",
	"vitest/no-interpolation-in-snapshots": "error",
	"vitest/prefer-expect-resolves": "error",
	"vitest/prefer-mock-promise-shorthand": "error",
	"vitest/prefer-mock-return-shorthand": "error",
	"vitest/prefer-strict-equal": "error",
	"vitest/prefer-to-be-truthy": "error",
	"vitest/prefer-to-be-falsy": "error",
	"vitest/prefer-to-be-object": "error",
	"vitest/prefer-todo": "error",
	"vue/no-expose-after-await": "error",
	"vue/return-in-computed-property": "error",
	"vue/no-import-compiler-macros": "error",
	"vue/valid-next-tick": "error",
	"vue/no-deprecated-destroyed-lifecycle": "error",
	"vue/component-definition-name-casing": "error",
	"vue/define-emits-declaration": "error",
	"vue/define-props-declaration": "error",
	"vue/next-tick-style": "error",
	"vue/prop-name-casing": "error",
	"vue/require-direct-export": "error",
	"vue/require-typed-ref": "error",
	"@typescript-eslint/explicit-member-accessibility": ["error", { accessibility: "explicit" }],
	"@typescript-eslint/explicit-function-return-type": ["error", {
		allowExpressions: true,
		allowTypedFunctionExpressions: true,
		allowHigherOrderFunctions: true,
		allowDirectConstAssertionInArrowFunctions: true
	}],
	"@typescript-eslint/no-unused-vars": ["error", {
		argsIgnorePattern: "^_",
		varsIgnorePattern: "^_",
		caughtErrorsIgnorePattern: "^_"
	}],
	"vue/no-required-prop-with-default": "error",
	"vue/no-deprecated-model-definition": "error",
	"no-useless-assignment": "error"
};
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
function extractStringArrayProp(obj, propName, sf) {
	const prop = findPropertyAssignment(obj, propName, sf);
	const items = [];
	if (prop && ts.isArrayLiteralExpression(prop.initializer)) for (const el of prop.initializer.elements) {
		const v = astExpressionToValue(el, sf);
		if (typeof v === "string") items.push(v);
	}
	return items;
}
function extractLintSummaryFromAst(lintExpr, sf) {
	const lintRules = /* @__PURE__ */ new Map();
	let lintOptions = {};
	let lintJsPlugins = [];
	let lintIgnorePatterns = [];
	if (lintExpr && ts.isObjectLiteralExpression(lintExpr)) {
		const rulesProp = findPropertyAssignment(lintExpr, "rules", sf);
		if (rulesProp && ts.isObjectLiteralExpression(rulesProp.initializer)) {
			for (const rProp of rulesProp.initializer.properties) if (ts.isPropertyAssignment(rProp)) lintRules.set(getPropertyKeyName(rProp.name, sf), astExpressionToValue(rProp.initializer, sf));
		}
		const optProp = findPropertyAssignment(lintExpr, "options", sf);
		if (optProp && ts.isObjectLiteralExpression(optProp.initializer)) lintOptions = astExpressionToValue(optProp.initializer, sf);
		lintJsPlugins = extractStringArrayProp(lintExpr, "jsPlugins", sf);
		lintIgnorePatterns = extractStringArrayProp(lintExpr, "ignorePatterns", sf);
	}
	return {
		lintRules,
		lintOptions,
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
function extractParsedConfigSummary(fileContent) {
	const sf = parseTsSourceFile(fileContent);
	const definesFromVitePlus = sf.statements.some((stmt) => ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier) && stmt.moduleSpecifier.text === "vite-plus");
	const sections = collectConfigSections(sf);
	const { lintRules, lintOptions, lintJsPlugins, lintIgnorePatterns } = extractLintSummaryFromAst(sections.get("lint"), sf);
	let fmtConfig = {};
	let fmtIgnorePatterns = [];
	const fmtExpr = sections.get("fmt");
	if (fmtExpr && ts.isObjectLiteralExpression(fmtExpr)) {
		fmtConfig = astExpressionToValue(fmtExpr, sf);
		if (Array.isArray(fmtConfig.ignorePatterns)) fmtIgnorePatterns = fmtConfig.ignorePatterns.filter((v) => typeof v === "string");
	}
	let packConfig = {};
	let hasPackAttw = false;
	const packExpr = sections.get("pack");
	if (packExpr && ts.isObjectLiteralExpression(packExpr)) {
		packConfig = astExpressionToValue(packExpr, sf);
		const attwProp = findPropertyAssignment(packExpr, "attw", sf);
		hasPackAttw = Boolean(attwProp && ts.isObjectLiteralExpression(attwProp.initializer));
	}
	const testExpr = sections.get("test");
	const testInclude = testExpr && ts.isObjectLiteralExpression(testExpr) ? extractStringArrayProp(testExpr, "include", sf) : [];
	return {
		definesFromVitePlus,
		hasSection: (name) => sections.has(name),
		lintRules,
		lintOptions,
		lintJsPlugins,
		lintIgnorePatterns,
		fmtConfig,
		fmtIgnorePatterns,
		packConfig,
		hasPackAttw,
		testInclude
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
function buildPackAstObject() {
	const outExtensionsArrow = ts.factory.createArrowFunction(void 0, void 0, [], void 0, ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.factory.createParenthesizedExpression(valueToAstExpression({
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
function buildLintAstObject(auditConfig, lintIgnores) {
	const lintCfg = auditConfig.vitePlusConfig?.lint;
	const typeAware = lintCfg?.typeAware ?? true;
	const typeCheck = lintCfg?.typeCheck ?? true;
	const mergedRules = { ...CANONICAL_LINT_RULES_MAP };
	if (auditConfig.vitePlusConfig?.extraLintRules) for (const [k, v] of Object.entries(auditConfig.vitePlusConfig.extraLintRules)) mergedRules[k] = v;
	if (lintCfg?.rules) for (const [k, v] of Object.entries(lintCfg.rules)) mergedRules[k] = v;
	const props = [ts.factory.createPropertyAssignment("options", valueToAstExpression({
		typeAware,
		typeCheck
	}))];
	if (lintCfg?.categories && Object.keys(lintCfg.categories).length > 0) props.push(ts.factory.createPropertyAssignment("categories", valueToAstExpression(lintCfg.categories, true)));
	props.push(ts.factory.createPropertyAssignment("jsPlugins", valueToAstExpression(["@francogp/auditor/domain-type-plugin"])), ts.factory.createPropertyAssignment("rules", valueToAstExpression(mergedRules, true)), ts.factory.createPropertyAssignment("ignorePatterns", valueToAstExpression(lintIgnores)));
	if (lintCfg?.overrides && lintCfg.overrides.length > 0) props.push(ts.factory.createPropertyAssignment("overrides", buildLintOverridesArrayAst(lintCfg.overrides)));
	return ts.factory.createObjectLiteralExpression(props, true);
}
function buildFmtAstObject(auditConfig, fmtIgnores) {
	const fmtCfg = auditConfig.vitePlusConfig?.fmt;
	const fmtData = {
		singleQuote: fmtCfg?.singleQuote ?? true,
		semi: fmtCfg?.semi ?? true,
		trailingComma: fmtCfg?.trailingComma ?? "none",
		printWidth: fmtCfg?.printWidth ?? 100,
		sortPackageJson: fmtCfg?.sortPackageJson ?? true,
		sortImports: fmtCfg?.sortImports ?? true,
		ignorePatterns: fmtIgnores
	};
	if (fmtCfg?.tabWidth !== void 0) fmtData.tabWidth = fmtCfg.tabWidth;
	if (fmtCfg?.useTabs !== void 0) fmtData.useTabs = fmtCfg.useTabs;
	return valueToAstExpression(fmtData);
}
function buildTestAstObject(auditConfig) {
	const coverageThreshold = auditConfig.testCoverage?.threshold ?? 80;
	const testRoots = auditConfig.paths?.testRoots ?? ["tests"];
	const srcRoots = auditConfig.paths?.srcRoots ?? ["src"];
	const cliRoots = auditConfig.paths?.cliRoots ?? ["src/cli"];
	return valueToAstExpression({
		environment: "node",
		include: testRoots.map((r) => `${r}/**/*.{test,spec}.ts`),
		coverage: {
			provider: "v8",
			reportsDirectory: "scratch/coverage",
			include: srcRoots.map((r) => `${r}/**/*.ts`),
			exclude: [...cliRoots.map((r) => `${r}/**`), ...testRoots.map((r) => `${r}/**`)],
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
function buildCanonicalVitePlusAstSource(auditConfig, lintIgnores, fmtIgnores, legacyTestProperty) {
	const isLibrary = auditConfig.packageDistribution?.enabled !== false;
	const rootProps = [];
	if (isLibrary) rootProps.push(ts.factory.createPropertyAssignment("pack", buildPackAstObject()));
	rootProps.push(ts.factory.createPropertyAssignment("lint", buildLintAstObject(auditConfig, lintIgnores)), ts.factory.createPropertyAssignment("fmt", buildFmtAstObject(auditConfig, fmtIgnores)), legacyTestProperty ?? ts.factory.createPropertyAssignment("test", buildTestAstObject(auditConfig)), ts.factory.createPropertyAssignment("staged", buildStagedAstObject(auditConfig)));
	const importDecl = ts.factory.createImportDeclaration(void 0, ts.factory.createImportClause(false, void 0, ts.factory.createNamedImports([ts.factory.createImportSpecifier(false, void 0, ts.factory.createIdentifier("defineConfig"))])), ts.factory.createStringLiteral("vite-plus", true));
	const exportDefault = ts.factory.createExportAssignment(void 0, false, ts.factory.createCallExpression(ts.factory.createIdentifier("defineConfig"), void 0, [ts.factory.createObjectLiteralExpression(rootProps, true)]));
	const sf = ts.factory.createSourceFile([importDecl, exportDefault], ts.factory.createToken(ts.SyntaxKind.EndOfFileToken), ts.NodeFlags.None);
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
const TUPLE_REQUIRED_RULES = /* @__PURE__ */ new Set([
	"@typescript-eslint/consistent-type-assertions",
	"no-empty",
	"eqeqeq"
]);
function checkTupleRuleOption(ruleName, second) {
	if (ruleName === "@typescript-eslint/consistent-type-assertions") {
		const cfg = typeof second === "object" && second !== null ? second : null;
		return cfg !== null && cfg.assertionStyle === "as" && cfg.objectLiteralTypeAssertions === "never";
	}
	if (ruleName === "no-empty") {
		const cfg = typeof second === "object" && second !== null ? second : null;
		return cfg !== null && cfg.allowEmptyCatch === false;
	}
	if (ruleName === "eqeqeq") return second === "always";
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
function syncStringArrayExpression(existingProp, requiredStrings, sf) {
	const currentValues = [];
	if (existingProp && ts.isArrayLiteralExpression(existingProp.initializer)) for (const el of existingProp.initializer.elements) {
		const v = astExpressionToValue(el, sf);
		if (typeof v === "string") currentValues.push(v);
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
function syncLintRulesAst(rulesProp, auditConfig, sf) {
	let rulesProps = [];
	let rulesModified = false;
	if (rulesProp && ts.isObjectLiteralExpression(rulesProp.initializer)) {
		const rDedup = deduplicateObjectProperties(rulesProp.initializer.properties, sf);
		rulesProps = rDedup.props;
		if (rDedup.modified) rulesModified = true;
	} else rulesModified = true;
	const currentRuleMap = /* @__PURE__ */ new Map();
	for (const rp of rulesProps) if (ts.isPropertyAssignment(rp)) currentRuleMap.set(getPropertyKeyName(rp.name, sf), astExpressionToValue(rp.initializer, sf));
	for (const [ruleName, canonicalVal] of Object.entries(CANONICAL_LINT_RULES_MAP)) if (!isRuleValueCompliant(ruleName, currentRuleMap.get(ruleName))) {
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
	return {
		rulesProps,
		modified: rulesModified
	};
}
function syncLintSectionAst(lintObj, auditConfig, lintIgnores, sf) {
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
	const ignoreSync = syncStringArrayExpression(findPropertyAssignment(ts.factory.createObjectLiteralExpression(props, true), "ignorePatterns", sf), lintIgnores, sf);
	if (ignoreSync.modified) {
		props = updateObjectProperty(props, "ignorePatterns", ignoreSync.expr, sf);
		modified = true;
	}
	const configuredOverrides = auditConfig.vitePlusConfig?.lint?.overrides;
	if (configuredOverrides && configuredOverrides.length > 0) {
		const ovProp = findPropertyAssignment(ts.factory.createObjectLiteralExpression(props, true), "overrides", sf);
		const currentOvVal = ovProp ? astExpressionToValue(ovProp.initializer, sf) : void 0;
		if (JSON.stringify(currentOvVal) !== JSON.stringify(configuredOverrides)) {
			props = updateObjectProperty(props, "overrides", buildLintOverridesArrayAst(configuredOverrides), sf);
			modified = true;
		}
	}
	return {
		obj: modified ? ts.factory.createObjectLiteralExpression(props, true) : lintObj,
		modified
	};
}
function syncFmtSectionAst(fmtObj, auditConfig, fmtIgnores, sf) {
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
	const ignoreSync = syncStringArrayExpression(findPropertyAssignment(ts.factory.createObjectLiteralExpression(props, true), "ignorePatterns", sf), fmtIgnores, sf);
	if (ignoreSync.modified) {
		props = updateObjectProperty(props, "ignorePatterns", ignoreSync.expr, sf);
		modified = true;
	}
	return {
		obj: modified ? ts.factory.createObjectLiteralExpression(props, true) : fmtObj,
		modified
	};
}
function syncTestSectionAst(testObj, auditConfig, sf) {
	const dedup = deduplicateObjectProperties(testObj.properties, sf);
	let props = dedup.props;
	let modified = dedup.modified;
	const testRoots = auditConfig.paths?.testRoots ?? ["tests"];
	const includeProp = findPropertyAssignment(ts.factory.createObjectLiteralExpression(props, true), "include", sf);
	const existingIncludes = [];
	if (includeProp && ts.isArrayLiteralExpression(includeProp.initializer)) for (const el of includeProp.initializer.elements) {
		const v = astExpressionToValue(el, sf);
		if (typeof v === "string") existingIncludes.push(v);
	}
	const missingRoots = [];
	for (const root of testRoots) {
		const pattern = `${root}/**/*.{test,spec}.ts`;
		const simple = `${root}/**/*.test.ts`;
		if (!existingIncludes.some((inc) => inc === pattern || inc === simple || inc.startsWith(`${root}/`))) missingRoots.push(pattern);
	}
	if (missingRoots.length > 0) {
		const merged = Array.from(/* @__PURE__ */ new Set([...existingIncludes, ...missingRoots]));
		props = updateObjectProperty(props, "include", valueToAstExpression(merged), sf);
		modified = true;
	}
	const coverageProp = findPropertyAssignment(ts.factory.createObjectLiteralExpression(props, true), "coverage", sf);
	if (!coverageProp) {
		const defaultCoverageObj = ts.factory.createObjectLiteralExpression([ts.factory.createPropertyAssignment("provider", ts.factory.createStringLiteral("v8", true)), ts.factory.createPropertyAssignment("reportsDirectory", ts.factory.createStringLiteral("scratch/coverage", true))], true);
		props = updateObjectProperty(props, "coverage", defaultCoverageObj, sf);
		modified = true;
	} else if (ts.isObjectLiteralExpression(coverageProp.initializer)) {
		const covObj = coverageProp.initializer;
		let covProps = [...covObj.properties];
		let covModified = false;
		const repDirProp = findPropertyAssignment(covObj, "reportsDirectory", sf);
		if (!repDirProp) {
			covProps = updateObjectProperty(covProps, "reportsDirectory", ts.factory.createStringLiteral("scratch/coverage", true), sf);
			covModified = true;
		} else {
			const repVal = astExpressionToValue(repDirProp.initializer, sf);
			if (typeof repVal === "string" && repVal !== "scratch/coverage") {
				covProps = updateObjectProperty(covProps, "reportsDirectory", ts.factory.createStringLiteral("scratch/coverage", true), sf);
				covModified = true;
			}
		}
		if (!findPropertyAssignment(covObj, "provider", sf)) {
			covProps = updateObjectProperty(covProps, "provider", ts.factory.createStringLiteral("v8", true), sf);
			covModified = true;
		}
		if (covModified) {
			props = updateObjectProperty(props, "coverage", ts.factory.createObjectLiteralExpression(covProps, true), sf);
			modified = true;
		}
	}
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
function synchronizeViteConfigAst(fileContent, auditConfig, lintIgnores, fmtIgnores, legacyTestProp) {
	const sf = parseTsSourceFile(fileContent);
	const rootObj = findConfigRootObject(sf);
	if (!rootObj) return {
		content: fileContent,
		modified: false
	};
	const dedupRoot = deduplicateObjectProperties(rootObj.properties, sf);
	let rootProps = dedupRoot.props;
	let modified = dedupRoot.modified;
	const currentRootObj = () => ts.factory.createObjectLiteralExpression(rootProps, true);
	if (auditConfig.packageDistribution?.enabled === true) {
		const syncedPack = syncPackSectionOnRoot(rootProps, sf);
		rootProps = syncedPack.props;
		if (syncedPack.modified) modified = true;
	}
	const testProp = findPropertyAssignment(currentRootObj(), "test", sf);
	if (!testProp || !ts.isObjectLiteralExpression(testProp.initializer)) {
		const newTestProp = legacyTestProp ?? ts.factory.createPropertyAssignment("test", buildTestAstObject(auditConfig));
		rootProps = [...rootProps, newTestProp];
		modified = true;
	} else {
		const syncedTest = syncTestSectionAst(testProp.initializer, auditConfig, sf);
		if (syncedTest.modified) {
			rootProps = updateObjectProperty(rootProps, "test", syncedTest.obj, sf);
			modified = true;
		}
	}
	const lintProp = findPropertyAssignment(currentRootObj(), "lint", sf);
	if (!lintProp || !ts.isObjectLiteralExpression(lintProp.initializer)) {
		rootProps = [...rootProps, ts.factory.createPropertyAssignment("lint", buildLintAstObject(auditConfig, lintIgnores))];
		modified = true;
	} else {
		const syncedLint = syncLintSectionAst(lintProp.initializer, auditConfig, lintIgnores, sf);
		if (syncedLint.modified) {
			rootProps = updateObjectProperty(rootProps, "lint", syncedLint.obj, sf);
			modified = true;
		}
	}
	const fmtProp = findPropertyAssignment(currentRootObj(), "fmt", sf);
	if (!fmtProp || !ts.isObjectLiteralExpression(fmtProp.initializer)) {
		rootProps = [...rootProps, ts.factory.createPropertyAssignment("fmt", buildFmtAstObject(auditConfig, fmtIgnores))];
		modified = true;
	} else {
		const syncedFmt = syncFmtSectionAst(fmtProp.initializer, auditConfig, fmtIgnores, sf);
		if (syncedFmt.modified) {
			rootProps = updateObjectProperty(rootProps, "fmt", syncedFmt.obj, sf);
			modified = true;
		}
	}
	const stagedProp = findPropertyAssignment(currentRootObj(), "staged", sf);
	if (!stagedProp || !ts.isObjectLiteralExpression(stagedProp.initializer)) {
		rootProps = [...rootProps, ts.factory.createPropertyAssignment("staged", buildStagedAstObject(auditConfig))];
		modified = true;
	}
	if (sf.statements.some((stmt) => ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier) && stmt.moduleSpecifier.text === "vite")) modified = true;
	if (!modified) return {
		content: fileContent,
		modified: false
	};
	const updatedRootObj = ts.factory.createObjectLiteralExpression(rootProps, true);
	const transformer = (context) => {
		const visit = (node) => {
			if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "vite") return ts.factory.updateImportDeclaration(node, node.modifiers, node.importClause, ts.factory.createStringLiteral("vite-plus", true), node.attributes);
			if (node === rootObj) return updatedRootObj;
			return ts.visitEachChild(node, visit, context);
		};
		return (source) => ts.visitNode(source, visit);
	};
	return {
		content: printTransformedSourceFile(sf, transformer),
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
//#endregion
export { CANONICAL_LINT_RULES_MAP, astExpressionToValue, buildCanonicalVitePlusAstSource, buildFmtAstObject, buildLintAstObject, buildPackAstObject, buildStagedAstObject, buildTestAstObject, createPropertyNameNode, detachNodeFromSourceFile, extractAstPropertyBlock, extractEslintIgnoresFromAst, extractParsedConfigSummary, findConfigRootObject, findPropertyAssignment, getPropertyKeyName, isRuleValueCompliant, parseLegacyTestPropertyNode, parseTsSourceFile, printAstNode, printTransformedSourceFile, rewriteModuleSpecifiersToVitePlusAst, synchronizeViteConfigAst, valueToAstExpression };
