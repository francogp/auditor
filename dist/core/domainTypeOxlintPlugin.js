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
function hasAttachedCommentDirective(sourceCode, node, validDirectives) {
	const beforeComments = sourceCode.getCommentsBefore?.(node) ?? [];
	const afterComments = sourceCode.getCommentsAfter?.(node) ?? [];
	const attached = [...beforeComments, ...afterComments];
	for (const c of attached) {
		const text = typeof c === "string" ? c : c.value ?? "";
		for (const dir of validDirectives) if (text.includes(`${dir}:`) || text.includes(dir)) return true;
	}
	return false;
}
function hasSurroundingLineDirective(fullText, nodeRange, validDirectives) {
	const [start, end] = nodeRange;
	const lineStart = fullText.lastIndexOf("\n", start) + 1;
	let lineEnd = fullText.indexOf("\n", end);
	if (lineEnd === -1) lineEnd = fullText.length;
	const prevLineStart = lineStart > 1 ? fullText.lastIndexOf("\n", lineStart - 2) + 1 : 0;
	const nextLineEnd = lineEnd < fullText.length ? fullText.indexOf("\n", lineEnd + 1) : fullText.length;
	const snippet = fullText.slice(prevLineStart, nextLineEnd === -1 ? fullText.length : nextLineEnd);
	for (const dir of validDirectives) if (snippet.includes(`// ${dir}:`) || snippet.includes(`/* ${dir}:`) || snippet.includes(`// ${dir}`)) return true;
	return false;
}
/**
* Checks whether an AST node or its surrounding code has an authorized escape directive.
*/
function hasOxlintEscapeComment(context, node, validDirectives) {
	const sourceCode = context.getSourceCode?.();
	if (!sourceCode) return false;
	if (hasAttachedCommentDirective(sourceCode, node, validDirectives)) return true;
	const nodeText = sourceCode.getText?.(node) ?? "";
	for (const dir of validDirectives) if (nodeText.includes(`// ${dir}:`) || nodeText.includes(`/* ${dir}:`)) return true;
	const fullText = sourceCode.getText?.() ?? "";
	const nodeRange = node.range;
	if (fullText && nodeRange && Array.isArray(nodeRange) && nodeRange.length >= 2) return hasSurroundingLineDirective(fullText, [nodeRange[0], nodeRange[1]], validDirectives);
	return false;
}
const domainTypeOxlintPlugin = {
	meta: {
		name: "@francogp/domain-type",
		version: "1.1.0"
	},
	rules: {
		"no-naked-string-union": {
			meta: {
				type: "problem",
				docs: { description: "Prohíbe uniones de cadenas abiertas (| string) o comodines que diluyen el dominio tipado" }
			},
			create(context) {
				return { TSUnionType(node) {
					if (hasOxlintEscapeComment(context, node, [
						"string-ok",
						"domain-ok",
						"no-domain"
					])) return;
					const types = node.types ?? [];
					const hasStringKeyword = types.some((t) => t.type === "TSStringKeyword");
					const hasLiteralString = types.some((t) => t.type === "TSLiteralType" && typeof t.literal?.value === "string");
					if (hasStringKeyword && hasLiteralString) context.report({
						node,
						message: "Está ESTRICTAMENTE PROHIBIDO usar uniones de string abiertas (| string). Usa tipos de dominio canónicos o marcas (Branded Types)."
					});
				} };
			}
		},
		"no-record-string-key": {
			meta: {
				type: "problem",
				docs: { description: "Prohíbe Record<string, T> o Record<PropertyKey, T> en favor de claves de dominio explícitas" }
			},
			create(context) {
				return { TSTypeReference(node) {
					if (node.typeName?.name !== "Record") return;
					if (hasOxlintEscapeComment(context, node, [
						"open-record",
						"dto-ok",
						"domain-ok",
						"no-domain",
						"infra-id-ok"
					])) return;
					const params = node.typeArguments?.params ?? node.typeParameters?.params ?? [];
					if (params.length === 0) return;
					const firstParam = params[0];
					if (!firstParam) return;
					if (!(firstParam.type === "TSStringKeyword" || firstParam.type === "TSTypeReference" && firstParam.typeName?.name === "PropertyKey")) return;
					const secondParam = params[1];
					if (secondParam && (secondParam.type === "TSUnknownKeyword" || secondParam.type === "TSAnyKeyword")) return;
					context.report({
						node,
						message: "Está PROHIBIDO usar Record<string, T> o Record<PropertyKey, T>. Usa Record<DomainId, T> con un dominio de claves canónico."
					});
				} };
			}
		},
		"no-untyped-string-set-map": {
			meta: {
				type: "problem",
				docs: { description: "Prohíbe new Set / new Map con cadenas literales sin tipado canónico de dominio" }
			},
			create(context) {
				return { NewExpression(node) {
					const callee = node.callee;
					if (!callee || callee.name !== "Set" && callee.name !== "Map") return;
					if (hasOxlintEscapeComment(context, node, [
						"runtime-set",
						"runtime-map",
						"domain-ok",
						"no-domain"
					])) return;
					const typeParams = node.typeArguments?.params ?? node.typeParameters?.params ?? [];
					const hasUntypedParam = typeParams.some((p) => p.type === "TSStringKeyword");
					const args = node.arguments ?? [];
					if (args.length > 0) {
						const firstArg = args[0];
						if (firstArg && firstArg.type === "ArrayExpression") {
							if (firstArg.elements?.some((el) => el?.type === "Literal" && typeof el.value === "string") && (typeParams.length === 0 || hasUntypedParam)) context.report({
								node,
								message: `Está PROHIBIDO instanciar ${callee.name} con cadenas literales sin tipado de dominio explícito.`
							});
						}
					}
				} };
			}
		},
		"no-broad-string-array": {
			meta: {
				type: "problem",
				docs: { description: "Prohíbe arrays de literales de cadena sin as const o tipado de dominio canónico" }
			},
			create(context) {
				return { VariableDeclarator(node) {
					if (!node.init) return;
					if (hasOxlintEscapeComment(context, node, [
						"string-ok",
						"domain-ok",
						"no-domain"
					])) return;
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
								message: "Array de literales de cadena declarado sin `as const`. Añade `as const` o tipa con un dominio canónico."
							});
						}
					}
				} };
			}
		},
		"no-double-cast-unknown": {
			meta: {
				type: "problem",
				docs: { description: "Prohíbe terminantemente el uso de doble casteo o aserciones hacia unknown (`as unknown -> as T`)" }
			},
			create(context) {
				const verifyNode = (node) => {
					if (hasOxlintEscapeComment(context, node, [
						"type-ok",
						"cast-ok",
						"domain-ok"
					])) return;
					const typeAnn = node.typeAnnotation;
					if (typeAnn && (typeAnn.type === "TSUnknownKeyword" || typeAnn.type === "TSTypeReference" && typeAnn.typeName?.name === "unknown")) context.report({
						node,
						message: "Está ESTRICTAMENTE PROHIBIDO usar casteo hacia unknown (`as unknown`). Usa guardas de tipo, tipado canónico o interfaces directas."
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
				docs: { description: "Prohíbe el uso de constructores legados de Date (new Date() y Date.now()) en favor de Temporal API" }
			},
			create(context) {
				return {
					NewExpression(node) {
						if (hasOxlintEscapeComment(context, node, [
							"date-ok",
							"temporal-ok",
							"legacy-date-ok"
						])) return;
						const callee = node.callee;
						if (callee && (callee.name === "Date" || callee.type === "Identifier" && callee.name === "Date")) context.report({
							node,
							message: "El uso de new Date() está ESTRICTAMENTE PROHIBIDO. Usa la API moderna Temporal (Temporal.Now.instant() / Temporal.Instant)."
						});
					},
					CallExpression(node) {
						if (hasOxlintEscapeComment(context, node, [
							"date-ok",
							"temporal-ok",
							"legacy-date-ok"
						])) return;
						const callee = node.callee;
						if (callee && (callee.type === "MemberExpression" || callee.object)) {
							const obj = callee.object;
							const prop = callee.property;
							if ((obj?.name === "Date" || obj?.type === "Identifier" && obj.name === "Date") && (prop?.name === "now" || prop?.type === "Identifier" && prop.name === "now")) context.report({
								node,
								message: "El uso de Date.now() está ESTRICTAMENTE PROHIBIDO. Usa Temporal.Now.instant().epochMilliseconds o performance.now()."
							});
						}
					}
				};
			}
		},
		"no-unbranded-id": {
			meta: {
				type: "problem",
				docs: { description: "Prohíbe alias de identificadores de dominio (type XId = string) sin Brand nominal" }
			},
			create(context) {
				return { TSTypeAliasDeclaration(node) {
					const name = node.id?.name;
					if (!name || !/^[A-Z]\w*Id$/.test(name)) return;
					if (hasOxlintEscapeComment(context, node, [
						"infra-id-ok",
						"domain-ok",
						"no-domain"
					])) return;
					if (node.typeAnnotation?.type === "TSStringKeyword") context.report({
						node,
						message: `El identificador de dominio '${name}' no debe ser string puro. Usa Brand<string, '${name}'> o una unión canónica.`
					});
				} };
			}
		},
		"no-json-clone": {
			meta: {
				type: "problem",
				docs: { description: "Prohíbe JSON.parse(JSON.stringify(...)) en favor de structuredClone() o clonado funcional" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (!callee || callee.name !== "parse" && callee.property?.name !== "parse") return;
					if (callee.object?.name !== "JSON") return;
					if (hasOxlintEscapeComment(context, node, ["o1-ok", "clone-ok"])) return;
					const args = node.arguments ?? [];
					if (args.length > 0) {
						const firstArg = args[0];
						if (firstArg?.type === "CallExpression") {
							const innerCallee = firstArg.callee;
							if (innerCallee?.object?.name === "JSON" && (innerCallee.name === "stringify" || innerCallee.property?.name === "stringify")) context.report({
								node,
								message: "El uso de JSON.parse(JSON.stringify(...)) está PROHIBIDO por rendimiento O(N). Usa structuredClone() o funciones factoría."
							});
						}
					}
				} };
			}
		},
		"no-redundant-spread-return": {
			meta: {
				type: "problem",
				docs: { description: "Prohíbe retornos con propagación superficial return [...arr] cuando el array ya es inmutable" }
			},
			create(context) {
				return { ReturnStatement(node) {
					if (hasOxlintEscapeComment(context, node, ["o1-ok", "spread-ok"])) return;
					const arg = node.argument;
					if (arg?.type === "ArrayExpression") {
						const elements = arg.elements ?? [];
						if (elements.length === 1 && elements[0]?.type === "SpreadElement") context.report({
							node,
							message: "Retorno redundante con propagación return [...arr]. Devuelve directamente el array o márcalo como readonly T[]."
						});
					}
				} };
			}
		},
		"no-boolean-literal-annotation": {
			meta: {
				type: "problem",
				docs: { description: "Prohíbe anotaciones explícitas de literales booleanos (: true o : false)" }
			},
			create(context) {
				return { TSTypeAnnotation(node) {
					if (hasOxlintEscapeComment(context, node, ["type-ok"])) return;
					const inner = node.typeAnnotation;
					if (!inner) return;
					if (inner.type === "TSLiteralType" && typeof inner.literal?.value === "boolean" || inner.type === "TSTrueKeyword" || inner.type === "TSFalseKeyword") context.report({
						node,
						message: "Anotación literal redundante (: true o : false). Usa : boolean o inferencia de tipos por asignación."
					});
				} };
			}
		},
		"no-async-in-computed": {
			meta: {
				type: "problem",
				docs: { description: "Prohíbe callbacks asíncronos dentro de computed() en Vue 3" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (!callee || callee.name !== "computed" && callee.property?.name !== "computed") return;
					if (hasOxlintEscapeComment(context, node, ["reactivity-ok", "sfc-ok"])) return;
					const args = node.arguments ?? [];
					if (args.length > 0) {
						const callback = args[0];
						if (callback && (callback.type === "ArrowFunctionExpression" || callback.type === "FunctionExpression")) {
							if (callback.async) context.report({
								node,
								message: "Callback asíncrono en computed() prohibido. computed no desempaqueta promesas; usa watchEffect o computedAsync de VueUse."
							});
						}
					}
				} };
			}
		},
		"watch-reactive-property-getter": {
			meta: {
				type: "problem",
				docs: { description: "Exige pasar getter () => props.foo al observar propiedades reactivas en watch()" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (!callee || callee.name !== "watch" && callee.property?.name !== "watch") return;
					if (hasOxlintEscapeComment(context, node, ["reactivity-ok", "sfc-ok"])) return;
					const args = node.arguments ?? [];
					if (args.length > 0) {
						const target = args[0];
						if (target?.type === "MemberExpression") {
							const obj = target.object;
							if (obj?.name === "props" || obj?.type === "Identifier" && obj.name === "props") context.report({
								node,
								message: "Observación directa de propiedad props en watch(). Usa una función getter watch(() => props.property, ...) para preservar reactividad."
							});
						}
					}
				} };
			}
		},
		"no-destructured-reactive": {
			meta: {
				type: "problem",
				docs: { description: "Prohíbe desestructurar objetos reactive() directamente sin toRefs()" }
			},
			create(context) {
				return { VariableDeclarator(node) {
					if (hasOxlintEscapeComment(context, node, ["reactivity-ok", "sfc-ok"])) return;
					if (node.id?.type === "ObjectPattern") {
						const init = node.init;
						if (init?.type === "CallExpression") {
							const callee = init.callee;
							if (callee?.name === "reactive" || callee?.property?.name === "reactive") context.report({
								node,
								message: "Desestructuración directa de reactive() prohibida sin toRefs(). Envuelve el objeto con toRefs() para no perder reactividad."
							});
						}
					}
				} };
			}
		}
	}
};
//#endregion
export { COMMON_NON_DOMAIN_SET_NAMES, domainTypeOxlintPlugin as default, domainTypeOxlintPlugin, hasOxlintEscapeComment };
