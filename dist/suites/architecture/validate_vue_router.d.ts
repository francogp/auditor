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
import { FileScanAuditor } from '../../core/auditorBase.ts';
export type VueRouterRuleId = 'no-deprecated-router-next' | 'no-define-async-component-in-router' | 'no-window-location-navigation';
export declare const VUE_ROUTER_RULES: readonly VueRouterRuleId[];
export declare class ValidateVueRouterAuditor extends FileScanAuditor<VueRouterRuleId> {
    constructor(roots?: readonly string[], projectRoot?: string);
    protected scanFile(relPath: string, content: string): void;
}
//# sourceMappingURL=validate_vue_router.d.ts.map