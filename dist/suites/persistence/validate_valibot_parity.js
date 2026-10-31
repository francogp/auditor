import { DEFAULT_AUDIT_CONFIG } from "../../core/auditConfigDefaults.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { SharedAstContext } from "../../core/astContext.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import ts from "typescript";
// src/suites/persistence/validate_valibot_parity.ts
/**
* src/suites/persistence/validate_valibot_parity.ts
*
* VALIBOT SCHEMA & PERSISTENCE PARITY SUB-AUDITOR (Node.js 26+ Native)
*
* Enforces 100% bidirectional parity between:
*   1. State / domain TypeScript interfaces (e.g. GameState, UserProfile)
*   2. Valibot validation schemas (e.g. saveDataSchema, userProfileSchema)
*   3. Persistence serializer functions (e.g. serializeState, serializeProfile)
*   4. Base initial state factories (e.g. createInitialGameState, createInitialProfile)
*   5. Nested sub-structures (e.g. PlayerClassState, ActiveMission)
*
* Governance Rules:
*   - valibot-schema-missing-field: Any non-ephemeral property missing from schema is a FATAL ERROR (Valibot strips it).
*   - valibot-serializer-missing-field: Any property missing from serializer is a FATAL ERROR (Lost on save).
*   - valibot-initial-state-missing-field: Any property missing from initial state is a FATAL ERROR (Undefined on new save).
*   - valibot-nested-missing-field: Any property missing from nested schema/serializer/initial state is a FATAL ERROR.
*   - valibot-domain-type-violation: Any loose unknown() in schema is a FATAL ERROR under /domain-type-first.
*   - valibot-redundant-nullability: Redundant optional(nullable(...)) soup in schemas produces an advisory WARNING.
*
* Configuration:
*   Governed dynamically in .auditor/audit.config.ts via `valibot: { enabled: true, targets: [...] }`.
*/
enableCompileCache();
const VALIBOT_PARITY_RULES = [
	"valibot-schema-missing-field",
	"valibot-serializer-missing-field",
	"valibot-initial-state-missing-field",
	"valibot-nested-missing-field",
	"valibot-domain-type-violation",
	"valibot-redundant-nullability"
];
/** Unwraps enclosing parentheses around an AST expression. */
function unwrapParenthesized(expr) {
	let current = expr;
	while (ts.isParenthesizedExpression(current)) current = current.expression;
	return current;
}
/** Extracts string name from an object literal element if identifier or string literal. */
function getPropName(prop) {
	if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
		if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) return prop.name.text;
	}
}
/**
* Extracts interface property keys using TypeScript AST.
* Correctly handles optional, readonly, and string/identifier keys.
*/
function extractInterfaceKeys(sourceFile, interfaceName) {
	const keys = /* @__PURE__ */ new Set();
	ts.forEachChild(sourceFile, (node) => {
		if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
			for (const member of node.members) if (ts.isPropertySignature(member) && member.name) {
				if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) keys.add(member.name.text);
			}
		}
	});
	return keys;
}
/**
* Extracts string literal types from a type alias union.
*/
function extractEphemeralKeys(sourceFile, typeAliasName) {
	const keys = /* @__PURE__ */ new Set();
	if (!typeAliasName) return keys;
	ts.forEachChild(sourceFile, (node) => {
		if (ts.isTypeAliasDeclaration(node) && node.name.text === typeAliasName) {
			if (ts.isUnionTypeNode(node.type)) {
				for (const element of node.type.types) if (ts.isLiteralTypeNode(element) && ts.isStringLiteral(element.literal)) keys.add(element.literal.text);
			} else if (ts.isLiteralTypeNode(node.type) && ts.isStringLiteral(node.type.literal)) keys.add(node.type.literal.text);
		}
	});
	return keys;
}
/** Helper to extract spread keys from object spread or conditional expressions. */
function extractSpreadKeys(expr) {
	const unwrapped = unwrapParenthesized(expr);
	if (ts.isObjectLiteralExpression(unwrapped)) return extractObjectLiteralKeys(unwrapped);
	if (ts.isConditionalExpression(unwrapped)) {
		const whenTrue = unwrapParenthesized(unwrapped.whenTrue);
		if (ts.isObjectLiteralExpression(whenTrue)) return extractObjectLiteralKeys(whenTrue);
	}
	return /* @__PURE__ */ new Set();
}
/**
* Extracts property names from an ObjectLiteralExpression node,
* recursively resolving spread and conditional spread expressions.
*/
function extractObjectLiteralKeys(objNode) {
	const keys = /* @__PURE__ */ new Set();
	for (const prop of objNode.properties) {
		const name = getPropName(prop);
		if (name) keys.add(name);
		else if (ts.isSpreadAssignment(prop)) for (const k of extractSpreadKeys(prop.expression)) keys.add(k);
	}
	return keys;
}
/** Finds a variable declaration with the given name in the source file. */
function findVariableDeclaration(sourceFile, varName) {
	let found;
	ts.forEachChild(sourceFile, (node) => {
		if (found || !ts.isVariableStatement(node)) return;
		for (const decl of node.declarationList.declarations) if (ts.isIdentifier(decl.name) && decl.name.text === varName) {
			found = decl;
			return;
		}
	});
	return found;
}
/** Extracts the first object literal argument of a function call initializer. */
function extractCallFirstObjectArg(decl) {
	if (!decl?.initializer || !ts.isCallExpression(decl.initializer)) return void 0;
	const firstArg = decl.initializer.arguments[0];
	if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) return void 0;
	return firstArg;
}
/**
* Extracts property keys from a Valibot object schema declaration.
*/
function extractSchemaKeys(sourceFile, schemaVarName) {
	const targetDecl = findVariableDeclaration(sourceFile, schemaVarName);
	const firstArg = extractCallFirstObjectArg(targetDecl);
	return {
		keys: firstArg ? extractObjectLiteralKeys(firstArg) : /* @__PURE__ */ new Set(),
		declNode: targetDecl
	};
}
/**
* Extracts all property keys returned by serializer functions matching functionNameOrPrefix.
*/
function extractSerializerKeys(sourceFile, functionNameOrPrefix = "serialize") {
	const keys = /* @__PURE__ */ new Set();
	ts.forEachChild(sourceFile, (node) => {
		if (ts.isFunctionDeclaration(node) && node.name?.text.startsWith(functionNameOrPrefix) && node.body) {
			const visit = (child) => {
				if (ts.isReturnStatement(child) && child.expression) {
					const expr = unwrapParenthesized(child.expression);
					if (ts.isObjectLiteralExpression(expr)) for (const k of extractObjectLiteralKeys(expr)) keys.add(k);
				}
				ts.forEachChild(child, visit);
			};
			visit(node.body);
		}
	});
	return keys;
}
function collectInitialProps(obj, topLevelKeys, nestedKeys) {
	for (const prop of obj.properties) {
		const name = getPropName(prop);
		if (!name) continue;
		topLevelKeys.add(name);
		if (ts.isPropertyAssignment(prop) && ts.isObjectLiteralExpression(prop.initializer)) nestedKeys.set(name, extractObjectLiteralKeys(prop.initializer));
	}
}
/**
* Extracts top-level keys and nested property keys from initial state factory function.
*/
function extractInitialStateKeys(sourceFile, functionName = "createInitialGameState") {
	const topLevelKeys = /* @__PURE__ */ new Set();
	const nestedKeys = /* @__PURE__ */ new Map();
	ts.forEachChild(sourceFile, (node) => {
		if (ts.isFunctionDeclaration(node) && node.name?.text === functionName && node.body) {
			for (const statement of node.body.statements) if (ts.isReturnStatement(statement) && statement.expression && ts.isObjectLiteralExpression(statement.expression)) collectInitialProps(statement.expression, topLevelKeys, nestedKeys);
		}
	});
	return {
		topLevelKeys,
		nestedKeys
	};
}
var ValidateValibotParityAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		const config = getAuditConfig(options.projectRoot);
		const targetFiles = (config.valibot?.targets ?? []).flatMap((t) => [
			t.typesFile,
			t.schemaFile,
			...t.serializerFile ? [t.serializerFile] : [],
			...t.initialStateFile ? [t.initialStateFile] : []
		]);
		const typesRoots = config.paths.typesRoots ?? DEFAULT_AUDIT_CONFIG.paths.typesRoots ?? [];
		const logicRoots = config.paths.logicRoots ?? DEFAULT_AUDIT_CONFIG.paths.logicRoots ?? [];
		const storesRoots = config.paths.storesRoots ?? DEFAULT_AUDIT_CONFIG.paths.storesRoots ?? [];
		const fallbackGlobs = [
			...typesRoots.map((r) => `${r}/**/*.ts`),
			...logicRoots.map((r) => `${r}/**/*.ts`),
			...storesRoots.map((r) => `${r}/**/*.ts`)
		];
		super({
			ruleFixers: {},
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(VALIBOT_PARITY_RULES, {
				speed: "light",
				phase: "normal",
				md: false,
				ast: true,
				changedOnly: false,
				critical: false
			}),
			id: "validate_valibot_parity",
			name: "Valibot Schema & Persistence Parity Auditor",
			description: "Validates parity between interfaces and Valibot",
			icon: "🛡️",
			family: "persistence",
			ruleIds: VALIBOT_PARITY_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(VALIBOT_PARITY_RULES, "contracts"),
			packageName: "Valibot",
			configKey: "valibot.enabled",
			defaultConfig: {
				enabled: true,
				targets: []
			},
			criticalConfig: {},
			ruleDescriptions: {
				"valibot-schema-missing-field": "Missing field in schema",
				"valibot-serializer-missing-field": "Missing field in serializer",
				"valibot-initial-state-missing-field": "Missing field in base state",
				"valibot-nested-missing-field": "Missing field in nested schema",
				"valibot-domain-type-violation": "unknown() prohibited in schema",
				"valibot-redundant-nullability": "Redundant optional(nullable) wrapper"
			},
			ruleRemediations: {
				"valibot-schema-missing-field": "📖 REMEDIATION GUIDE: valibot-schema-missing-field\n1. Root Cause: A property was declared in the TypeScript state interface (`interface GameState`, `interface UserProfile`, etc.), but the corresponding field is missing in the Valibot schema (`v.object({ ... })`). When deserializing persisted data, the field will be discarded or cause mismatches.\n2. Diagnosis: Locate the reported missing field in the interface and check the schema in the Valibot schema file.\n3. Canonical Solution:\n   a) Add field validation to the Valibot schema: `key: v.string()`, `key: v.optional(...)`, etc.\n   b) If the field is strictly ephemeral in-memory and must not be persisted, declare it in the configured ephemeral keys union (`ephemeralKeysType`).\n4. Example:\n   - Add to schema: `avatarUrl: v.optional(v.string())`",
				"valibot-serializer-missing-field": "📖 REMEDIATION GUIDE: valibot-serializer-missing-field\n1. Root Cause: A state interface property is not mapped or returned in the custom serializer function (`serializeGameState()`). Data for that property will be lost upon saving.\n2. Diagnosis: Review the object returned by the serializer function.\n3. Canonical Solution: Add the property to the object returned by the serializer.\n4. Example:\n   - Add to return: `score: state.score`",
				"valibot-initial-state-missing-field": "📖 REMEDIATION GUIDE: valibot-initial-state-missing-field\n1. Root Cause: A state interface property is not initialized in the initial state factory (`createInitialGameState()`). On starting a clean session, state will contain unexpected `undefined` values.\n2. Diagnosis: Check the initial state factory in the reported file.\n3. Canonical Solution: Initialize the field with its default typed value (e.g.: `0`, `\"\"`, `[]`, or `null`).\n4. Example:\n   - Add to factory: `unlockedAchievements: []`",
				"valibot-nested-missing-field": "📖 REMEDIATION GUIDE: valibot-nested-missing-field\n1. Root Cause: A field belonging to a nested sub-interface (e.g.: `interface InventoryItem`) is missing in the nested Valibot sub-schema or in the initialization factory.\n2. Diagnosis: Inspect the sub-schema or sub-factory indicated in the report.\n3. Canonical Solution: Add the field to the nested Valibot sub-schema definition.\n4. Example:\n   - Add to sub-schema: `quantity: v.pipe(v.number(), v.minValue(1))`",
				"valibot-domain-type-violation": "📖 REMEDIATION GUIDE: valibot-domain-type-violation\n1. Root Cause: `v.unknown()` or `v.any()` was used inside a domain validation schema. This degrades strict typing and allows unstructured data to corrupt state.\n2. Diagnosis: Locate the `v.unknown()` call in the schema file.\n3. Canonical Solution: Replace `v.unknown()` with the specific schema for the data type (e.g.: `v.string()`, `v.record(v.string(), v.number())` or a nested schema).\n4. Example:\n   ❌ Loose:  `metadata: v.unknown()`\n   ✅ Strict: `metadata: v.record(v.string(), v.string())`",
				"valibot-redundant-nullability": "📖 REMEDIATION GUIDE: valibot-redundant-nullability\n1. Root Cause: Redundantly composed `v.optional(v.nullable(...))` to accept `null | undefined`. Valibot canonical API provides the built-in `v.nullish(...)` function.\n2. Diagnosis: Locate `v.optional(v.nullable(...))` expression in the schema.\n3. Canonical Solution: Replace the redundant composition with `v.nullish(...)`.\n4. Example:\n   ❌ Redundant: `v.optional(v.nullable(v.string()))`\n   ✅ Canonical: `v.nullish(v.string())`"
			},
			coverage: { include: targetFiles.length > 0 ? targetFiles : fallbackGlobs },
			projectRoot: options.projectRoot
		});
	}
	async runAudit(astContext) {
		const targets = getAuditConfig(this.projectRoot).valibot?.targets ?? [];
		if (targets.length === 0) {
			this.markSkipped("No targets configured in valibot.targets");
			for (const rule of VALIBOT_PARITY_RULES) this.markRuleNotApplicable(rule, "No hay objetivos de paridad Valibot configurados en audit.config.ts");
			this.context.setMetric("Objetivos Auditados", 0);
			return;
		}
		const astEngine = astContext ?? new SharedAstContext();
		for (let i = 0; i < targets.length; i++) this.auditSingleTarget(targets[i], astEngine);
		this.context.setMetric("Objetivos Auditados", targets.length);
	}
	auditSingleTarget(target, astEngine) {
		const absTypes = path.resolve(this.projectRoot, target.typesFile);
		const absSchema = path.resolve(this.projectRoot, target.schemaFile);
		if (!fs.existsSync(absTypes) || !fs.existsSync(absSchema)) {
			this.addViolation({
				ruleId: "valibot-schema-missing-field",
				severity: "error",
				file: !fs.existsSync(absTypes) ? target.typesFile : target.schemaFile,
				line: 1,
				message: `Configured file for '${target.id}' does not exist on disk.`,
				context: target.id
			});
			return;
		}
		this.recordScanned(target.typesFile);
		this.recordScanned(target.schemaFile);
		const typesAst = astEngine.getSourceFile(absTypes);
		const schemaAst = astEngine.getSourceFile(absSchema);
		const expectedKeys = this.computeExpectedKeys(typesAst, target);
		this.runSubAuditorSync("valibot-schema-missing-field", () => {
			this.auditSchemaParity(target, expectedKeys, schemaAst);
		});
		this.runSubAuditorSync("valibot-serializer-missing-field", () => {
			this.auditSerializerParity(target, expectedKeys, astEngine);
		});
		let initialNested;
		this.runSubAuditorSync("valibot-initial-state-missing-field", () => {
			initialNested = this.auditInitialStateParity(target, expectedKeys, astEngine);
		});
		this.runSubAuditorSync("valibot-nested-missing-field", () => {
			this.auditNestedTargets(target, typesAst, schemaAst, initialNested);
		});
		this.runSubAuditorSync("valibot-domain-type-violation", () => {
			this.auditUnknownUsage(target, schemaAst);
		});
		this.runSubAuditorSync("valibot-redundant-nullability", () => {
			this.auditRedundantNullability(target, schemaAst);
		});
	}
	computeExpectedKeys(typesAst, target) {
		const interfaceKeys = extractInterfaceKeys(typesAst, target.interfaceName);
		const ephemeralFromAlias = extractEphemeralKeys(typesAst, target.ephemeralTypeAlias);
		const explicitEphemeral = new Set(target.ephemeralKeys ?? []);
		const expected = /* @__PURE__ */ new Set();
		for (const k of interfaceKeys) if (!ephemeralFromAlias.has(k) && !explicitEphemeral.has(k)) expected.add(k);
		return expected;
	}
	auditSchemaParity(target, expectedKeys, schemaAst) {
		const { keys: schemaKeys } = extractSchemaKeys(schemaAst, target.schemaVarName);
		for (const key of expectedKeys) if (!schemaKeys.has(key)) this.addViolation({
			ruleId: "valibot-schema-missing-field",
			severity: "error",
			file: target.schemaFile,
			line: 1,
			message: `Field '${key}' declared in '${target.interfaceName}' is missing in schema '${target.schemaVarName}'.`,
			context: key
		});
	}
	auditSerializerParity(target, expectedKeys, astEngine) {
		if (!target.serializerFile) return;
		const absPath = path.resolve(this.projectRoot, target.serializerFile);
		if (!fs.existsSync(absPath)) return;
		this.recordScanned(target.serializerFile);
		const keys = extractSerializerKeys(astEngine.getSourceFile(absPath), target.serializerFunctionName ?? "serialize");
		for (const key of expectedKeys) if (!keys.has(key)) this.addViolation({
			ruleId: "valibot-serializer-missing-field",
			severity: "error",
			file: target.serializerFile,
			line: 1,
			message: `Field '${key}' is not serialized in ${target.serializerFunctionName ?? "serialize"}().`,
			context: key
		});
	}
	auditInitialStateParity(target, expectedKeys, astEngine) {
		if (!target.initialStateFile) return void 0;
		const absPath = path.resolve(this.projectRoot, target.initialStateFile);
		if (!fs.existsSync(absPath)) return void 0;
		this.recordScanned(target.initialStateFile);
		const { topLevelKeys, nestedKeys } = extractInitialStateKeys(astEngine.getSourceFile(absPath), target.initialStateFunctionName ?? "createInitialGameState");
		for (const key of expectedKeys) if (!topLevelKeys.has(key)) this.addViolation({
			ruleId: "valibot-initial-state-missing-field",
			severity: "error",
			file: target.initialStateFile,
			line: 1,
			message: `Field '${key}' is not initialized in ${target.initialStateFunctionName ?? "createInitialGameState"}().`,
			context: key
		});
		return nestedKeys;
	}
	auditNestedTargets(target, typesAst, schemaAst, initialNested) {
		for (const nested of target.nestedTargets ?? []) this.auditSingleNestedTarget(target, nested, typesAst, schemaAst, initialNested);
	}
	auditSingleNestedTarget(target, nested, typesAst, schemaAst, initialNested) {
		const nestedInterfaceKeys = extractInterfaceKeys(typesAst, nested.interfaceName);
		const { keys: nestedSchemaKeys } = extractSchemaKeys(schemaAst, nested.schemaVarName);
		for (const nKey of nestedInterfaceKeys) {
			this.verifyNestedFieldInSchema(target, nested, nKey, nestedSchemaKeys);
			this.verifyNestedFieldInInitialState(target, nested, nKey, initialNested);
		}
	}
	verifyNestedFieldInSchema(target, nested, nKey, nestedSchemaKeys) {
		if (nestedSchemaKeys.has(nKey)) return;
		this.addViolation({
			ruleId: "valibot-nested-missing-field",
			severity: "error",
			file: target.schemaFile,
			line: 1,
			message: `Property '${nKey}' from '${nested.interfaceName}' is missing in '${nested.schemaVarName}'.`,
			context: nKey
		});
	}
	verifyNestedFieldInInitialState(target, nested, nKey, initialNested) {
		if (!nested.initialStateProperty || !initialNested) return;
		const propKeys = initialNested.get(nested.initialStateProperty);
		if (!propKeys || propKeys.has(nKey)) return;
		this.addViolation({
			ruleId: "valibot-nested-missing-field",
			severity: "error",
			file: target.initialStateFile ?? target.schemaFile,
			line: 1,
			message: `Property '${nKey}' from '${nested.interfaceName}' is not initialized in ${nested.initialStateProperty}.`,
			context: nKey
		});
	}
	iterateSchemaObjectProperties(target, schemaAst, callback) {
		const { declNode } = extractSchemaKeys(schemaAst, target.schemaVarName);
		if (!declNode?.initializer || !ts.isCallExpression(declNode.initializer)) return;
		const firstArg = declNode.initializer.arguments[0];
		if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) return;
		for (const prop of firstArg.properties) {
			if (!ts.isPropertyAssignment(prop)) continue;
			const propName = prop.name.getText(schemaAst).replace(/['"]/g, "");
			const line = schemaAst.getLineAndCharacterOfPosition(prop.getStart(schemaAst)).line + 1;
			callback(propName, prop.initializer, line);
		}
	}
	auditUnknownUsage(target, schemaAst) {
		const allowedUnknown = new Set(target.allowedUnknownFields ?? []);
		this.iterateSchemaObjectProperties(target, schemaAst, (propName, initializer, line) => {
			this.checkUnknownUsage(target, propName, initializer, line, allowedUnknown);
		});
	}
	auditRedundantNullability(target, schemaAst) {
		const allowedNullable = new Set(target.allowedNullableFields ?? []);
		this.iterateSchemaObjectProperties(target, schemaAst, (propName, initializer, line) => {
			this.checkRedundantNullability(target, propName, initializer, line, allowedNullable);
		});
	}
	checkUnknownUsage(target, propName, initializer, line, allowedUnknown) {
		let expr = initializer;
		if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === "optional" && expr.arguments[0]) expr = expr.arguments[0];
		if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === "unknown") {
			if (!allowedUnknown.has(propName)) this.addViolation({
				ruleId: "valibot-domain-type-violation",
				severity: "error",
				file: target.schemaFile,
				line,
				message: `Field '${propName}' uses unknown() in ${target.schemaVarName}.`,
				context: propName
			});
		}
	}
	checkRedundantNullability(target, propName, initializer, line, allowedNullable) {
		if (ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression) && initializer.expression.text === "optional") {
			const inner = initializer.arguments[0];
			if (inner && ts.isCallExpression(inner) && ts.isIdentifier(inner.expression) && inner.expression.text === "nullable") {
				if (!allowedNullable.has(propName)) this.addViolation({
					ruleId: "valibot-redundant-nullability",
					severity: "warning",
					file: target.schemaFile,
					line,
					message: `Field '${propName}' uses redundant optional(nullable(...)) in ${target.schemaVarName}.`,
					context: propName
				});
			}
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateValibotParityAuditor());
export { VALIBOT_PARITY_RULES, ValidateValibotParityAuditor, extractEphemeralKeys, extractInitialStateKeys, extractInterfaceKeys, extractObjectLiteralKeys, extractSchemaKeys, extractSerializerKeys };
