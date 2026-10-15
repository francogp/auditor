//#region src/core/domainTypeOxlintPlugin.ts
const domainTypeOxlintPlugin = {
	meta: {
		name: "@francogp/domain-type",
		version: "1.0.0"
	},
	rules: {
		"no-naked-string-union": {
			meta: {
				type: "problem",
				docs: { description: "Prohíbe uniones de cadenas abiertas (| string) o comodines que diluyen el dominio tipado" }
			},
			create(context) {
				return { TSUnionType(node) {
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
					const params = node.typeArguments?.params ?? node.typeParameters?.params ?? [];
					if (params.length === 0) return;
					const firstParam = params[0];
					if (!firstParam) return;
					if (firstParam.type === "TSStringKeyword" || firstParam.type === "TSTypeReference" && firstParam.typeName?.name === "PropertyKey") context.report({
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
						const callee = node.callee;
						if (callee && (callee.name === "Date" || callee.type === "Identifier" && callee.name === "Date")) context.report({
							node,
							message: "El uso de new Date() está ESTRICTAMENTE PROHIBIDO. Usa la API moderna Temporal (Temporal.Now.instant() / Temporal.Instant)."
						});
					},
					CallExpression(node) {
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
		}
	}
};
//#endregion
export { domainTypeOxlintPlugin as default, domainTypeOxlintPlugin };
