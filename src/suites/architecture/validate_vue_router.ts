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

import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { extractVueScriptOrRaw } from '../../core/vueSfcParser.ts';

enableCompileCache();

export type VueRouterRuleId =
  | 'no-deprecated-router-next'
  | 'no-define-async-component-in-router'
  | 'no-window-location-navigation';

export const VUE_ROUTER_RULES: readonly VueRouterRuleId[] = [
  'no-deprecated-router-next',
  'no-define-async-component-in-router',
  'no-window-location-navigation'
] as const;

// Detects beforeEach/beforeResolve with 3 arguments including 'next'
const DEPRECATED_NEXT_GUARD_REGEX = /\b(?:beforeEach|beforeResolve)\s*\((?:async\s+)?\(\s*\w+\s*,\s*\w+\s*,\s*next\s*\)/g;

// Detects defineAsyncComponent inside route definitions
const DEFINE_ASYNC_IN_ROUTER_REGEX = /\bcomponent:\s*defineAsyncComponent\s*\(/g;

// Detects internal SPA route assignments to window.location.href or .assign
const WINDOW_LOCATION_NAV_REGEX = /\bwindow\.location\.(?:href|assign)\s*=\s*['"](?!\/\/|https?:\/\/)([^'"]+)['"]/g;

const VUE_ROUTER_EXTENSIONS = new Set(['.vue', '.ts', '.js']);

export class ValidateVueRouterAuditor extends FileScanAuditor<VueRouterRuleId> {
  constructor(roots?: readonly string[], projectRoot?: string) {
    const config = getAuditConfig(projectRoot);
    const effectiveRoots = roots ?? (
      config.paths.componentsRoots || config.paths.viewsRoots
        ? [...(config.paths.componentsRoots ?? []), ...(config.paths.viewsRoots ?? []), 'src/router', 'src/composables']
        : ['src/components', 'src/views', 'src/router', 'src/composables']
    );

    super({
      id: 'validate_vue_router',
      name: 'Vue Router 4 Architecture & Navigation Auditor',
      packageName: 'Router',
      family: 'architecture',
      description: 'Verifica estándares de Vue Router 4 y navegación SPA',
      icon: '🧭',
      capabilities: {
        fix: false,
        fixPriority: false,
        lint: true,
        md: false,
        ast: false,
        changedSince: false,
        heavy: false,
        requiresBuild: false,
        postRun: false
      },
      ruleIds: VUE_ROUTER_RULES,
      ruleDescriptions: {
        'no-deprecated-router-next': 'Uso de next() obsoleto en navigation guard',
        'no-define-async-component-in-router': 'defineAsyncComponent en ruta de router',
        'no-window-location-navigation': 'Navegación con window.location en SPA'
      },
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      roots: effectiveRoots,
      allowedExtensions: VUE_ROUTER_EXTENSIONS,
      projectRoot
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    const scriptContent = extractVueScriptOrRaw(relPath, content);
    if (!scriptContent) return;

    this.scanRegexMatches(
      scriptContent,
      DEPRECATED_NEXT_GUARD_REGEX,
      relPath,
      'no-deprecated-router-next',
      ['router-ok', 'sfc-ok'],
      `Deprecated 'next' argument in router navigation guard. Vue Router 4 mandates returning a boolean or route location object instead.`,
      undefined,
      content
    );

    this.scanRegexMatches(
      scriptContent,
      DEFINE_ASYNC_IN_ROUTER_REGEX,
      relPath,
      'no-define-async-component-in-router',
      ['router-ok', 'sfc-ok'],
      `defineAsyncComponent used in router route definition. Use canonical dynamic import 'component: () => import(...)' instead.`,
      undefined,
      content
    );

    this.scanRegexMatches(
      scriptContent,
      WINDOW_LOCATION_NAV_REGEX,
      relPath,
      'no-window-location-navigation',
      ['router-ok', 'sfc-ok'],
      `Direct SPA navigation with 'window.location'. Use useRouter().push(...) to preserve application state.`,
      undefined,
      content
    );
  }
}

// Standalone execution support
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateVueRouterAuditor());
