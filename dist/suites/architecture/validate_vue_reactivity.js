import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { AuditedDocument } from "../../core/auditedDocument.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities } from "../../core/auditorBase.js";
import { extractVueScriptOrRaw } from "../../core/vueSfcParser.js";
import { enableCompileCache } from "node:module";
import ts from "typescript";
//#region src/suites/architecture/validate_vue_reactivity.ts
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
*
* Escape Hatch:
*   // reactivity-ok: <reason>, // sfc-ok: <reason>
*/
enableCompileCache();
const VUE_REACTIVITY_RULES = [
	"no-side-effects-in-computed",
	"watch-reactive-property-getter",
	"no-async-in-computed",
	"no-destructured-reactive"
];
const ASYNC_COMPUTED_REGEX = /\bcomputed\s*\(\s*(?:<[^>]+>\s*)?async\s*(?:\([^)]*\)|[\w$]+)\s*=>/g;
const WATCH_PROP_NAKED_REGEX = /\bwatch\s*\(\s*(props\.[\w$]+(?:\.[\w$]+)*)\s*,/g;
const DESTRUCTURED_REACTIVE_REGEX = /const\s+\{[^}]+\}\s*=\s*reactive\s*(?:<[^>]+>\s*)?\(/g;
const DIRECT_REACTIVE_MUTATION_REGEX = /\b(?:(?:props|store)\.(?!value\b)[\w$]+(?:\.[\w$]+)*|[\w$]+\.value)\s*\??\.(?:sort|reverse|splice|push|pop|shift|unshift)\s*\(/g;
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
	constructor(roots, projectRoot) {
		const config = getAuditConfig(projectRoot);
		const effectiveRoots = roots ?? [
			...config.paths.componentsRoots ?? [],
			...config.paths.viewsRoots ?? [],
			...config.paths.composablesRoots ?? [],
			...config.paths.storesRoots ?? []
		];
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createRuleCapabilities(VUE_REACTIVITY_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: true,
				changedOnly: false,
				critical: false
			}),
			id: "validate_vue_reactivity",
			name: "Vue Reactivity & State Hygiene Auditor",
			description: "Verifica reactividad y pureza de Vue 3 Composition API",
			family: "architecture",
			ruleIds: VUE_REACTIVITY_RULES,
			packageName: "Vue",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "⚡",
			ruleDescriptions: {
				"no-side-effects-in-computed": "Mutación o efecto secundario en computed",
				"watch-reactive-property-getter": "Propiedad observada sin getter en watch",
				"no-async-in-computed": "Función asíncrona dentro de computed",
				"no-destructured-reactive": "Desestructuración de reactive() sin toRefs"
			},
			ruleRemediations: {
				"no-side-effects-in-computed": "Guía de diagnóstico y remediación para no-side-effects-in-computed. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"watch-reactive-property-getter": "Guía de diagnóstico y remediación para watch-reactive-property-getter. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"no-async-in-computed": "Guía de diagnóstico y remediación para no-async-in-computed. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"no-destructured-reactive": "Guía de diagnóstico y remediación para no-destructured-reactive. Revisa la incidencia detectada y ajusta el código correspondiente."
			},
			roots: effectiveRoots,
			allowedExtensions: /* @__PURE__ */ new Set([
				".vue",
				".ts",
				".js"
			]),
			projectRoot
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
		this.scanRegexMatches(scriptContent, ASYNC_COMPUTED_REGEX, relPath, "no-async-in-computed", ["reactivity-ok", "sfc-ok"], "Asynchronous callback passed to computed(). computed cannot unwrap promises; use watchEffect or computedAsync from VueUse.", void 0, content);
		this.scanRegexMatches(scriptContent, WATCH_PROP_NAKED_REGEX, relPath, "watch-reactive-property-getter", ["reactivity-ok", "sfc-ok"], "Watching reactive property directly as value instead of a getter. Use watch(() => props.prop, ...) to preserve reactivity.", void 0, content);
		this.scanRegexMatches(scriptContent, DESTRUCTURED_REACTIVE_REGEX, relPath, "no-destructured-reactive", ["reactivity-ok", "sfc-ok"], "Destructuring reactive() object directly causes reactivity loss. Wrap with toRefs() before destructuring.", void 0, content);
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
		if (doc.hasEscapeHatchForNode(node, "no-async-in-computed", ast)) return;
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
		if (doc.hasEscapeHatchForNode(node, "watch-reactive-property-getter", ast)) return;
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
		if (doc.hasEscapeHatchForNode(node, "no-destructured-reactive", ast)) return;
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
		if (this.hasEscapeHatch(lineContent, ["reactivity-ok", "sfc-ok"])) return;
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
		if (method === "push" || method === "pop" || method === "shift" || method === "unshift" || method === "splice") return `In-place mutation '${fullMatched.trim()}' on aliased reactive state detected inside computed(). Create a shallow copy first.`;
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
			if (targetVar === "props" || targetVar === "store" || targetVar === "value") continue;
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
//#endregion
export { VUE_REACTIVITY_RULES, ValidateVueReactivityAuditor };
