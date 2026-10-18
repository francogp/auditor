import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { SharedAstContext } from "../../core/astContext.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import ts from "typescript";
//#region src/suites/persistence/validate_valibot_parity.ts
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
		const targetFiles = (getAuditConfig(options.projectRoot).valibot?.targets ?? []).flatMap((t) => [
			t.typesFile,
			t.schemaFile,
			...t.serializerFile ? [t.serializerFile] : [],
			...t.initialStateFile ? [t.initialStateFile] : []
		]);
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createRuleCapabilities(VALIBOT_PARITY_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: true,
				changedOnly: false,
				critical: false
			}),
			id: "validate_valibot_parity",
			name: "Valibot Schema & Persistence Parity Auditor",
			description: "Valida paridad bidireccional entre interfaces y Valibot",
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
				"valibot-schema-missing-field": "Campo faltante en schema",
				"valibot-serializer-missing-field": "Campo faltante en serializer",
				"valibot-initial-state-missing-field": "Campo ausente en estado base",
				"valibot-nested-missing-field": "Campo faltante en anidado",
				"valibot-domain-type-violation": "unknown() prohibido en schema",
				"valibot-redundant-nullability": "optional(nullable) redundante"
			},
			ruleRemediations: {
				"valibot-schema-missing-field": "📖 GUÍA DE REMEDIACIÓN: valibot-schema-missing-field\n1. Causa Raíz: Se declaró una propiedad en la interfaz TypeScript de estado (`interface GameState`, `interface UserProfile`, etc.), pero el campo correspondiente no está presente en el esquema Valibot (`v.object({ ... })`). Al deserializar datos persistidos, el campo será descartado o causará desajustes.\n2. Diagnóstico: Ubica el campo faltante reportado en la interfaz y comprueba el esquema en el archivo de esquemas Valibot.\n3. Solución Canónica:\n   a) Añade la validación del campo en el esquema Valibot: `key: v.string()`, `key: v.optional(...)`, etc.\n   b) Si el campo es estrictamente efímero en memoria y no debe persistirse, decláralo en el tipo unión de claves efímeras configurado (`ephemeralKeysType`).\n4. Ejemplo:\n   - Añadir en esquema: `avatarUrl: v.optional(v.string())`",
				"valibot-serializer-missing-field": "📖 GUÍA DE REMEDIACIÓN: valibot-serializer-missing-field\n1. Causa Raíz: Una propiedad de la interfaz de estado no es mapeada ni devuelta en la función serializadora personalizada (`serializeGameState()`). Los datos de esa propiedad se perderán al guardar.\n2. Diagnóstico: Revisa el objeto retornado por la función serializadora.\n3. Solución Canónica: Añade la propiedad al objeto retornado por el serializador.\n4. Ejemplo:\n   - Añadir en retorno: `score: state.score`",
				"valibot-initial-state-missing-field": "📖 GUÍA DE REMEDIACIÓN: valibot-initial-state-missing-field\n1. Causa Raíz: Una propiedad de la interfaz de estado no está inicializada en la factoría de estado inicial (`createInitialGameState()`). Al arrancar una sesión limpia, el estado contendrá valores `undefined` inesperados.\n2. Diagnóstico: Comprueba la factoría de estado inicial en el archivo reportado.\n3. Solución Canónica: Inicializa el campo con su valor por defecto tipado (ej: `0`, `\"\"`, `[]`, o `null`).\n4. Ejemplo:\n   - Añadir en factoría: `unlockedAchievements: []`",
				"valibot-nested-missing-field": "📖 GUÍA DE REMEDIACIÓN: valibot-nested-missing-field\n1. Causa Raíz: Un campo perteneciente a una subinterfaz anidada (ej: `interface InventoryItem`) falta en el subesquema Valibot anidado o en la factoría de inicialización.\n2. Diagnóstico: Inspecciona el subesquema o subfactoría señalada en el reporte.\n3. Solución Canónica: Añade el campo a la definición del subesquema anidado en Valibot.\n4. Ejemplo:\n   - Añadir en subesquema: `quantity: v.pipe(v.number(), v.minValue(1))`",
				"valibot-domain-type-violation": "📖 GUÍA DE REMEDIACIÓN: valibot-domain-type-violation\n1. Causa Raíz: Se utilizó `v.unknown()` o `v.any()` dentro de un esquema de validación de dominio. Esto degrada la tipificación estricta y permite que datos no estructurados corrompan el estado.\n2. Diagnóstico: Ubica la llamada a `v.unknown()` en el archivo de esquemas.\n3. Solución Canónica: Sustituye `v.unknown()` por el esquema específico del tipo de dato (ej: `v.string()`, `v.record(v.string(), v.number())` o un esquema anidado).\n4. Ejemplo:\n   ❌ Laxo:    `metadata: v.unknown()`\n   ✅ Estricto: `metadata: v.record(v.string(), v.string())`",
				"valibot-redundant-nullability": "📖 GUÍA DE REMEDIACIÓN: valibot-redundant-nullability\n1. Causa Raíz: Se compuso redundantemente `v.optional(v.nullable(...))` para aceptar `null | undefined`. La API canónica y concisa de Valibot proporciona la función integrada `v.nullish(...)`.\n2. Diagnóstico: Localiza la expresión `v.optional(v.nullable(...))` en el esquema.\n3. Solución Canónica: Reemplaza la composición redundante por `v.nullish(...)`.\n4. Ejemplo:\n   ❌ Redundante: `v.optional(v.nullable(v.string()))`\n   ✅ Canónico:  `v.nullish(v.string())`"
			},
			coverage: { include: targetFiles.length > 0 ? targetFiles : [
				"src/types/**/*.ts",
				"src/logic/**/*.ts",
				"src/stores/**/*.ts"
			] },
			projectRoot: options.projectRoot
		});
	}
	async runAudit(astContext) {
		const targets = getAuditConfig(this.projectRoot).valibot?.targets ?? [];
		if (targets.length === 0) {
			this.markSkipped("No se configuraron objetivos en valibot.targets");
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
				message: `El archivo configurado para '${target.id}' no existe en disco.`,
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
			message: `Campo '${key}' declarado en '${target.interfaceName}' falta en esquema '${target.schemaVarName}'.`,
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
			message: `Campo '${key}' no se serializa en ${target.serializerFunctionName ?? "serialize"}().`,
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
			message: `Campo '${key}' no está inicializado en ${target.initialStateFunctionName ?? "createInitialGameState"}().`,
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
			message: `Propiedad '${nKey}' de '${nested.interfaceName}' falta en '${nested.schemaVarName}'.`,
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
			message: `Propiedad '${nKey}' de '${nested.interfaceName}' no está inicializada en ${nested.initialStateProperty}.`,
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
				message: `Campo '${propName}' usa unknown() en ${target.schemaVarName}.`,
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
					message: `Campo '${propName}' usa optional(nullable(...)) redundante en ${target.schemaVarName}.`,
					context: propName
				});
			}
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateValibotParityAuditor());
//#endregion
export { VALIBOT_PARITY_RULES, ValidateValibotParityAuditor, extractEphemeralKeys, extractInitialStateKeys, extractInterfaceKeys, extractObjectLiteralKeys, extractSchemaKeys, extractSerializerKeys };
