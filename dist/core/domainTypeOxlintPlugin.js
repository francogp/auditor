//#region src/core/domainTypeOxlintPlugin.ts
const COMMON_NON_DOMAIN_SET_NAMES = /* @__PURE__ */ new Set([
	"FLAGS",
	"DIRS",
	"ROOTS",
	"PATHS",
	"COMMANDS",
	"TAGS",
	"ELEMENTS",
	"SELECTORS",
	"TOKENS",
	"KEYWORDS",
	"CHARS",
	"GLOBS",
	"FILES",
	"EXTENSIONS",
	"NAMES",
	"KEYS",
	"WORDS",
	"ALIASES",
	"SKILLS",
	"SKIP",
	"VARIANTS",
	"CLASSES",
	"BUILTINS",
	"PACKAGES",
	"ENTRIES",
	"LINES",
	"CHUNKS",
	"ATTRIBUTES",
	"PROPERTIES",
	"ALLOWED_EXTS"
]);
const domainTypeOxlintPlugin = {
	meta: {
		name: "@francogp/domain-type",
		version: "1.1.0"
	},
	rules: {
		"no-naked-string-union": {
			meta: {
				type: "problem",
				docs: { description: "Forbids open string unions (| string) or wildcards that dilute typed domains" }
			},
			create(context) {
				return { TSUnionType(node) {
					const types = node.types ?? [];
					if (!types.some((t) => t.type === "TSStringKeyword")) return;
					if (types.some((t) => {
						if (t.type === "TSLiteralType" && typeof t.literal?.value === "string") return true;
						if (t.type === "TSTemplateLiteralType") return true;
						if (t.type === "TSTypeReference") {
							const name = t.typeName?.name;
							return typeof name === "string" && name.length > 0;
						}
						return false;
					})) context.report({
						node,
						message: "Using open string unions (| string) with domain types or literals is STRICTLY PROHIBITED. Use canonical domain types or Branded Types."
					});
				} };
			}
		},
		"no-record-string-key": {
			meta: {
				type: "problem",
				docs: { description: "Forbids Record<string, T> or Record<PropertyKey, T> in favor of explicit domain keys" }
			},
			create(context) {
				return { TSTypeReference(node) {
					if (node.typeName?.name !== "Record") return;
					const params = node.typeArguments?.params ?? node.typeParameters?.params ?? [];
					if (params.length === 0) return;
					const firstParam = params[0];
					if (!firstParam) return;
					if (!(firstParam.type === "TSStringKeyword" || firstParam.type === "TSTypeReference" && firstParam.typeName?.name === "PropertyKey")) return;
					const secondParam = params[1];
					if (secondParam && (secondParam.type === "TSUnknownKeyword" || secondParam.type === "TSAnyKeyword")) return;
					context.report({
						node,
						message: "Using Record<string, T> or Record<PropertyKey, T> is PROHIBITED. Use Record<DomainId, T> with a canonical domain key."
					});
				} };
			}
		},
		"no-untyped-string-set-map": {
			meta: {
				type: "problem",
				docs: { description: "Forbids new Set / new Map with string literals without canonical domain typing" }
			},
			create(context) {
				return { NewExpression(node) {
					const callee = node.callee;
					if (!callee || callee.name !== "Set" && callee.name !== "Map") return;
					const typeParams = node.typeArguments?.params ?? node.typeParameters?.params ?? [];
					const hasUntypedParam = typeParams.some((p) => p.type === "TSStringKeyword");
					const args = node.arguments ?? [];
					if (args.length > 0) {
						const firstArg = args[0];
						if (firstArg && firstArg.type === "ArrayExpression") {
							if (firstArg.elements?.some((el) => el?.type === "Literal" && typeof el.value === "string") && (typeParams.length === 0 || hasUntypedParam)) context.report({
								node,
								message: `Instantiating ${callee.name} with string literals without explicit domain typing is PROHIBITED.`
							});
						}
					}
				} };
			}
		},
		"no-broad-string-array": {
			meta: {
				type: "problem",
				docs: { description: "Forbids string literal arrays without as const or canonical domain typing" }
			},
			create(context) {
				return { VariableDeclarator(node) {
					if (!node.init) return;
					let isConstAssertion = false;
					let arrayExpr = node.init;
					if (node.init.type === "TSAsExpression") {
						if (node.init.typeAnnotation?.type === "TSTypeReference" && node.init.typeAnnotation.typeName?.name === "const") isConstAssertion = true;
						arrayExpr = node.init.expression;
					}
					if (arrayExpr?.type === "ArrayExpression" && !isConstAssertion) {
						const elements = arrayExpr.elements ?? [];
						if (elements.length > 0 && elements.every((el) => el?.type === "Literal" && typeof el.value === "string")) {
							const idType = node.id?.typeAnnotation?.typeAnnotation;
							if (!idType || idType.type === "TSArrayType" && idType.elementType?.type === "TSStringKeyword") context.report({
								node,
								message: "String literal array declared without `as const`. Add `as const` or type with a canonical domain."
							});
						}
					}
				} };
			}
		},
		"no-double-cast-unknown": {
			meta: {
				type: "problem",
				docs: { description: "Strictly forbids double assertions or casts to unknown (`as unknown -> as T`)" }
			},
			create(context) {
				const verifyNode = (node) => {
					const typeAnn = node.typeAnnotation;
					if (typeAnn && (typeAnn.type === "TSUnknownKeyword" || typeAnn.type === "TSTypeReference" && typeAnn.typeName?.name === "unknown")) context.report({
						node,
						message: "Casting to unknown (`as unknown`) is STRICTLY PROHIBITED. Use type guards, canonical typing, or direct interfaces."
					});
				};
				return {
					TSAsExpression: verifyNode,
					TSTypeAssertion: verifyNode
				};
			}
		},
		"no-legacy-date": {
			meta: {
				type: "problem",
				docs: { description: "Forbids legacy Date constructors (new Date() and Date.now()) in favor of Temporal API" }
			},
			create(context) {
				return {
					NewExpression(node) {
						const callee = node.callee;
						if (callee && (callee.name === "Date" || callee.type === "Identifier" && callee.name === "Date")) context.report({
							node,
							message: "Using new Date() is STRICTLY PROHIBITED. Use modern Temporal API (Temporal.Now.instant() / Temporal.Instant)."
						});
					},
					CallExpression(node) {
						const callee = node.callee;
						if (callee && (callee.type === "MemberExpression" || callee.object)) {
							const obj = callee.object;
							const prop = callee.property;
							if ((obj?.name === "Date" || obj?.type === "Identifier" && obj.name === "Date") && (prop?.name === "now" || prop?.type === "Identifier" && prop.name === "now")) context.report({
								node,
								message: "Using Date.now() is STRICTLY PROHIBITED. Use Temporal.Now.instant().epochMilliseconds or performance.now()."
							});
						}
					}
				};
			}
		},
		"no-unbranded-id": {
			meta: {
				type: "problem",
				docs: { description: "Forbids domain identifier aliases (type XId = string) without nominal Brand" }
			},
			create(context) {
				return { TSTypeAliasDeclaration(node) {
					const typeName = node.id?.name;
					if (!typeName || !/^[A-Z]\w*Id$/.test(typeName)) return;
					if (node.typeAnnotation?.type === "TSStringKeyword") context.report({
						node,
						message: `Domain identifier '${typeName}' must not be a bare string. Use Brand<string, '${typeName}'> or a canonical union.`
					});
				} };
			}
		},
		"no-json-clone": {
			meta: {
				type: "problem",
				docs: { description: "Forbids JSON.parse(JSON.stringify(...)) in favor of structuredClone() or functional factories" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (!callee || callee.name !== "parse" && callee.property?.name !== "parse") return;
					if (callee.object?.name !== "JSON") return;
					const args = node.arguments ?? [];
					if (args.length > 0) {
						const firstArg = args[0];
						if (firstArg?.type === "CallExpression") {
							const innerCallee = firstArg.callee;
							if (innerCallee?.object?.name === "JSON" && (innerCallee.name === "stringify" || innerCallee.property?.name === "stringify")) context.report({
								node,
								message: "Using JSON.parse(JSON.stringify(...)) is PROHIBITED due to O(N) overhead. Use structuredClone() or factory functions."
							});
						}
					}
				} };
			}
		},
		"no-redundant-spread-return": {
			meta: {
				type: "problem",
				docs: { description: "Forbids shallow spread returns return [...arr] when array is already immutable" }
			},
			create(context) {
				return { ReturnStatement(node) {
					const arg = node.argument;
					if (arg?.type === "ArrayExpression") {
						const elements = arg.elements ?? [];
						if (elements.length === 1 && elements[0]?.type === "SpreadElement") context.report({
							node,
							message: "Redundant spread return with return [...arr]. Return the array directly or mark it as readonly T[]."
						});
					}
				} };
			}
		},
		"no-boolean-literal-annotation": {
			meta: {
				type: "problem",
				docs: { description: "Forbids explicit boolean literal type annotations (: true or : false)" }
			},
			create(context) {
				return { TSTypeAnnotation(node) {
					const inner = node.typeAnnotation;
					if (!inner) return;
					if (inner.type === "TSLiteralType" && typeof inner.literal?.value === "boolean" || inner.type === "TSTrueKeyword" || inner.type === "TSFalseKeyword") context.report({
						node,
						message: "Redundant literal annotation (: true or : false). Use : boolean or type inference by assignment."
					});
				} };
			}
		},
		"no-async-in-computed": {
			meta: {
				type: "problem",
				docs: { description: "Forbids async callbacks inside computed() in Vue 3" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (!callee || callee.name !== "computed" && callee.property?.name !== "computed") return;
					const args = node.arguments ?? [];
					if (args.length > 0) {
						const callback = args[0];
						if (callback && (callback.type === "ArrowFunctionExpression" || callback.type === "FunctionExpression")) {
							if (callback.async) context.report({
								node,
								message: "Async callback in computed() is prohibited. computed does not unwrap promises; use watchEffect or VueUse computedAsync."
							});
						}
					}
				} };
			}
		},
		"watch-reactive-property-getter": {
			meta: {
				type: "problem",
				docs: { description: "Requires getter function () => props.foo when watching reactive properties in watch()" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (!callee || callee.name !== "watch" && callee.property?.name !== "watch") return;
					const args = node.arguments ?? [];
					if (args.length > 0) {
						const target = args[0];
						if (target?.type === "MemberExpression") {
							const obj = target.object;
							if (obj?.name === "props" || obj?.type === "Identifier" && obj.name === "props") context.report({
								node,
								message: "Direct observation of props property in watch(). Use a getter function watch(() => props.property, ...) to preserve reactivity."
							});
						}
					}
				} };
			}
		},
		"no-destructured-reactive": {
			meta: {
				type: "problem",
				docs: { description: "Forbids destructuring reactive() objects directly without toRefs()" }
			},
			create(context) {
				return { VariableDeclarator(node) {
					if (node.id?.type === "ObjectPattern") {
						const init = node.init;
						if (init?.type === "CallExpression") {
							const callee = init.callee;
							if (callee?.name === "reactive" || callee?.property?.name === "reactive") context.report({
								node,
								message: "Direct destructuring of reactive() is prohibited without toRefs(). Wrap object with toRefs() to preserve reactivity."
							});
						}
					}
				} };
			}
		}
	}
};
//#endregion
export { COMMON_NON_DOMAIN_SET_NAMES, domainTypeOxlintPlugin as default, domainTypeOxlintPlugin };
