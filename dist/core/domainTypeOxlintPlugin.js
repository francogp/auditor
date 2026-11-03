// src/core/domainTypeOxlintPlugin.ts
const CANONICAL_INFRA_ID_WHITELIST = [
	"suiteId",
	"ruleId",
	"runId",
	"buildId",
	"eslintRuleId",
	"taskId",
	"sessionId",
	"shortId"
];
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
function isGsapCall(node, methods = [
	"to",
	"from",
	"fromTo"
]) {
	const callee = node.callee;
	return callee?.type === "MemberExpression" && (callee.object?.name === "gsap" || callee.object?.name === "tl") && methods.includes(callee.property?.name ?? "");
}
function getNodePropKeyName(node) {
	const p = node;
	return p.key?.name ?? (typeof p.key?.value === "string" ? p.key.value : "");
}
const NON_DOMAIN_COLLECTION_REGEX = /\b\w*(?:lines|parts|chunks|words|tokens|classes|errors|warnings|achievements|logs|results|missing|args|flags|files|entries|rows|queries|messages|diffs|patterns|findings|details|dirs|paths|roots|globs|labels|violations|items|commands|scripts|headers|steps|rules|types|extensions|modules|sections|subtitles|names|codes|tags|candidates|res|list|arr|output|buffer|elements|records|sources|targets|params|values|keys|props|attributes|variants|aliases|skills)\b/i;
function getRuleContextFilename(context) {
	const raw = context.filename || (context.getFilename ? context.getFilename() : "");
	return raw ? raw.split("\\").join("/") : "";
}
function isInternalAuditorSource(fname) {
	return fname.includes("/core/") || fname.includes("/analyzers/") || fname.includes("/suites/") || fname.includes("/cli/") || fname.includes("/tests/");
}
function isExemptFileFromDomainPlugin(context) {
	const norm = getRuleContextFilename(context);
	if (!norm) return false;
	return norm.includes(".agents/") || norm.includes("/scratch/") || norm.includes("/tests/") || norm.includes("/assets/templates/") || norm.includes("/references/extensions/");
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
				docs: { description: "Forbids open string unions (| string) or wildcards that dilute typed domains" }
			},
			create(context) {
				return { TSUnionType(node) {
					const types = node.types ?? [];
					if (!types.some((t) => t.type === "TSStringKeyword")) return;
					const BUILTIN_TYPES = /* @__PURE__ */ new Set([
						"Buffer",
						"Uint8Array",
						"ArrayBuffer",
						"Blob",
						"Error",
						"RegExp",
						"Date",
						"URL",
						"Promise",
						"Record",
						"Array",
						"Set",
						"Map",
						"NodeJS"
					]);
					if (types.some((t) => {
						if (t.type === "TSLiteralType" && typeof t.literal?.value === "string") return true;
						if (t.type === "TSTemplateLiteralType") return true;
						if (t.type === "TSTypeReference") {
							const name = t.typeName?.name;
							if (!name || BUILTIN_TYPES.has(name)) return false;
							if (/(?:Config|Options|Props|Entry|Context|Result|Node|Schema|Descriptor|Handler|Plugin|Runner|Item|Target)$/.test(name)) return false;
							return true;
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
				const fname = getRuleContextFilename(context);
				if (fname && isInternalAuditorSource(fname)) return {};
				return { TSTypeReference(node) {
					if (node.typeName?.name !== "Record") return;
					if (fname) {
						if (!(fname.includes("/types/") || fname.includes("/data/") || fname.endsWith(".d.ts") || fname.endsWith("Types.ts") || fname.endsWith("Schema.ts") || fname.endsWith("Model.ts") || fname.endsWith("Contract.ts"))) return;
					}
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
				const fname = getRuleContextFilename(context);
				if (fname && isInternalAuditorSource(fname)) return {};
				return { NewExpression(node) {
					const callee = node.callee;
					if (!callee || callee.name !== "Set" && callee.name !== "Map") return;
					const parent = node.parent;
					const varName = parent?.id?.name ?? parent?.key?.name ?? "";
					if (varName && (NON_DOMAIN_COLLECTION_REGEX.test(varName) || COMMON_NON_DOMAIN_SET_NAMES.has(varName.toUpperCase()))) return;
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
					const fname = context.filename ?? (context.getFilename ? context.getFilename() : "");
					if (fname && (fname.endsWith(".js") || fname.endsWith(".cjs") || fname.endsWith(".mjs"))) return;
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
		},
		"no-store-destructuring-without-storetorefs": {
			meta: {
				type: "problem",
				docs: { description: "Forbids destructuring Pinia stores directly without storeToRefs()" }
			},
			create(context) {
				const storeIdentifiers = /* @__PURE__ */ new Set();
				return { VariableDeclarator(node) {
					if (node.id?.type === "ObjectPattern") {
						const init = node.init;
						if (init?.type === "CallExpression") {
							const callee = init.callee;
							const calleeName = callee?.name || callee?.property?.name;
							if (typeof calleeName === "string" && /^use[A-Z]\w*Store$/.test(calleeName)) {
								context.report({
									node,
									message: `Direct destructuring of Pinia store '${calleeName}()' strips reactivity. Wrap with 'storeToRefs(${calleeName}())' or access properties on the store instance.`
								});
								return;
							}
						}
						if (init?.type === "Identifier" && typeof init.name === "string" && storeIdentifiers.has(init.name)) {
							context.report({
								node,
								message: `Indirect destructuring of Pinia store '${init.name}' strips reactivity. Wrap with 'storeToRefs(${init.name})' or access properties on the store instance.`
							});
							return;
						}
					} else if (node.id?.type === "Identifier" && typeof node.id.name === "string") {
						if (node.init?.type === "CallExpression") {
							const callee = node.init.callee;
							const calleeName = callee?.name || callee?.property?.name;
							if (typeof calleeName === "string" && /^use[A-Z]\w*Store$/.test(calleeName)) storeIdentifiers.add(node.id.name);
						}
					}
				} };
			}
		},
		"no-direct-state-mutation-outside-actions": {
			meta: {
				type: "problem",
				docs: { description: "Forbids direct assignment to store.$state outside actions or persistence coordinators" }
			},
			create(context) {
				return { AssignmentExpression(node) {
					const left = node.left;
					if (left?.type === "MemberExpression") {
						const isDirectState = left.property?.name === "$state";
						const isNestedState = left.object?.type === "MemberExpression" && left.object.property?.name === "$state";
						if (isDirectState || isNestedState) context.report({
							node,
							message: "Direct state mutation via store.$state is PROHIBITED. Mutate state through store actions, $patch(), or dedicated persistence coordinators."
						});
					}
				} };
			}
		},
		"no-deprecated-router-next": {
			meta: {
				type: "problem",
				docs: { description: "Forbids deprecated 3-parameter next() in Vue Router navigation guards" }
			},
			create(context) {
				const ROUTER_GUARD_METHODS = /* @__PURE__ */ new Set([
					"beforeEach",
					"beforeResolve",
					"afterEach",
					"beforeEnter"
				]);
				return { CallExpression(node) {
					const callee = node.callee;
					const methodName = callee?.name || callee?.property?.name;
					if (typeof methodName === "string" && ROUTER_GUARD_METHODS.has(methodName)) {
						const args = node.arguments ?? [];
						if (args.length > 0) {
							const callback = args[0];
							if (callback && (callback.type === "ArrowFunctionExpression" || callback.type === "FunctionExpression")) {
								if ((callback.params ?? []).length >= 3) context.report({
									node: callback,
									message: `Deprecated 3-parameter '(to, from, next)' guard in Vue Router '${methodName}'. Navigation guards must return boolean or route location in Vue Router 4.`
								});
							}
						}
					}
				} };
			}
		},
		"no-define-async-component-in-router": {
			meta: {
				type: "problem",
				docs: { description: "Forbids wrapping router route components with defineAsyncComponent" }
			},
			create(context) {
				return { Property(node) {
					const key = node.key;
					if ((key?.name || key?.value) === "component") {
						const value = node.value;
						if (value?.type === "CallExpression") {
							const callee = value.callee;
							if ((callee?.name || callee?.property?.name) === "defineAsyncComponent") context.report({
								node,
								message: "Wrapping route component with 'defineAsyncComponent' is prohibited. Vue Router 4 natively supports dynamic imports '() => import(...)'. "
							});
						}
					}
				} };
			}
		},
		"no-window-location-navigation": {
			meta: {
				type: "problem",
				docs: { description: "Forbids hard window.location navigation for internal SPA routes" }
			},
			create(context) {
				function isRelativePathLiteral(valNode) {
					if (!valNode || typeof valNode !== "object") return false;
					const literal = valNode;
					if (literal.type === "Literal" && typeof literal.value === "string") {
						const v = literal.value;
						return v.startsWith("/") && !v.startsWith("//");
					}
					return false;
				}
				return {
					AssignmentExpression(node) {
						const left = node.left;
						if (left?.type === "MemberExpression") {
							if (left.property?.name === "href" && (left.object?.name === "location" || left.object?.type === "MemberExpression" && left.object.property?.name === "location") && isRelativePathLiteral(node.right)) context.report({
								node,
								message: "Using 'window.location.href' for internal SPA navigation destroys client state. Use router.push() or <RouterLink>."
							});
						}
					},
					CallExpression(node) {
						const callee = node.callee;
						if (callee?.type === "MemberExpression") {
							const isLocationAssign = callee.property?.name === "assign" && (callee.object?.name === "location" || callee.object?.type === "MemberExpression" && callee.object.property?.name === "location");
							const args = node.arguments ?? [];
							if (isLocationAssign && args.length > 0 && isRelativePathLiteral(args[0])) context.report({
								node,
								message: "Using 'window.location.assign()' for internal SPA navigation destroys client state. Use router.push() or <RouterLink>."
							});
						}
					}
				};
			}
		},
		"no-silent-promise-catch": {
			meta: {
				type: "problem",
				docs: { description: "Forbids silent promise catches that swallow rejections" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.type === "MemberExpression" && callee.property?.name === "catch") {
						const args = node.arguments ?? [];
						if (args.length > 0) {
							const handler = args[0];
							if (handler && (handler.type === "ArrowFunctionExpression" || handler.type === "FunctionExpression")) {
								const body = handler.body;
								const bodyNode = body && !Array.isArray(body) ? body : void 0;
								const innerBody = bodyNode?.body;
								const blockStatements = Array.isArray(innerBody) ? innerBody : [];
								const isEmptyBlock = bodyNode?.type === "BlockStatement" && blockStatements.length === 0;
								const isNullOrUndefined = bodyNode?.type === "Literal" && bodyNode.value === null;
								const isUndefinedIdent = bodyNode?.type === "Identifier" && bodyNode.name === "undefined";
								if (isEmptyBlock || isNullOrUndefined || isUndefinedIdent) context.report({
									node,
									message: "Silent promise rejection handler '.catch(...)' suppresses errors. Log the error or rethrow."
								});
							}
						}
					}
				} };
			}
		},
		"no-silent-mock-fallbacks": {
			meta: {
				type: "problem",
				docs: { description: "Forbids Valibot v.fallback() silently masking schema errors" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					const isVFallback = callee?.type === "MemberExpression" && callee.object?.name === "v" && callee.property?.name === "fallback";
					const isDirectFallback = callee?.type === "Identifier" && callee.name === "fallback";
					if (isVFallback || isDirectFallback) context.report({
						node,
						message: "Using Valibot 'fallback()' or 'v.fallback()' is PROHIBITED. Fail loud at boundaries rather than silently healing invalid schema data."
					});
				} };
			}
		},
		"strict-catch-narrowing": {
			meta: {
				type: "problem",
				docs: { description: "Requires explicit type narrowing before accessing caught error properties" }
			},
			create(context) {
				return { CatchClause(node) {
					const param = node.param;
					if (!param || param.type !== "Identifier" || typeof param.name !== "string") return;
					const errParamName = param.name;
					const bodyText = context.getSourceCode ? context.getSourceCode().getText(node.body) : "";
					const accessesMessageOrCode = bodyText.includes(`${errParamName}.message`) || bodyText.includes(`${errParamName}.code`) || bodyText.includes(`${errParamName}.stack`);
					const hasInstanceOfNarrowing = bodyText.includes(`${errParamName} instanceof Error`) || bodyText.includes(`instanceof Error`);
					if (accessesMessageOrCode && !hasInstanceOfNarrowing) context.report({
						node: node.param,
						message: `Caught exception '${errParamName}' accessed (.message/.code) without type narrowing. Narrow with 'if (${errParamName} instanceof Error)' first.`
					});
				} };
			}
		},
		"dom-event-leak": {
			meta: {
				type: "problem",
				docs: { description: "Detects addEventListener without cleanup or once: true" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.type === "MemberExpression" && callee.property?.name === "addEventListener") {
						const args = node.arguments ?? [];
						if (args.length >= 3) {
							const opt = args[2];
							if (opt?.type === "ObjectLiteralExpression" || opt?.type === "ObjectExpression") {
								if (opt.properties?.some((p) => {
									const k = p.key?.name || p.key?.value;
									const v = p.value?.value;
									return k === "once" && v === true;
								})) return;
							}
						}
						const fullText = context.getSourceCode ? context.getSourceCode().getText() : "";
						if (!(fullText.includes("removeEventListener") || fullText.includes("onUnmounted") || fullText.includes("onBeforeUnmount") || fullText.includes("onScopeDispose"))) context.report({
							node,
							message: "Potential DOM event listener leak: 'addEventListener' attached without '{ once: true }', 'removeEventListener', or 'onUnmounted()' lifecycle cleanup."
						});
					}
				} };
			}
		},
		"interval-leak": {
			meta: {
				type: "problem",
				docs: { description: "Detects setInterval without matching clearInterval or cleanup" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.name === "setInterval" || callee?.type === "MemberExpression" && callee.property?.name === "setInterval") {
						if (!(context.getSourceCode ? context.getSourceCode().getText() : "").includes("clearInterval")) context.report({
							node,
							message: "Potential timer leak: 'setInterval' invoked without a matching 'clearInterval'. Store the timer ID and clear it on unmount."
						});
					}
				} };
			}
		},
		"no-boolean-trap-parameters": {
			meta: {
				type: "problem",
				docs: { description: "Forbids multiple positional boolean parameters in function signatures" }
			},
			create(context) {
				function checkParams(node) {
					const params = node.params ?? [];
					let booleanCount = 0;
					for (const param of params) {
						const typeAnnotation = param.typeAnnotation?.typeAnnotation?.type ?? param.typeAnnotation?.type;
						const nestedType = param.parameter?.typeAnnotation?.typeAnnotation?.type;
						if (typeAnnotation === "TSBooleanKeyword" || nestedType === "TSBooleanKeyword") booleanCount++;
					}
					if (booleanCount >= 2) context.report({
						node,
						message: "Positional boolean parameters detected (multiple boolean arguments). Refactor multiple boolean flags into a typed options object with named properties."
					});
				}
				return {
					FunctionDeclaration: checkParams,
					FunctionExpression: checkParams,
					ArrowFunctionExpression: checkParams
				};
			}
		},
		"no-massive-switch": {
			meta: {
				type: "problem",
				docs: { description: "Forbids switch statements with excessive case branches" }
			},
			create(context) {
				return { SwitchStatement(node) {
					const cases = node.cases ?? [];
					if (cases.length > 10) context.report({
						node,
						message: `Massive switch statement (${cases.length} cases) detected. Refactor branches into a domain map table or strategy handlers.`
					});
				} };
			}
		},
		"no-tautological-integration-mocks": {
			meta: {
				type: "problem",
				docs: { description: "Forbids mocking database or core execution engines in integration tests" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.type === "MemberExpression" && callee.object?.name === "vi") {
						const method = callee.property?.name;
						if (method === "mock" || method === "spyOn") {
							const firstArg = node.arguments?.[0];
							const target = typeof firstArg?.value === "string" ? firstArg.value : "";
							const filename = context.filename || (context.getFilename ? context.getFilename() : "");
							const isIntegration = filename.includes("integration") || /tests[\\/]integration/i.test(filename);
							const isForbiddenTarget = target.includes("supabase") || target.includes("db") || target.includes("@/logic/db");
							if (isIntegration && isForbiddenTarget) context.report({
								node,
								message: `Tautological mock detected in integration test. Mocking core execution engine '${target}' is strictly forbidden in tests/integration/.`
							});
						}
					}
				} };
			}
		},
		"playwright-id-locators-only": {
			meta: {
				type: "problem",
				docs: { description: "Enforces 100% ID-based locators in E2E simulations" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.type === "MemberExpression") {
						const methodName = callee.property?.name;
						if (methodName === "getByText") {
							context.report({
								node,
								message: "Text-based locator 'getByText' detected in E2E spec. Project policy requires 100% ID-based locators ('#id', '[id=\"...\"]', '[data-testid=\"...\"]')."
							});
							return;
						}
						if (methodName === "getByRole") {
							if ((node.arguments?.[1])?.properties?.some((p) => p.key?.name === "name")) {
								context.report({
									node,
									message: "Text-based locator 'getByRole' with name detected in E2E spec. Project policy requires 100% ID-based locators ('#id', '[id=\"...\"]', '[data-testid=\"...\"]')."
								});
								return;
							}
						}
						if (methodName === "locator" || methodName === "click" || methodName === "dblclick") {
							const firstArg = node.arguments?.[0];
							if (typeof firstArg?.value === "string") {
								const text = firstArg.value;
								if (text.startsWith(":has-text(") || text.startsWith("text=")) context.report({
									node,
									message: "Text-based locator detected in E2E spec. Project policy requires 100% ID-based locators ('#id', '[id=\"...\"]', '[data-testid=\"...\"]')."
								});
							}
						}
					}
				} };
			}
		},
		"no-playwright-force-click": {
			meta: {
				type: "problem",
				docs: { description: "Forbids force click in Playwright simulations" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.type === "MemberExpression") {
						const method = callee.property?.name;
						if (method === "click" || method === "dblclick") {
							const args = node.arguments ?? [];
							for (const arg of args) if ((arg?.properties)?.some((p) => p.key?.name === "force" && p.value?.value === true)) {
								context.report({
									node,
									message: "Force click ({ force: true }) detected in E2E simulation. Interactivity checks must pass naturally."
								});
								break;
							}
						}
					}
				} };
			}
		},
		"no-test-timeout-inflation": {
			meta: {
				type: "problem",
				docs: { description: "Forbids inflating test timeouts to mask slowness" }
			},
			create(context) {
				return {
					CallExpression(node) {
						const callee = node.callee;
						const args = node.arguments ?? [];
						if (callee?.type === "MemberExpression" && callee.property?.name === "setTimeout") {
							const firstArg = args[0];
							if (typeof firstArg?.value === "number" && firstArg.value >= 3e4) {
								context.report({
									node,
									message: `Test timeout inflation detected (${firstArg.value}ms). Extending test timeouts to mask slowness or contention is strictly forbidden.`
								});
								return;
							}
						}
						if ((callee?.type === "Identifier" && (callee.name === "it" || callee.name === "test") || callee?.type === "MemberExpression" && (callee.property?.name === "it" || callee.property?.name === "test")) && args.length >= 3) {
							const lastArg = args[args.length - 1];
							if (typeof lastArg?.value === "number" && lastArg.value >= 3e4) context.report({
								node,
								message: `Test timeout inflation detected (${lastArg.value}ms). Extending test timeouts to mask slowness or contention is strictly forbidden.`
							});
						}
					},
					Property(node) {
						const fname = getRuleContextFilename(context);
						if (fname && (fname.endsWith("vite.config.ts") || fname.endsWith("vitest.config.ts") || fname.endsWith("playwright.config.ts"))) return;
						const key = node.key;
						const value = node.value;
						if ((key?.name === "testTimeout" || key?.name === "timeout") && typeof value?.value === "number" && value.value >= 3e4) context.report({
							node,
							message: `Test timeout inflation detected (${value.value}ms). Extending test timeouts to mask slowness or contention is strictly forbidden.`
						});
					}
				};
			}
		},
		"no-playwright-polling-waits": {
			meta: {
				type: "problem",
				docs: { description: "Forbids page.waitForTimeout() in simulations" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.type === "MemberExpression" && callee.property?.name === "waitForTimeout") context.report({
						node,
						message: "Artificial sleep 'page.waitForTimeout()' detected. Simulations must synchronize via reactive events or locator assertions."
					});
				} };
			}
		},
		"script-setup-required": {
			meta: {
				type: "problem",
				docs: { description: "Requires Vue 3 SFCs to use Composition API with script setup" }
			},
			create(context) {
				return { ExportDefaultDeclaration(node) {
					const filename = context.filename || (context.getFilename ? context.getFilename() : "");
					if (filename && !filename.endsWith(".vue")) return;
					if (node.declaration?.type === "ObjectExpression") context.report({
						node,
						message: "Options API detected. Vue 3 SFCs must strictly standardize on Composition API via <script setup>."
					});
				} };
			}
		},
		"vue-template-quote-escaping": {
			meta: {
				type: "problem",
				docs: { description: "Forbids escaped quotes inside Vue template attribute bindings" }
			},
			create(context) {
				return { Program(node) {
					const filename = context.filename || (context.getFilename ? context.getFilename() : "");
					if (filename && !filename.endsWith(".vue")) return;
					const source = context.getSourceCode ? context.getSourceCode().getText() : "";
					if (/(?:\s:|\bv-bind:)[\w-]+="[^"\n]*\\"[^"\n]*"/.test(source)) context.report({
						node,
						message: "Escaped quotes detected inside Vue template bindings. Clean and simplify template attributes."
					});
				} };
			}
		},
		"no-data-provider-in-template": {
			meta: {
				type: "problem",
				docs: { description: "Forbids calling data providers directly inside Vue template expressions" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.type === "MemberExpression") {
						const objName = callee.object?.name;
						if (typeof objName === "string" && (objName === "dataProvider" || objName.endsWith("DataProvider"))) context.report({
							node,
							message: `Heavy data provider invocation '${objName}' detected in template. Compute or resolve data in <script setup>.`
						});
					}
				} };
			}
		},
		"no-raw-html-injection": {
			meta: {
				type: "problem",
				docs: { description: "Forbids HTML injection via v-html or innerHTML" }
			},
			create(context) {
				return {
					AssignmentExpression(node) {
						const left = node.left;
						if (left?.type === "MemberExpression") {
							const prop = left.property?.name;
							if (prop === "innerHTML" || prop === "outerHTML") context.report({
								node,
								message: `Direct HTML injection via '${prop}' detected. Use safe text interpolation or sanitized DOM builders to prevent XSS.`
							});
						}
					},
					JSXAttribute(node) {
						const name = node.name?.name;
						if (name === "v-html" || name === "dangerouslySetInnerHTML") context.report({
							node,
							message: `Direct HTML injection via '${name}' detected. Use safe text interpolation to prevent XSS.`
						});
					}
				};
			}
		},
		"no-insecure-random": {
			meta: {
				type: "problem",
				docs: { description: "Forbids Math.random() for sensitive tokens, IDs or cryptography" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.type === "MemberExpression" && callee.object?.name === "Math" && callee.property?.name === "random") {
						const fullSource = context.getSourceCode ? context.getSourceCode().getText() : "";
						if (/token|secret|password|nonce|salt|auth/i.test(fullSource)) context.report({
							node,
							message: "Math.random() is cryptographically insecure for tokens/secrets. Use crypto.randomUUID() or crypto.getRandomValues()."
						});
					}
				} };
			}
		},
		"no-permissive-cors": {
			meta: {
				type: "problem",
				docs: { description: "Forbids wildcard '*' in Access-Control-Allow-Origin" }
			},
			create(context) {
				return { Property(node) {
					const key = node.key;
					const value = node.value;
					if ((key?.name ?? (typeof key?.value === "string" ? key.value : "")) === "Access-Control-Allow-Origin" && value?.value === "*") context.report({
						node,
						message: "Permissive CORS origin '*' detected. Explicitly declare allowed origins."
					});
				} };
			}
		},
		"no-unvalidated-redirect": {
			meta: {
				type: "problem",
				docs: { description: "Forbids open redirects with unvalidated parameters" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.type === "MemberExpression" && callee.property?.name === "redirect") {
						const args = node.arguments ?? [];
						if (args.length > 0) {
							const arg = args[args.length - 1];
							if (arg?.type === "MemberExpression" && (arg.property?.name === "url" || arg.property?.name === "query")) context.report({
								node,
								message: "Unvalidated open redirect detected. Validate destination URL against an allowlist before redirecting."
							});
						}
					}
				} };
			}
		},
		"valibot-schema-type-parity": {
			meta: {
				type: "problem",
				docs: { description: "Enforces domain type purity and non-redundant nullability in Valibot schemas" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.type === "MemberExpression" && callee.object?.name === "v") {
						const method = callee.property?.name;
						if (method === "unknown") {
							context.report({
								node,
								message: "Loose 'v.unknown()' schema detected. Schemas must define strict typed domain boundaries (/domain-type-first)."
							});
							return;
						}
						if (method === "optional") {
							const args = node.arguments ?? [];
							if (args.length > 0) {
								const inner = args[0];
								if (inner?.type === "CallExpression" && inner.callee?.object?.name === "v" && inner.callee?.property?.name === "nullable") context.report({
									node,
									message: "Redundant 'v.optional(v.nullable(...))' schema nesting detected. Use either nullable or optional directly."
								});
							}
						}
					}
				} };
			}
		},
		"no-redundant-constant-alias": {
			meta: {
				type: "problem",
				docs: { description: "Forbids redundant 1:1 constant aliases (const A = B)" }
			},
			create(context) {
				return { VariableDeclarator(node) {
					if (node.id?.type === "Identifier" && node.init?.type === "Identifier" && typeof node.id.name === "string" && typeof node.init.name === "string" && node.id.name !== node.init.name) {
						const idName = node.id.name;
						const initName = node.init.name;
						if (/^[A-Z0-9_]+$/.test(idName) && /^[A-Z0-9_]+$/.test(initName)) context.report({
							node,
							message: `Redundant 1:1 constant alias 'const ${idName} = ${initName}' detected. Use '${initName}' directly at call sites.`
						});
					}
				} };
			}
		},
		"no-literal-suffix-constant": {
			meta: {
				type: "problem",
				docs: { description: "Forbids raw literal numeric values embedded in constant name suffixes" }
			},
			create(context) {
				return { VariableDeclarator(node) {
					if (node.id?.type === "Identifier" && typeof node.id.name === "string") {
						const name = node.id.name;
						if (/_[0-9]+$/.test(name) && !/^(?:HTTP|PORT|STATUS|CODE)_[0-9]+$/i.test(name) && !/^[A-Z]_[0-9]+$/.test(name)) context.report({
							node,
							message: `Constant '${name}' includes raw literal value suffix. Name constants semantically without value-embedding suffixes.`
						});
					}
				} };
			}
		},
		"unsafe-path-concat": {
			meta: {
				type: "problem",
				docs: { description: "Forbids assembling filesystem paths via string concatenation ('+', template literals)" }
			},
			create(context) {
				const fname = getRuleContextFilename(context);
				if (fname && isInternalAuditorSource(fname)) return {};
				return {
					TemplateLiteral(node) {
						const quasis = node.quasis ?? [];
						const firstRaw = quasis[0]?.value?.raw ?? "";
						if (/^(?:https?:|git\+|data:|ftp:|file:\/\/)/i.test(firstRaw)) return;
						const fullRaw = quasis.map((q) => q.value?.raw ?? "").join("");
						if (fullRaw.includes(" ") && (fullRaw.includes(". ") || fullRaw.includes(": ") || fullRaw.includes("? ") || fullRaw.split(" ").length > 3)) return;
						if (!quasis.some((q) => typeof q.value?.raw === "string" && (q.value.raw.includes("/") || q.value.raw.includes("\\\\"))) || (node.expressions?.length ?? 0) === 0) return;
						const hasPathExpr = (node.expressions ?? []).some((expr) => {
							const exprName = expr?.name ?? "";
							return /path|dir|folder|file|root|base|dest|cwd|src|target/i.test(exprName);
						});
						const hasPathQuasiPrefix = quasis.some((q) => {
							const raw = q.value?.raw ?? "";
							return /^\.{1,2}[/\\]|^[a-zA-Z]:[/\\]|^\/[a-zA-Z0-9_.-]+[/\\]/.test(raw);
						});
						if (hasPathExpr || hasPathQuasiPrefix) context.report({
							node,
							message: "Unsafe path concatenation via template literal. Use 'path.join()' or 'path.resolve()' from 'node:path' passing each segment as a separate argument."
						});
					},
					BinaryExpression(node) {
						if (node.operator === "+") {
							const left = node.left;
							const right = node.right;
							const isPathStr = (val) => typeof val === "string" && (val === "/" || val === "\\" || val.includes("/") || val.includes("\\"));
							const isPathName = (name) => typeof name === "string" && /path|dir|folder|file|root|base/i.test(name);
							if (isPathStr(left?.value) && (isPathName(right?.name) || right?.type === "CallExpression") || isPathStr(right?.value) && (isPathName(left?.name) || left?.type === "CallExpression")) context.report({
								node,
								message: "Unsafe path concatenation via '+' operator. Use 'path.join()' or 'path.resolve()' from 'node:path'."
							});
						}
					}
				};
			}
		},
		"unsanitized-env-argv-path": {
			meta: {
				type: "problem",
				docs: { description: "Forbids passing unsanitized process.argv or process.env directly to filesystem sinks" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (!(callee?.type === "MemberExpression" && (callee.object?.name === "fs" || callee.object?.type === "MemberExpression" && callee.object.object?.name === "fs"))) return;
					const isProcessArgvOrEnv = (target) => {
						if (target?.type !== "MemberExpression") return false;
						const obj = target.object;
						if (obj?.type === "MemberExpression" && obj.object?.name === "process") {
							const prop = obj.property?.name;
							return prop === "argv" || prop === "env";
						}
						if (obj?.name === "process") {
							const prop = target.property?.name;
							return prop === "argv" || prop === "env";
						}
						return false;
					};
					const args = node.arguments ?? [];
					for (const arg of args) if (isProcessArgvOrEnv(arg)) {
						context.report({
							node,
							message: "Unsanitized process.argv or process.env passed directly to fs sink. Validate containment before passing to filesystem operations."
						});
						break;
					}
				} };
			}
		},
		"untrusted-url-fetch": {
			meta: {
				type: "problem",
				docs: { description: "Requires URL origin/protocol validation before passing dynamic targets to fetch()" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.name === "fetch" || callee?.type === "MemberExpression" && (callee.object?.name === "window" || callee.object?.name === "globalThis") && callee.property?.name === "fetch") {
						const firstArg = node.arguments?.[0];
						if (firstArg && (firstArg.type === "Identifier" || firstArg.type === "MemberExpression")) {
							const source = context.getSourceCode ? context.getSourceCode().getText() : "";
							if (!source.includes("new URL(") && !source.includes("isValidUrl") && !source.includes("assertSafeUrl")) context.report({
								node,
								message: "Untrusted URL passed to fetch() without origin or protocol validation. Construct and validate with new URL()."
							});
						}
					}
				} };
			}
		},
		"hardcoded-slash-path": {
			meta: {
				type: "problem",
				docs: { description: "Forbids hardcoding '\\' or '/' in string split() operations on path variables" }
			},
			create(context) {
				const fname = getRuleContextFilename(context);
				if (fname && isInternalAuditorSource(fname)) return {};
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.type === "MemberExpression" && callee.property?.name === "split") {
						const getObjName = (target) => {
							if (!target) return "";
							if (target.type === "Identifier") return target.name ?? "";
							if (target.type === "MemberExpression") return target.property?.name ?? "";
							return "";
						};
						const objName = getObjName(callee.object);
						if (objName && !/path|file|dir|folder|root/i.test(objName)) return;
						const arg = node.arguments?.[0];
						if (arg?.type === "Literal" && typeof arg.value === "string" && (arg.value === "\\" || arg.value === "\\\\" || arg.value === "/")) context.report({
							node,
							message: "Hardcoded path separator in split(). Use 'node:path' utilities (path.basename, path.dirname, path.sep) instead."
						});
					}
				} };
			}
		},
		"no-hardcoded-secrets": {
			meta: {
				type: "problem",
				docs: { description: "Detects hardcoded secrets, API tokens, cryptographic private keys, and database passwords" }
			},
			create(context) {
				return { Literal(node) {
					if (typeof node.value === "string" && node.value.length >= 8) {
						const str = node.value;
						if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/.test(str)) context.report({
							node,
							message: "Hardcoded private cryptographic key detected. Store keys in a secure secret manager or vault."
						});
						else if (/\bAKIA[0-9A-Z]{16}\b/.test(str)) context.report({
							node,
							message: "Hardcoded AWS Access Key ID detected. Use IAM roles or environment variables."
						});
						else if (/\b(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82})\b/.test(str)) context.report({
							node,
							message: "Hardcoded GitHub personal access token detected. Use environment variables or secret manager."
						});
						else if (/\bBearer\s+[A-Za-z0-9\-_]{20,}\.[A-Za-z0-9\-_]{20,}\b/.test(str) || /\beyJ[A-Za-z0-9-_]{10,}\.eyJ[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]{10,}\b/.test(str)) context.report({
							node,
							message: "Hardcoded Bearer or JWT token detected. Retrieve tokens dynamically."
						});
						else if (/\b(?:postgres|mysql|mongodb|mongodb\+srv):\/\/[^:]+:[^@]+@/.test(str)) context.report({
							node,
							message: "Database connection URI with hardcoded credentials detected. Use environment variables."
						});
					}
				} };
			}
		},
		"ephemeral-no-source-temp-references": {
			meta: {
				type: "problem",
				docs: { description: "Forbids referencing temporary or scratch paths inside source code trees" }
			},
			create(context) {
				return { Literal(node) {
					if (typeof node.value === "string") {
						if (/(?:^|[/'"`])(?:src|scripts|tests|supabase|data|database)\/(?:temp|tmp|temp_\w+|tmp_\w+)\b/.test(node.value)) context.report({
							node,
							message: "Forbidden reference to ephemeral path inside source code tree. All temporary databases and scratch artifacts must reside strictly inside 'scratch/'."
						});
					}
				} };
			}
		},
		"no-raw-local-storage": {
			meta: {
				type: "problem",
				docs: { description: "Forbids direct access to 'localStorage' without domain repository abstraction" }
			},
			create(context) {
				return { MemberExpression(node) {
					if (node.object?.name === "localStorage") {
						const prop = node.property?.name;
						if (prop === "getItem" || prop === "setItem" || prop === "removeItem" || prop === "clear") context.report({
							node,
							message: "Direct access to 'localStorage' detected. Abstract storage persistence behind a domain repository or adapter."
						});
					}
				} };
			}
		},
		"no-raw-session-storage": {
			meta: {
				type: "problem",
				docs: { description: "Forbids direct access to 'sessionStorage' without domain repository abstraction" }
			},
			create(context) {
				return { MemberExpression(node) {
					if (node.object?.name === "sessionStorage") {
						const prop = node.property?.name;
						if (prop === "getItem" || prop === "setItem" || prop === "removeItem" || prop === "clear") context.report({
							node,
							message: "Direct access to 'sessionStorage' detected. Abstract storage persistence behind a domain repository or adapter."
						});
					}
				} };
			}
		},
		"no-direct-process-argv": {
			meta: {
				type: "problem",
				docs: { description: "Forbids direct process.argv, Deno.args, or Bun.argv access outside canonical Citty harness" }
			},
			create(context) {
				const fname = getRuleContextFilename(context);
				if (fname && (fname.includes("/cli/") || fname.includes("/core/cli/") || fname.includes("cittyHarness") || fname.includes("cliUtils") || fname.includes("setup_env") || fname.includes("check_environment") || fname.includes("/tests/"))) return {};
				return { MemberExpression(node) {
					const isProcessArgv = node.object?.name === "process" && node.property?.name === "argv";
					const isDenoArgs = node.object?.name === "Deno" && node.property?.name === "args";
					const isBunArgv = node.object?.name === "Bun" && node.property?.name === "argv";
					if (isProcessArgv || isDenoArgs || isBunArgv) context.report({
						node,
						message: "Direct command-line argument access detected. Standardize CLI execution on declarative 'citty' contracts (cittyHarness.ts)."
					});
				} };
			}
		},
		"no-banned-cli-parsers": {
			meta: {
				type: "problem",
				docs: { description: "Forbids unauthorized third-party CLI parsers in favor of citty" }
			},
			create(context) {
				return { ImportDeclaration(node) {
					const specifier = node.source?.value;
					if (typeof specifier === "string" && (/* @__PURE__ */ new Set([
						"yargs",
						"commander",
						"minimist",
						"cac",
						"arg",
						"mri"
					])).has(specifier)) context.report({
						node,
						message: `Unauthorized CLI parser library '${specifier}'. Use 'citty' exclusively for CLI commands.`
					});
				} };
			}
		},
		"no-homebrew-flag-parsing": {
			meta: {
				type: "problem",
				docs: { description: "Forbids manual startsWith('--') or includes('--') flag parsing heuristics" }
			},
			create(context) {
				const fname = getRuleContextFilename(context);
				if (fname && (fname.includes("/cli/") || fname.includes("/core/") || fname.includes("/analyzers/") || fname.includes("cittyHarness") || fname.includes("cliUtils") || fname.includes("/tests/"))) return {};
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.type === "MemberExpression") {
						const prop = callee.property?.name;
						if (prop === "startsWith" || prop === "includes") {
							const objName = callee.object?.name;
							if (objName && !/arg|flag|param|opt|token|cli/i.test(objName)) return;
							const arg = node.arguments?.[0];
							if (typeof arg?.value === "string" && arg.value.startsWith("--")) context.report({
								node,
								message: `Homebrew CLI flag parsing detected (${prop}('${arg.value}')). Define CLI parameters declaratively with 'citty'.`
							});
						}
					}
				} };
			}
		},
		"no-cli-eval-bypass": {
			meta: {
				type: "problem",
				docs: { description: "Forbids eval, new Function or fd 0 reading for CLI execution bypass" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.name === "eval") context.report({
						node,
						message: "Dynamic CLI eval bypass detected. Commands must execute declaratively through Citty."
					});
					else if (callee?.type === "MemberExpression" && callee.object?.name === "fs" && callee.property?.name === "readFileSync") {
						if ((node.arguments?.[0])?.value === 0) context.report({
							node,
							message: "Direct fd 0 stdin reading detected. Use Citty CLI options or structured stdin readers."
						});
					}
				} };
			}
		},
		"no-await-in-loops-query": {
			meta: {
				type: "problem",
				docs: { description: "Detects asynchronous database queries inside loops (N+1 query pattern)" }
			},
			create(context) {
				return { AwaitExpression(node) {
					let parent = node.parent;
					let inLoop = false;
					while (parent) {
						const t = parent.type;
						if (t === "ForStatement" || t === "ForOfStatement" || t === "ForInStatement" || t === "WhileStatement" || t === "DoWhileStatement") {
							inLoop = true;
							break;
						}
						parent = parent.parent;
					}
					if (inLoop) {
						const arg = node.argument;
						if (arg?.type === "CallExpression") {
							const callee = arg.callee;
							const calleeName = callee?.type === "MemberExpression" ? callee.property?.name ?? "" : callee?.name ?? "";
							const objName = callee?.type === "MemberExpression" ? callee.object?.name ?? "" : "";
							if (/db|supabase|prisma|repository/i.test(objName) || /query|findFirst|findMany|findById|select/i.test(calleeName)) context.report({
								node,
								message: "Asynchronous database query inside loop (N+1 query pattern). Extract IDs and batch queries outside the loop."
							});
						}
					}
				} };
			}
		},
		"no-select-star-in-queries": {
			meta: {
				type: "problem",
				docs: { description: "Forbids .select('*') in database/ORM queries" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.type === "MemberExpression" && callee.property?.name === "select") {
						const firstArg = node.arguments?.[0];
						if (firstArg?.type === "Literal" && firstArg.value === "*") context.report({
							node,
							message: "Use of .select('*') in database query. Project specific required columns to avoid unnecessary network and memory payload."
						});
					}
				} };
			}
		},
		"require-paginated-queries": {
			meta: {
				type: "problem",
				docs: { description: "Requires pagination, limits, or unique row constraints on collection queries" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.type === "MemberExpression" && callee.property?.name === "from") {
						if (node.parent?.property?.name === "select") {
							const source = context.getSourceCode ? context.getSourceCode().getText() : "";
							if (!/\.(?:limit|range|single|maybeSingle|head|csv)\b/.test(source)) context.report({
								node,
								message: "Database collection query without pagination or limit (.limit(), .range(), or .single()). Add limit to prevent unbounded memory growth."
							});
						}
					}
				} };
			}
		},
		"no-direct-database-instantiation": {
			meta: {
				type: "problem",
				docs: { description: "Forbids direct database client instantiation outside repositories or factories" }
			},
			create(context) {
				return { NewExpression(node) {
					const name = node.callee?.name;
					if (typeof name === "string" && (/* @__PURE__ */ new Set([
						"Client",
						"Pool",
						"SupabaseClient",
						"PrismaClient"
					])).has(name)) context.report({
						node,
						message: `Direct database client instantiation '${name}' detected. Abstract database connections inside repositories or singleton adapters.`
					});
				} };
			}
		},
		"require-storage-try-catch": {
			meta: {
				type: "problem",
				docs: { description: "Requires storage.setItem to be wrapped in try/catch for QuotaExceededError safety" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.type === "MemberExpression" && (callee.object?.name === "localStorage" || callee.object?.name === "sessionStorage") && callee.property?.name === "setItem") {
						let cur = node.parent;
						let inTry = false;
						while (cur) {
							if (cur.type === "TryStatement") {
								inTry = true;
								break;
							}
							cur = cur.parent;
						}
						if (!inTry) context.report({
							node,
							message: "Storage setItem call outside try/catch block. Wrap storage writes to handle QuotaExceededError."
						});
					}
				} };
			}
		},
		"no-gsap-layout-properties": {
			meta: {
				type: "problem",
				docs: { description: "Prohibits layout property animations in GSAP" }
			},
			create(context) {
				return { CallExpression(node) {
					if (isGsapCall(node)) {
						const args = node.arguments ?? [];
						const varsObj = args[args.length - 1];
						if (varsObj?.type === "ObjectExpression" && varsObj.properties) {
							const LAYOUT = /* @__PURE__ */ new Set([
								"top",
								"left",
								"right",
								"bottom",
								"width",
								"height",
								"margin",
								"padding"
							]);
							for (const prop of varsObj.properties) {
								const key = getNodePropKeyName(prop);
								if (LAYOUT.has(key)) {
									context.report({
										node,
										message: `Animating layout property '${key}' in GSAP. Use GPU-accelerated transforms (x, y, scale, rotation) instead.`
									});
									break;
								}
							}
						}
					}
				} };
			}
		},
		"gsap-named-timer-constants": {
			meta: {
				type: "problem",
				docs: { description: "Enforces semantic constants with '_SEC' suffix for GSAP duration" }
			},
			create(context) {
				return { CallExpression(node) {
					if (isGsapCall(node, ["to", "from"])) {
						const durArg = node.arguments?.[1];
						if (durArg?.type === "Literal" && typeof durArg.value === "number" && durArg.value > 0) context.report({
							node,
							message: `Raw numeric duration '${durArg.value}' in GSAP animation. Extract to a semantic constant with '_SEC' suffix.`
						});
					}
				} };
			}
		},
		"no-gsap-banned-ui-timers": {
			meta: {
				type: "problem",
				docs: { description: "Prohibits setTimeout/setInterval in GSAP-animated components" }
			},
			create(context) {
				return { CallExpression(node) {
					const name = node.callee?.name;
					if (name === "setTimeout" || name === "setInterval") {
						const source = context.getSourceCode ? context.getSourceCode().getText() : "";
						if (source.includes("from 'gsap'") || source.includes("gsap.")) context.report({
							node,
							message: `Banned UI timer (${name}) in animated component. Use GSAP timelines or gsap.delayedCall for deterministic timing.`
						});
					}
				} };
			}
		},
		"require-gsap-cleanup-on-unmount": {
			meta: {
				type: "problem",
				docs: { description: "Enforces GSAP context revert or kill on component unmount" }
			},
			create(context) {
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.type === "MemberExpression" && callee.object?.name === "gsap" && callee.property?.name === "context") {
						const source = context.getSourceCode ? context.getSourceCode().getText() : "";
						if (!source.includes(".revert(") && !source.includes("onUnmounted")) context.report({
							node,
							message: "GSAP context created without revert() in lifecycle unmount. Clean up animations on unmount to prevent leaks."
						});
					}
				} };
			}
		},
		"no-unscoped-component-selectors": {
			meta: {
				type: "problem",
				docs: { description: "Prohibits unscoped global CSS selectors in component GSAP tweens" }
			},
			create(context) {
				return { CallExpression(node) {
					if (isGsapCall(node)) {
						const target = node.arguments?.[0];
						if (target?.type === "Literal" && typeof target.value === "string" && target.value.startsWith(".")) {
							const source = context.getSourceCode ? context.getSourceCode().getText() : "";
							if (source.includes("<template") && !source.includes("ref(")) context.report({
								node,
								message: `Unscoped string selector '${target.value}' in component animation. Target template refs or scoped elements directly.`
							});
						}
					}
				} };
			}
		},
		"no-nested-scrolltrigger": {
			meta: {
				type: "problem",
				docs: { description: "Prohibits nested scrollTrigger in child tweens of timelines" }
			},
			create(context) {
				return { Property(node) {
					const key = node.key;
					if ((key?.name ?? (typeof key?.value === "string" ? key.value : "")) === "scrollTrigger") {
						let cur = node.parent;
						let inTlChild = false;
						while (cur) {
							if (cur.type === "CallExpression") {
								if (cur.callee?.object?.name === "tl") {
									inTlChild = true;
									break;
								}
							}
							cur = cur.parent;
						}
						if (inTlChild) context.report({
							node,
							message: "Nested scrollTrigger in timeline child tween detected. Define scrollTrigger on the parent timeline, not individual tweens."
						});
					}
				} };
			}
		},
		"no-scrolltrigger-markers-production": {
			meta: {
				type: "problem",
				docs: { description: "Prohibits 'markers: true' on ScrollTrigger in production code" }
			},
			create(context) {
				return { Property(node) {
					const keyName = getNodePropKeyName(node);
					const val = node.value;
					if (keyName === "markers" && val?.value === true) context.report({
						node,
						message: "ScrollTrigger 'markers: true' detected in production code. Remove markers before shipping."
					});
				} };
			}
		},
		"no-file-level-suppressions": {
			meta: {
				type: "problem",
				docs: { description: "Prohibits file-level suppression headers (eslint-disable, fallow-ignore, @ts-nocheck)" }
			},
			create(context) {
				const fname = getRuleContextFilename(context);
				if (fname && (fname.includes("/tests/") || fname.includes("scratch/"))) return {};
				return { Program(node) {
					const headerSlice = (context.getSourceCode ? context.getSourceCode().getText() : "").slice(0, 1e3);
					if (/\/\*\s*eslint-disable\s*\*\/|\/\/\s*fallow-ignore-file|\/\/\s*@ts-nocheck/.test(headerSlice)) context.report({
						node,
						message: "File-level suppression header detected. Standalone whole-file ignore directives are strictly prohibited."
					});
				} };
			}
		},
		"auditor-class-inheritance": {
			meta: {
				type: "problem",
				docs: { description: "Enforces BaseAuditor or FileScanAuditor inheritance on all Auditor classes" }
			},
			create(context) {
				const fname = getRuleContextFilename(context);
				if (fname && (!fname.includes("/suites/") || fname.includes("auditorBase.ts") || fname.includes("canonicalIgnoreRegistry.ts") || fname.includes("/tests/"))) return {};
				return { ClassDeclaration(node) {
					const className = node.id?.name;
					if (typeof className === "string" && className.endsWith("Auditor")) {
						const superClass = node.superClass?.name;
						if (superClass !== "BaseAuditor" && superClass !== "FileScanAuditor") context.report({
							node,
							message: `Auditor class '${className}' must inherit from BaseAuditor or FileScanAuditor.`
						});
					}
				} };
			}
		},
		"no-homebrew-file-walker": {
			meta: {
				type: "problem",
				docs: { description: "Prohibits manual recursive fs.readdirSync traversals in auditor suites" }
			},
			create(context) {
				const fname = getRuleContextFilename(context);
				if (fname && (!fname.includes("/suites/") || fname.includes("/tests/"))) return {};
				return { CallExpression(node) {
					const callee = node.callee;
					if (callee?.type === "MemberExpression" && callee.object?.name === "fs" && callee.property?.name === "readdirSync") {
						const args = node.arguments ?? [];
						const firstArg = args[0];
						const argName = firstArg?.name ?? (typeof firstArg?.value === "string" ? firstArg.value : "");
						if (/dist|build/i.test(argName)) return;
						const secondArg = args[1];
						let isRecursive = false;
						if (secondArg?.type === "ObjectExpression") isRecursive = (secondArg.properties ?? []).some((prop) => {
							const keyName = getNodePropKeyName(prop);
							const val = prop.value?.value;
							return keyName === "recursive" && val === true;
						});
						if (isRecursive) context.report({
							node,
							message: "Homebrew recursive fs.readdirSync traversal in auditor suite. Leverage collectRepositoryFiles() from auditorBase."
						});
					}
				} };
			}
		},
		"auditor-rule-description-limit": {
			meta: {
				type: "problem",
				docs: { description: "Enforces maximum length of 60 chars on auditor rule descriptions" }
			},
			create(context) {
				const fname = getRuleContextFilename(context);
				if (fname && !fname.includes("/suites/")) return {};
				return { Property(node) {
					const keyName = getNodePropKeyName(node);
					const val = node.value;
					if (keyName === "description" && val?.type === "Literal" && typeof val.value === "string") {
						const parentKey = getNodePropKeyName(node.parent ?? {});
						if (parentKey === "docs" || parentKey === "meta") return;
						if (val.value.length > 60) context.report({
							node,
							message: `Rule description exceeds 60 characters ('${val.value.slice(0, 30)}...'). Provide concise single-line descriptions.`
						});
					}
				} };
			}
		}
	}
};
for (const rule of Object.values(domainTypeOxlintPlugin.rules)) {
	const originalCreate = rule.create;
	rule.create = function(context) {
		if (isExemptFileFromDomainPlugin(context)) return {};
		return originalCreate(context);
	};
}
export { CANONICAL_INFRA_ID_WHITELIST, COMMON_NON_DOMAIN_SET_NAMES, domainTypeOxlintPlugin as default, domainTypeOxlintPlugin };
