import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
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
*
* Escape Hatch:
*   // router-ok: <reason>, // sfc-ok: <reason>
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
	constructor(roots, projectRoot) {
		const config = getAuditConfig(projectRoot);
		const effectiveRoots = roots ?? (config.paths.componentsRoots?.length || config.paths.viewsRoots?.length || config.paths.composablesRoots?.length ? Array.from(/* @__PURE__ */ new Set([
			...config.paths.componentsRoots ?? [],
			...config.paths.viewsRoots ?? [],
			...config.paths.composablesRoots ?? []
		])) : config.paths.srcRoots ?? []);
		super({
			usesThirdPartyTool: false,
			id: "validate_vue_router",
			name: "Vue Router 4 Architecture & Navigation Auditor",
			packageName: "Router",
			family: "architecture",
			description: "Verifica estándares de Vue Router 4 y navegación SPA",
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
				"no-deprecated-router-next": "Uso de next() obsoleto en navigation guard",
				"no-define-async-component-in-router": "defineAsyncComponent en ruta de router",
				"no-window-location-navigation": "Navegación con window.location en SPA"
			},
			ruleRemediations: {
				"no-deprecated-router-next": "📖 GUÍA DE REMEDIACIÓN: no-deprecated-router-next\n1. Causa Raíz: Se utilizó el parámetro obsoleto `next` en un navigation guard de Vue Router (`beforeEach((to, from, next) => ...)`). En Vue Router 4, `next` es propenso a errores de invocación múltiple y ha sido deprecado.\n2. Diagnóstico: Ubica la función guard en el router y observa la firma `(to, from, next)`.\n3. Solución Canónica: Elimina el parámetro `next`. Devuelve directamente un booleano (`true` para permitir, `false` para cancelar) o una ruta de redirección (`return { name: \"Login\" }`).\n4. Ejemplo:\n   ❌ Obsoleto: `router.beforeEach((to, from, next) => { if (!auth) next(\"/login\"); else next(); });`\n   ✅ Moderno:  `router.beforeEach((to) => { if (!auth) return \"/login\"; return true; });`",
				"no-define-async-component-in-router": "📖 GUÍA DE REMEDIACIÓN: no-define-async-component-in-router\n1. Causa Raíz: Se envolvió un componente con `defineAsyncComponent()` dentro de la definición de rutas del router. Vue Router 4 soporta nativamente promesas de importación dinámica y no requiere `defineAsyncComponent` en `routes`.\n2. Diagnóstico: Revisa la propiedad `component:` en la configuración de la ruta reportada.\n3. Solución Canónica: Utiliza la función de importación dinámica directa: `component: () => import(\"@/views/HomeView.vue\")`.\n4. Ejemplo:\n   ❌ Redundante: `component: defineAsyncComponent(() => import(\"@/views/HomeView.vue\"))`\n   ✅ Canónico:   `component: () => import(\"@/views/HomeView.vue\")`",
				"no-window-location-navigation": "📖 GUÍA DE REMEDIACIÓN: no-window-location-navigation\n1. Causa Raíz: Se utilizó `window.location.href = ...` o `window.location.assign(...)` para navegar entre vistas internas de la SPA. Esto provoca una recarga completa del navegador (Hard Reload), destruye el estado de Pinia/memoria y anula las ventajas de una Single Page Application.\n2. Diagnóstico: Busca la asignación a `window.location` en la línea reportada.\n3. Solución Canónica:\n   a) Utiliza la instancia del router: `const router = useRouter(); router.push(target);`.\n   b) Si la navegación es intencionalmente hacia una URL externa o proveedor de autenticación de terceros (OAuth/Stripe), anota `// router-ok: <justificación>`.\n4. Ejemplo:\n   ❌ Hard reload: `window.location.href = \"/dashboard\";`\n   ✅ SPA Router:  `router.push({ name: \"Dashboard\" });`"
			},
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			roots: effectiveRoots,
			allowedExtensions: VUE_ROUTER_EXTENSIONS,
			projectRoot
		});
	}
	scanFile(relPath, content) {
		const scriptContent = extractVueScriptOrRaw(relPath, content);
		if (!scriptContent) return;
		this.scanRegexMatches(scriptContent, DEPRECATED_NEXT_GUARD_REGEX, relPath, "no-deprecated-router-next", ["router-ok", "sfc-ok"], `Deprecated 'next' argument in router navigation guard. Vue Router 4 mandates returning a boolean or route location object instead.`, void 0, content);
		this.scanRegexMatches(scriptContent, DEFINE_ASYNC_IN_ROUTER_REGEX, relPath, "no-define-async-component-in-router", ["router-ok", "sfc-ok"], `defineAsyncComponent used in router route definition. Use canonical dynamic import 'component: () => import(...)' instead.`, void 0, content);
		this.scanRegexMatches(scriptContent, WINDOW_LOCATION_NAV_REGEX, relPath, "no-window-location-navigation", ["router-ok", "sfc-ok"], `Direct SPA navigation with 'window.location'. Use useRouter().push(...) to preserve application state.`, void 0, content);
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateVueRouterAuditor());
//#endregion
export { VUE_ROUTER_RULES, ValidateVueRouterAuditor };
