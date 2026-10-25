import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import ts from "typescript";
// src/suites/architecture/validate_reactive_leaks.ts
/**
* scripts/auditors/architecture/validate_reactive_leaks.ts
*
* REACTIVE & DOM EVENT LEAK AUDITOR (Node.js 26+ Native)
*
* Enforces strict memory leak prevention and listener hygiene across Vue components and composables:
*   1. Event Listeners: Every window/document/element.addEventListener must either have { once: true },
*      an explicit removeEventListener, or an unmount lifecycle hook (onUnmounted, onBeforeUnmount, onScopeDispose).
*   2. Native Timers: Every setInterval must have a clearInterval.
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_reactive_leaks.ts
*   npm run validate:reactive-leaks
*/
enableCompileCache();
const REACTIVE_LEAK_RULES = ["dom-event-leak", "interval-leak"];
function hasOnceOption(node) {
	if (node.arguments.length < 3) return false;
	const optionsArg = node.arguments[2];
	if (!optionsArg || !ts.isObjectLiteralExpression(optionsArg)) return false;
	for (const prop of optionsArg.properties) if (ts.isPropertyAssignment(prop) && prop.name && ts.isIdentifier(prop.name) && prop.name.text === "once") {
		if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) return true;
	}
	return false;
}
var ReactiveLeaksAuditor = class extends FileScanAuditor {
	constructor(options = {}) {
		const scanRoots = resolveFileScanRoots(options, (cfg) => [
			...cfg.paths.componentsRoots ?? [],
			...cfg.paths.viewsRoots ?? [],
			...cfg.paths.composablesRoots ?? []
		]);
		super({
			id: "validate_reactive_leaks",
			name: "Reactive & DOM Event Leak Auditor",
			description: "Detects potential memory leaks and uncleaned listeners",
			family: "architecture",
			usesThirdPartyTool: false,
			requiredPermissions: [],
			roots: scanRoots.targetRoots,
			projectRoot: scanRoots.effectiveRoot,
			ruleCapabilities: createRuleCapabilities(REACTIVE_LEAK_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: true,
				changedOnly: false,
				critical: false
			}),
			ruleIds: REACTIVE_LEAK_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(REACTIVE_LEAK_RULES, "behavior"),
			packageName: "Leak",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "💧",
			ruleDescriptions: {
				"dom-event-leak": "addEventListener without cleanup",
				"interval-leak": "setInterval without cleanup"
			},
			ruleRemediations: {
				"dom-event-leak": "1. Root Cause:\nAn event listener (\"addEventListener\") was attached to window, document, or a DOM element inside a component or composable without a deregistration mechanism.\nWhen the component unmounts without removing the listener, the callback function remains referenced in memory, capturing the component lexical scope and producing cumulative memory leaks.\n\n2. Diagnosis:\nInspect the \"addEventListener\" call. It lacks the \"{ once: true }\" option, an explicit \"removeEventListener\" invocation, or \"onUnmounted\" / \"onScopeDispose\" lifecycle cleanup.\n\n3. Canonical Solution:\n1. Use \"useEventListener\" from \"@vueuse/core\", which automatically binds and unbinds the listener in sync with the component lifecycle.\n2. If using the native DOM API, store the listener function in a named variable and call \"removeEventListener\" inside \"onUnmounted()\".\n3. If the event must only fire once, pass \"{ once: true }\" as the third argument.\n\n4. Example / Auto-fix command:\n// ❌ Incorrect: orphan listener without cleanup\nwindow.addEventListener(\"resize\", handleResize);\n\n// ✅ Correct (Option A): useEventListener from VueUse\nimport { useEventListener } from \"@vueuse/core\";\nuseEventListener(window, \"resize\", handleResize);\n\n// ✅ Correct (Option B): explicit cleanup in onUnmounted\nonMounted(() => window.addEventListener(\"resize\", handleResize));\nonUnmounted(() => window.removeEventListener(\"resize\", handleResize));",
				"interval-leak": "1. Root Cause:\nA recurring timer (\"setInterval\") was initiated in a component or composable without storing its ID or executing \"clearInterval\".\nThe timer continues running indefinitely in the background even after the component is destroyed, degrading performance and draining battery/CPU.\n\n2. Diagnosis:\nLocate the \"setInterval\" call in the reported file.\n\n3. Canonical Solution:\n1. Use \"useIntervalFn\" from \"@vueuse/core\", which automatically manages start, pause, and teardown with Vue lifecycle hooks.\n2. If using native timers, capture the timer handle and invoke \"clearInterval\" in \"onUnmounted()\".\n\n4. Example / Auto-fix command:\n// ❌ Incorrect: uncancelled setInterval\nsetInterval(() => { refreshData(); }, 5000);\n\n// ✅ Correct: useIntervalFn from VueUse\nimport { useIntervalFn } from \"@vueuse/core\";\nuseIntervalFn(() => { refreshData(); }, 5000);"
			},
			allowedExtensions: /* @__PURE__ */ new Set([".ts", ".vue"])
		});
	}
	checkEventListenerLeak(node, sf, relPath, options) {
		const expr = node.expression;
		if (!ts.isPropertyAccessExpression(expr) || expr.name.text !== "addEventListener") return;
		const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
		if (!hasOnceOption(node) && !options.hasRemoveEventListener && !options.hasUnmountHook) this.addViolation({
			ruleId: "dom-event-leak",
			severity: "error",
			file: relPath,
			line,
			message: "addEventListener without removeEventListener or onUnmounted / onScopeDispose lifecycle cleanup (potential memory leak).",
			context: node.getText(sf)
		});
	}
	checkIntervalLeak(node, sf, relPath, hasClearInterval) {
		const expr = node.expression;
		if (!ts.isIdentifier(expr) || expr.text !== "setInterval") return;
		const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
		if (hasClearInterval) return;
		this.addViolation({
			ruleId: "interval-leak",
			severity: "error",
			file: relPath,
			line,
			message: "setInterval executed without clearInterval in component or composable.",
			context: node.getText(sf)
		});
	}
	scanFile(relPath, content, sourceFile) {
		if (!content.includes("addEventListener") && !content.includes("setInterval")) return;
		const sf = sourceFile ?? this.context.getAst(relPath, content);
		if (!sf.text.trim()) return;
		const hasUnmountHook = content.includes("onUnmounted") || content.includes("onBeforeUnmount") || content.includes("onScopeDispose");
		const hasRemoveEventListener = content.includes("removeEventListener");
		const hasClearInterval = content.includes("clearInterval");
		this.runSubAuditorSync("dom-event-leak", () => {
			const visitEvents = (node) => {
				if (ts.isCallExpression(node)) this.checkEventListenerLeak(node, sf, relPath, {
					hasRemoveEventListener,
					hasUnmountHook
				});
				ts.forEachChild(node, visitEvents);
			};
			visitEvents(sf);
		});
		this.runSubAuditorSync("interval-leak", () => {
			const visitIntervals = (node) => {
				if (ts.isCallExpression(node)) this.checkIntervalLeak(node, sf, relPath, hasClearInterval);
				ts.forEachChild(node, visitIntervals);
			};
			visitIntervals(sf);
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ReactiveLeaksAuditor());
export { REACTIVE_LEAK_RULES, ReactiveLeaksAuditor };
