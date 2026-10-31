import { AuditedDocument } from "../../core/auditedDocument.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
import { extractVueScriptOrRaw } from "../../core/vueSfcParser.js";
import { enableCompileCache } from "node:module";
import ts from "typescript";
// src/suites/architecture/validate_vue_reactivity.ts
/**
* packages/auditor/src/suites/architecture/validate_vue_reactivity.ts
*
* VUE REACTIVITY & STATE HYGIENE AUDITOR (Node.js 26+ Native)
*
* Enforces Vue 3 Composition API reactivity rules (vue-best-practices):
*   1. No Side Effects in Computed (`no-side-effects-in-computed`):
*      Prohibits in-place mutations (.sort, .splice, .push, .pop, .reverse) and
*      ref reassignments (.value = ) inside computed() property bodies.
*   2. Watch Reactive Property Getter (`watch-reactive-property-getter`):
*      Enforces getter function wrapper when watching reactive props (e.g. watch(() => props.foo))
*      preventing silent reactivity loss on primitive properties.
*   3. No Async in Computed (`no-async-in-computed`):
*      Prohibits computed(async () => ...); computed cannot unwrap promises.
*   4. No Destructured Reactive (`no-destructured-reactive`):
*      Prohibits destructuring reactive() objects directly without toRefs().
*      (Note: defineProps destructuring is permitted under Vue 3.5+ native compiler transform).
*/
enableCompileCache();
const VUE_REACTIVITY_RULES = [
	"no-side-effects-in-computed",
	"watch-reactive-property-getter",
	"no-async-in-computed",
	"no-destructured-reactive"
];
const ASYNC_COMPUTED_REGEX = /\bcomputed\s*\(\s*(?:<[^>]+>\s*)?async\s*(?:\([^)]*\)|[\w$]+)\s*=>/g;
const WATCH_PROP_NAKED_REGEX = /\bwatch\s*\(\s*(props\.[\w$][\w$.]*)\s*,/g;
const DESTRUCTURED_REACTIVE_REGEX = /const\s+\{[^}]+\}\s*=\s*reactive\s*(?:<[^>]+>\s*)?\(/g;
const DIRECT_REACTIVE_MUTATION_REGEX = /\b(?:(?:props|store)\.(?!value\b)[\w$][\w$.]*|[\w$]+\.value)\s*\??\.(?:sort|reverse|splice|push|pop|shift|unshift)\s*\(/g;
const LOCAL_IDENTIFIER_MUTATION_REGEX = /\b([\w$]+)\s*\??\.(sort|reverse|splice|push|pop|shift|unshift)\s*\(/g;
function getCallNameAndFirstArg(node, ast) {
	if (!ts.isCallExpression(node)) return null;
	let callee = node.expression;
	while (ts.isParenthesizedExpression(callee)) callee = callee.expression;
	if (node.arguments.length === 0) return null;
	let arg0 = node.arguments[0];
	while (ts.isParenthesizedExpression(arg0)) arg0 = arg0.expression;
	return {
		calleeName: callee.getText(ast),
		arg0
	};
}
var ValidateVueReactivityAuditor = class extends FileScanAuditor {
	constructor(options = {}) {
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options, (config) => [
			...config.paths.componentsRoots ?? [],
			...config.paths.viewsRoots ?? [],
			...config.paths.composablesRoots ?? [],
			...config.paths.storesRoots ?? []
		]);
		super({
			ruleFixers: {},
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(VUE_REACTIVITY_RULES, {
				speed: "light",
				phase: "normal",
				md: false,
				ast: true,
				changedOnly: false,
				critical: false
			}),
			id: "validate_vue_reactivity",
			name: "Vue Reactivity & State Hygiene Auditor",
			description: "Verifies Vue 3 Composition API reactivity and purity",
			family: "architecture",
			ruleIds: VUE_REACTIVITY_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(VUE_REACTIVITY_RULES, "behavior"),
			packageName: "Vue",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "⚡",
			ruleDescriptions: {
				"no-side-effects-in-computed": "Mutation or side effect in computed",
				"watch-reactive-property-getter": "Watched property without getter in watch",
				"no-async-in-computed": "Async function inside computed",
				"no-destructured-reactive": "Destructuring reactive() without toRefs"
			},
			ruleRemediations: {
				"no-side-effects-in-computed": "1. Root Cause:\nAn in-place mutation (.sort(), .reverse(), .splice(), .push(), .pop()) on an array or a ref reassignment (.value =) was detected inside a \"computed()\" property body.\nComputed properties in Vue 3 must be pure functions without side effects. Mutating reactive state being read inside computed triggers infinite re-render loops and desynchronizes dependent components.\n\n2. Diagnosis:\nLocate the computed property line indicated in the message. If sorting or filtering a list derived from props or refs, the mutation mutates the original source.\n\n3. Canonical Solution:\n1. Create a shallow clone before sorting or mutating: \"[...array].sort(...)\" or \"array.slice().reverse()\".\n2. Move mutations and ref assignments outside computed, executing them in \"watchEffect\" or event handlers/actions.\n\n4. Example / Auto-fix command:\n// ❌ Incorrect: in-place sort mutates the original prop or state\nconst sortedUsers = computed(() => props.users.sort((a, b) => a.name.localeCompare(b.name)));\n\n// ✅ Correct: clone first via spread operator\nconst sortedUsers = computed(() => [...props.users].sort((a, b) => a.name.localeCompare(b.name)));",
				"watch-reactive-property-getter": "1. Root Cause:\nAn individual reactive property is passed directly as the source argument in \"watch(props.propName, ...)\" instead of being wrapped in a getter function.\nIn JavaScript and Vue 3, accessing a primitive property (string, number, boolean) passes the scalar value by copy at that instant. Vue cannot track future changes of a primitive unless passed as a getter function.\n\n2. Diagnosis:\nInspect the first argument of \"watch()\". If it accesses a property on \"props.\" or a nested property on a reactive object, it must be wrapped in a getter function.\n\n3. Canonical Solution:\nWrap the property access in an anonymous getter function: \"watch(() => props.propName, (newVal) => { ... })\".\n\n4. Example / Auto-fix command:\n// ❌ Incorrect: reactivity lost silently on primitive values\nwatch(props.userId, (newId) => { fetchUser(newId); });\n\n// ✅ Correct: reactive function getter\nwatch(() => props.userId, (newId) => { fetchUser(newId); });",
				"no-async-in-computed": "1. Root Cause:\nAn async function was passed to \"computed(async () => ...)\".\nVue 3's reactivity system does not unwrap promises returned by computed getters. The computed value will be an unresolved \"Promise<T>\" object, breaking template rendering.\n\n2. Diagnosis:\nSearch for \"computed(async () =>\" in the component or composable.\n\n3. Canonical Solution:\n1. Use \"computedAsync\" from \"@vueuse/core\" when deriving reactive state from an asynchronous promise.\n2. Alternatively, use a \"shallowRef\" for resolved data and load the promise inside a \"watchEffect\" managing loading and error states.\n\n4. Example / Auto-fix command:\n// ❌ Incorrect: computed returns Promise<UserData>\nconst user = computed(async () => await api.getUser(id.value));\n\n// ✅ Correct: computedAsync from VueUse\nimport { computedAsync } from \"@vueuse/core\";\nconst user = computedAsync(async () => await api.getUser(id.value), null);",
				"no-destructured-reactive": "1. Root Cause:\nAn object created with \"reactive()\" was destructured directly: \"const { foo, bar } = reactive(...)\".\nDestructuring a Vue 3 reactive object extracts primitive values by copy, permanently disconnecting them from the reactive proxy.\n\n2. Diagnosis:\nLook for destructuring assignments from a \"reactive()\" call.\n\n3. Canonical Solution:\n1. Wrap the object with \"toRefs()\" before destructuring: \"const { foo, bar } = toRefs(state)\".\n2. Or keep the reactive object intact and access members with dot notation: \"state.foo\".\n\n4. Example / Auto-fix command:\n// ❌ Incorrect: foo and bar lose reactivity\nconst state = reactive({ foo: 1, bar: \"test\" });\nconst { foo, bar } = state;\n\n// ✅ Correct: toRefs preserves reactivity as Ref<T>\nimport { reactive, toRefs } from \"vue\";\nconst state = reactive({ foo: 1, bar: \"test\" });\nconst { foo, bar } = toRefs(state);"
			},
			roots: targetRoots,
			allowedExtensions: /* @__PURE__ */ new Set([
				".vue",
				".ts",
				".js"
			]),
			projectRoot: effectiveRoot
		});
	}
	scanFile(relPath, content) {
		const doc = new AuditedDocument(relPath, content, relPath);
		const ast = doc.getAst();
		if (ast) {
			this.scanAst(doc, ast, relPath, content);
			return;
		}
		const scriptContent = extractVueScriptOrRaw(relPath, content);
		if (!scriptContent) return;
		this.scanRegexMatches(scriptContent, ASYNC_COMPUTED_REGEX, relPath, "no-async-in-computed", "Asynchronous callback passed to computed(). computed cannot unwrap promises; use watchEffect or computedAsync from VueUse.", void 0, content);
		this.scanRegexMatches(scriptContent, WATCH_PROP_NAKED_REGEX, relPath, "watch-reactive-property-getter", "Watching reactive property directly as value instead of a getter. Use watch(() => props.prop, ...) to preserve reactivity.", void 0, content);
		this.scanRegexMatches(scriptContent, DESTRUCTURED_REACTIVE_REGEX, relPath, "no-destructured-reactive", "Destructuring reactive() object directly causes reactivity loss. Wrap with toRefs() before destructuring.", void 0, content);
		this.runSubAuditorSync("no-side-effects-in-computed", () => {
			this.auditComputedSideEffects(relPath, content, scriptContent);
		});
	}
	checkAsyncInComputed(node, ast, doc, relPath) {
		const callInfo = getCallNameAndFirstArg(node, ast);
		if (!callInfo || callInfo.calleeName !== "computed") return;
		const { arg0 } = callInfo;
		if (!ts.isArrowFunction(arg0) && !ts.isFunctionExpression(arg0)) return;
		if (!(arg0.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) return;
		const { line } = doc.getNodeLineAndColumn(node, ast);
		this.addViolation({
			ruleId: "no-async-in-computed",
			severity: "error",
			file: relPath,
			line,
			message: "Asynchronous callback passed to computed(). computed cannot unwrap promises; use watchEffect or computedAsync from VueUse.",
			context: node.getText(ast).slice(0, 100).replace(/\n/g, "↵")
		});
	}
	checkWatchPropertyGetter(node, ast, doc, relPath) {
		const callInfo = getCallNameAndFirstArg(node, ast);
		if (!callInfo || callInfo.calleeName !== "watch") return;
		const { arg0 } = callInfo;
		if (!ts.isPropertyAccessExpression(arg0)) return;
		let root = arg0;
		while (ts.isPropertyAccessExpression(root)) root = root.expression;
		if (!ts.isIdentifier(root) || root.text !== "props") return;
		const { line } = doc.getNodeLineAndColumn(node, ast);
		this.addViolation({
			ruleId: "watch-reactive-property-getter",
			severity: "error",
			file: relPath,
			line,
			message: "Watching reactive property directly as value instead of a getter. Use watch(() => props.prop, ...) to preserve reactivity.",
			context: node.getText(ast).slice(0, 100).replace(/\n/g, "↵")
		});
	}
	checkDestructuredReactive(node, ast, doc, relPath) {
		if (!ts.isVariableDeclaration(node)) return;
		if (!ts.isObjectBindingPattern(node.name)) return;
		if (!node.initializer || !ts.isCallExpression(node.initializer)) return;
		let initCallee = node.initializer.expression;
		while (ts.isParenthesizedExpression(initCallee)) initCallee = initCallee.expression;
		if (initCallee.getText(ast) !== "reactive") return;
		const { line } = doc.getNodeLineAndColumn(node, ast);
		this.addViolation({
			ruleId: "no-destructured-reactive",
			severity: "error",
			file: relPath,
			line,
			message: "Destructuring reactive() object directly causes reactivity loss. Wrap with toRefs() before destructuring.",
			context: node.getText(ast).slice(0, 100).replace(/\n/g, "↵")
		});
	}
	scanAst(doc, ast, relPath, fullContent) {
		this.runSubAuditorSync("no-async-in-computed", () => {
			const visit = (node) => {
				this.checkAsyncInComputed(node, ast, doc, relPath);
				ts.forEachChild(node, visit);
			};
			visit(ast);
		});
		this.runSubAuditorSync("watch-reactive-property-getter", () => {
			const visit = (node) => {
				this.checkWatchPropertyGetter(node, ast, doc, relPath);
				ts.forEachChild(node, visit);
			};
			visit(ast);
		});
		this.runSubAuditorSync("no-destructured-reactive", () => {
			const visit = (node) => {
				this.checkDestructuredReactive(node, ast, doc, relPath);
				ts.forEachChild(node, visit);
			};
			visit(ast);
		});
		const scriptContent = extractVueScriptOrRaw(relPath, fullContent) ?? fullContent;
		this.runSubAuditorSync("no-side-effects-in-computed", () => {
			this.auditComputedSideEffects(relPath, fullContent, scriptContent);
		});
	}
	reportComputedViolation(relPath, fullContent, startIdx, needle, message) {
		const line = this.getLineNumber(fullContent, fullContent.indexOf(needle, startIdx));
		const lineContent = this.getLineAt(fullContent, line);
		this.addViolation({
			ruleId: "no-side-effects-in-computed",
			severity: "error",
			file: relPath,
			line,
			message,
			context: lineContent.trim()
		});
	}
	auditDirectMutations(body, relPath, fullContent, startIdx) {
		const dirRegex = new RegExp(DIRECT_REACTIVE_MUTATION_REGEX.source, DIRECT_REACTIVE_MUTATION_REGEX.flags);
		let dirMatch;
		while ((dirMatch = dirRegex.exec(body)) !== null) this.reportComputedViolation(relPath, fullContent, startIdx, dirMatch[0], `In-place mutation '${dirMatch[0].trim()}' detected inside computed(). Mutating reactive state, props, or stores creates side effects.`);
	}
	evalLocalIdentifierMutation(targetVar, method, fullMatched, body) {
		const declMatch = new RegExp(`\\b(?:const|let|var)\\s+${targetVar}\\b([^;\\n]*)`).exec(body);
		if (!declMatch) return `In-place mutation '${fullMatched.trim()}' on external variable '${targetVar}' detected inside computed(). Create a shallow copy first.`;
		const initExpr = declMatch[1] ?? "";
		if (initExpr.includes("[...") || initExpr.includes(".slice(") || initExpr.includes(".filter(") || initExpr.includes(".map(") || initExpr.includes("Array.from(") || initExpr.includes("new Array") || initExpr.includes("[]") || body.includes(`${targetVar} = [...`) || body.includes(`${targetVar} = ${targetVar}.filter`) || !initExpr.includes("props.") && !initExpr.includes(".value") && !initExpr.includes("store.")) return null;
		if (method === "sort" || method === "reverse") return `In-place mutation '${fullMatched.trim()}' on aliased reactive state detected inside computed(). Create a shallow copy first (e.g. [...${targetVar}].${method}()).`;
		if ((/* @__PURE__ */ new Set([
			"push",
			"pop",
			"shift",
			"unshift",
			"splice"
		])).has(method)) return `In-place mutation '${fullMatched.trim()}' on aliased reactive state detected inside computed(). Create a shallow copy first.`;
		return null;
	}
	auditLocalIdentifierMutations(body, relPath, fullContent, startIdx) {
		const locRegex = new RegExp(LOCAL_IDENTIFIER_MUTATION_REGEX.source, LOCAL_IDENTIFIER_MUTATION_REGEX.flags);
		let locMatch;
		while ((locMatch = locRegex.exec(body)) !== null) {
			const fullMatched = locMatch[0];
			const targetVar = locMatch[1];
			const method = locMatch[2];
			if (!targetVar || !method) continue;
			if (locMatch.index > 0 && body[locMatch.index - 1] === ".") continue;
			if ((/* @__PURE__ */ new Set([
				"props",
				"store",
				"value"
			])).has(targetVar)) continue;
			const violationMessage = this.evalLocalIdentifierMutation(targetVar, method, fullMatched, body);
			if (violationMessage) this.reportComputedViolation(relPath, fullContent, startIdx, fullMatched, violationMessage);
		}
	}
	auditRefAssignments(body, relPath, fullContent, startIdx) {
		const refAssignRegex = /\b[\w$]+\.value\s*=(?!=)/g;
		let refMatch;
		while ((refMatch = refAssignRegex.exec(body)) !== null) this.reportComputedViolation(relPath, fullContent, startIdx, refMatch[0], `Mutation '${refMatch[0]}' detected inside computed(). Computed properties must be pure derivations without side effects.`);
	}
	auditComputedSideEffects(relPath, fullContent, script) {
		const computedCallRegex = /\bcomputed\s*\(\s*(?:<[^>]+>\s*)?(?:\([^)]*\)|[\w$]+)\s*=>\s*\{/g;
		let compMatch;
		while ((compMatch = computedCallRegex.exec(script)) !== null) {
			const startIdx = compMatch.index + compMatch[0].length;
			const body = this.extractBalancedBlock(script, startIdx);
			if (!body) continue;
			this.auditDirectMutations(body, relPath, fullContent, startIdx);
			this.auditLocalIdentifierMutations(body, relPath, fullContent, startIdx);
			this.auditRefAssignments(body, relPath, fullContent, startIdx);
		}
	}
	extractBalancedBlock(text, startIndex) {
		let depth = 1;
		let i = startIndex;
		while (i < text.length && depth > 0) {
			const ch = text[i];
			if (ch === "{") depth++;
			else if (ch === "}") depth--;
			i++;
		}
		if (depth === 0) return text.slice(startIndex, i - 1);
		return null;
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateVueReactivityAuditor());
export { VUE_REACTIVITY_RULES, ValidateVueReactivityAuditor };
