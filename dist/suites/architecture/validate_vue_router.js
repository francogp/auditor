import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
import { extractVueScriptOrRaw } from "../../core/vueSfcParser.js";
import { enableCompileCache } from "node:module";
//#region src/suites/architecture/validate_vue_router.ts
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
const DEPRECATED_NEXT_GUARD_REGEX = /\b(?:beforeEach|beforeResolve)\s*\((?:async\s+)?\(\s*\w+\s*,\s*\w+\s*,\s*next\s*\)/g;
const DEFINE_ASYNC_IN_ROUTER_REGEX = /\bcomponent:\s*defineAsyncComponent\s*\(/g;
const WINDOW_LOCATION_NAV_REGEX = /\bwindow\.location\.(?:href|assign)\s*=\s*['"](?!\/\/|https?:\/\/)([^'"]+)['"]/g;
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
				ast: false,
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
	scanFile(relPath, content) {
		const scriptContent = extractVueScriptOrRaw(relPath, content);
		if (!scriptContent) return;
		this.scanRegexMatches(scriptContent, DEPRECATED_NEXT_GUARD_REGEX, relPath, "no-deprecated-router-next", `Deprecated 'next' argument in router navigation guard. Vue Router 4 mandates returning a boolean or route location object instead.`, void 0, content);
		this.scanRegexMatches(scriptContent, DEFINE_ASYNC_IN_ROUTER_REGEX, relPath, "no-define-async-component-in-router", `defineAsyncComponent used in router route definition. Use canonical dynamic import 'component: () => import(...)' instead.`, void 0, content);
		this.scanRegexMatches(scriptContent, WINDOW_LOCATION_NAV_REGEX, relPath, "no-window-location-navigation", `Direct SPA navigation with 'window.location'. Use useRouter().push(...) to preserve application state.`, void 0, content);
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateVueRouterAuditor());
//#endregion
export { VUE_ROUTER_RULES, ValidateVueRouterAuditor };
