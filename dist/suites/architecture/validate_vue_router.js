import { AuditedDocument } from "../../core/auditedDocument.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import ts from "typescript";
// src/suites/architecture/validate_vue_router.ts
/**
* packages/auditor/src/suites/architecture/validate_vue_router.ts
*
* VUE ROUTER 4 ARCHITECTURE & NAVIGATION HYGIENE AUDITOR (Node.js 26+ Native)
*
* Enforces Vue Router 4 Composition API best practices (vue-router-best-practices):
*   1. No Deprecated Router Next (`no-deprecated-router-next`):
*      In Vue Router 4, navigation guards must return a boolean or route location object.
*      The third parameter `next` is deprecated and leads to unhandled or duplicate calls.
*   2. No defineAsyncComponent in Router (`no-define-async-component-in-router`):
*      Route components natively support lazy-loading via dynamic imports `() => import(...)`.
*      Wrapping them with `defineAsyncComponent` breaks router transitions and suspense.
*   3. No window.location Navigation in SPA (`no-window-location-navigation`):
*      Prohibits hard navigation like `window.location.href = '/path'` or `window.location.assign('/path')`
*      for internal SPA routing, destroying pinia state. (Exempts reload, replace, origin, and external URLs).
*/
enableCompileCache();
const VUE_ROUTER_RULES = [
	"no-deprecated-router-next",
	"no-define-async-component-in-router",
	"no-window-location-navigation"
];
const VUE_ROUTER_EXTENSIONS = /* @__PURE__ */ new Set([
	".vue",
	".ts",
	".js"
]);
var ValidateVueRouterAuditor = class extends FileScanAuditor {
	constructor(options = {}) {
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options, (config) => config.paths.componentsRoots?.length || config.paths.viewsRoots?.length || config.paths.composablesRoots?.length ? Array.from(/* @__PURE__ */ new Set([
			...config.paths.componentsRoots ?? [],
			...config.paths.viewsRoots ?? [],
			...config.paths.composablesRoots ?? []
		])) : config.paths.srcRoots ?? []);
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			id: "validate_vue_router",
			name: "Vue Router 4 Architecture & Navigation Auditor",
			packageName: "Router",
			family: "architecture",
			description: "Verifies Vue Router 4 standards and SPA navigation",
			icon: "🧭",
			ruleCapabilities: createRuleCapabilities(VUE_ROUTER_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: true,
				changedOnly: false,
				critical: false
			}),
			ruleIds: VUE_ROUTER_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(VUE_ROUTER_RULES, "behavior"),
			ruleDescriptions: {
				"no-deprecated-router-next": "Deprecated next() in router guard",
				"no-define-async-component-in-router": "defineAsyncComponent in router route",
				"no-window-location-navigation": "Navigation using window.location in SPA"
			},
			ruleRemediations: {
				"no-deprecated-router-next": "📖 REMEDIATION GUIDE: no-deprecated-router-next\n1. Root Cause: Deprecated `next` callback was used in a Vue Router navigation guard (`beforeEach((to, from, next) => ...)`). In Vue Router 4, `next` is error-prone and deprecated.\n2. Diagnosis: Locate the guard function in the router and observe the `(to, from, next)` signature.\n3. Canonical Solution: Remove the `next` parameter. Return a boolean (`true` to allow, `false` to cancel) or a route location object (`return { name: \"Login\" }`).\n4. Example / Auto-fix command:\n   ❌ Deprecated: `router.beforeEach((to, from, next) => { if (!auth) next(\"/login\"); else next(); });`\n   ✅ Modern:     `router.beforeEach((to) => { if (!auth) return \"/login\"; return true; });`",
				"no-define-async-component-in-router": "📖 REMEDIATION GUIDE: no-define-async-component-in-router\n1. Root Cause: A route component was wrapped with `defineAsyncComponent()` inside route definitions. Vue Router 4 natively supports dynamic import promises and does not need `defineAsyncComponent` in `routes`.\n2. Diagnosis: Check the `component:` property in the reported route configuration.\n3. Canonical Solution: Use direct dynamic imports: `component: () => import(\"@/views/HomeView.vue\")`.\n4. Example / Auto-fix command:\n   ❌ Redundant: `component: defineAsyncComponent(() => import(\"@/views/HomeView.vue\"))`\n   ✅ Canonical: `component: () => import(\"@/views/HomeView.vue\")`",
				"no-window-location-navigation": "📖 REMEDIATION GUIDE: no-window-location-navigation\n1. Root Cause: `window.location.href = ...` or `window.location.assign(...)` was used for internal SPA navigation. This triggers a full browser reload, discards Pinia/Vue state, and degrades performance.\n2. Diagnosis: Look for assignments to `window.location` at the reported line.\n3. Canonical Solution:\n   a) Use the router instance: `const router = useRouter(); router.push(target);`.\n   b) For external third-party URLs (OAuth/Stripe), ensure the URL contains absolute protocol prefixes (`https://`).\n4. Example / Auto-fix command:\n   ❌ Hard reload: `window.location.href = \"/dashboard\";`\n   ✅ SPA Router:  `router.push({ name: \"Dashboard\" });`"
			},
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			roots: targetRoots,
			allowedExtensions: VUE_ROUTER_EXTENSIONS,
			projectRoot: effectiveRoot
		});
	}
	scanFile(relPath, content, sourceFile, doc) {
		const effectiveDoc = doc ?? new AuditedDocument(relPath, content, relPath);
		const sf = sourceFile ?? effectiveDoc.getAst();
		if (!sf) return;
		this.runSubAuditorSync("no-deprecated-router-next", () => {
			this.scanDeprecatedRouterNext(sf, effectiveDoc, relPath);
		});
		this.runSubAuditorSync("no-define-async-component-in-router", () => {
			this.scanDefineAsyncComponent(sf, effectiveDoc, relPath);
		});
		this.runSubAuditorSync("no-window-location-navigation", () => {
			this.scanWindowLocationNavigation(sf, effectiveDoc, relPath);
		});
	}
	scanDeprecatedRouterNext(sf, doc, relPath) {
		const visit = (node) => {
			if (ts.isCallExpression(node)) {
				const nextParam = extractRouterNextParam(node, sf);
				if (nextParam) {
					const { line, column } = doc.getNodeLineAndColumn(nextParam, sf);
					this.addViolation({
						ruleId: "no-deprecated-router-next",
						filePath: relPath,
						line,
						column,
						message: `Deprecated 'next' argument in router navigation guard. Vue Router 4 mandates returning a boolean or route location object instead.`,
						severity: "error"
					});
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(sf);
	}
	scanDefineAsyncComponent(sf, doc, relPath) {
		const visit = (node) => {
			if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
				if (node.name.text === "component" && ts.isCallExpression(node.initializer)) {
					const callText = node.initializer.expression.getText(sf);
					if (callText === "defineAsyncComponent" || callText.endsWith(".defineAsyncComponent")) {
						const { line, column } = doc.getNodeLineAndColumn(node, sf);
						this.addViolation({
							ruleId: "no-define-async-component-in-router",
							filePath: relPath,
							line,
							column,
							message: `defineAsyncComponent used in router route definition. Use canonical dynamic import 'component: () => import(...)' instead.`,
							severity: "error"
						});
					}
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(sf);
	}
	isSpaInternalUrl(url) {
		return !url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("//");
	}
	scanWindowLocationNavigation(sf, doc, relPath) {
		const reportViolation = (node) => {
			const { line, column } = doc.getNodeLineAndColumn(node, sf);
			this.addViolation({
				ruleId: "no-window-location-navigation",
				filePath: relPath,
				line,
				column,
				message: `Direct SPA navigation with 'window.location'. Use useRouter().push(...) to preserve application state.`,
				severity: "error"
			});
		};
		const visit = (node) => {
			if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
				const leftText = node.left.getText(sf);
				if ((leftText === "window.location.href" || leftText === "location.href") && ts.isStringLiteral(node.right)) {
					if (this.isSpaInternalUrl(node.right.text)) reportViolation(node);
				}
			} else if (ts.isCallExpression(node)) {
				const exprText = node.expression.getText(sf);
				if (exprText === "window.location.assign" || exprText === "location.assign") {
					const firstArg = node.arguments[0];
					if (firstArg && ts.isStringLiteral(firstArg) && this.isSpaInternalUrl(firstArg.text)) reportViolation(node);
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(sf);
	}
};
function extractRouterNextParam(call, sf) {
	const expr = call.expression;
	const methodName = ts.isPropertyAccessExpression(expr) ? expr.name.text : ts.isIdentifier(expr) ? expr.text : "";
	if (methodName !== "beforeEach" && methodName !== "beforeResolve" || call.arguments.length === 0) return null;
	const guardFn = call.arguments[0];
	if (!guardFn || !ts.isArrowFunction(guardFn) && !ts.isFunctionExpression(guardFn)) return null;
	if (guardFn.parameters.length < 3) return null;
	const thirdParam = guardFn.parameters[2];
	return thirdParam && thirdParam.name.getText(sf) === "next" ? thirdParam : null;
}
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateVueRouterAuditor());
export { VUE_ROUTER_RULES, ValidateVueRouterAuditor };
