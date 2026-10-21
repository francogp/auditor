/**
 * src/suites/architecture/validate_gsap_framework_hygiene.ts
 *
 * GSAP FRAMEWORK HYGIENE & COMPONENT LIFECYCLE AUDITOR (Node.js 26+ Native)
 *
 * Enforces best practices for GSAP in UI frameworks (Vue SFC, React, Svelte):
 *   1. `gsap-unscoped-component-selectors`: Prohibits unscoped global selectors in UI components.
 *   2. `gsap-missing-context-revert`: Enforces ctx.revert() or kill() on component unmount.
 *   3. `gsap-missing-plugin-registration`: Enforces gsap.registerPlugin(...) for imported GSAP plugins.
 *   4. `gsap-banned-devtools-production`: Prohibits GSDevTools or MotionPathHelper without dev guard.
 *
 * Escape Hatches:
 *   `// scope-ok: <reason>`, `// revert-ok: <reason>`, `// plugin-ok: <reason>`, `// devtools-ok: <reason>`
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_gsap_framework_hygiene.ts
 */

import { enableCompileCache } from 'node:module';
import { BaseAuditor,
  createUniformRemediationPhases, FileScanAuditor, createRuleCapabilities,
  resolveFileScanRoots, type FileScanRootsOptions } from '../../core/auditorBase.ts';
import {
  getAuditConfig,
  isInCodeRoots,
  isExemptFile,
  matchesAnyRoot
} from '../../core/auditConfig.ts';
import { normalizePosixPath as normalizeFilePath } from '../../core/safePath.ts';
import { scanBalancedParens } from '../../core/scannerUtils.ts';

enableCompileCache();

export type GsapFrameworkHygieneRuleId =
  | 'gsap-unscoped-component-selectors'
  | 'gsap-missing-context-revert'
  | 'gsap-missing-plugin-registration'
  | 'gsap-banned-devtools-production';

export const GSAP_FRAMEWORK_HYGIENE_RULES: readonly GsapFrameworkHygieneRuleId[] = [
  'gsap-unscoped-component-selectors',
  'gsap-missing-context-revert',
  'gsap-missing-plugin-registration',
  'gsap-banned-devtools-production'
] as const;

export const DEVTOOLS_GUARD_WINDOW_PRE_CHARS = 150;
export const DEVTOOLS_GUARD_WINDOW_POST_CHARS = 200;

interface GsapScopeRange {
  readonly start: number;
  readonly end: number;
}

export function findGsapScopeRanges(content: string): readonly GsapScopeRange[] {
  const ranges: GsapScopeRange[] = [];
  const scopeRegex = /\b(?:gsap\.context|useGSAP|\w*ctx\.add)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = scopeRegex.exec(content)) !== null) {
    const openParenIndex = match.index + match[0].length - 1;
    const result = scanBalancedParens(content, openParenIndex + 1);
    if (result.depth === 0) {
      ranges.push({ start: match.index, end: result.end });
    }
  }
  return ranges;
}

function isInsideAnyScopeRange(index: number, ranges: readonly GsapScopeRange[]): boolean {
  return ranges.some((r) => index >= r.start && index < r.end);
}

export class ValidateGsapFrameworkHygieneAuditor extends FileScanAuditor<GsapFrameworkHygieneRuleId> {
  constructor(options: FileScanRootsOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(options);

    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      projectRoot: effectiveRoot,
      roots: targetRoots,
      id: 'validate_gsap_framework_hygiene',
      name: 'GSAP Framework Hygiene',
      description: 'Governance of UI lifecycle, scope, and GSAP plugins',
      family: 'architecture',
      packageName: 'GSAP',
      icon: '🎭',
      configKey: 'animation',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      ruleCapabilities: createRuleCapabilities(GSAP_FRAMEWORK_HYGIENE_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      allowedExtensions: new Set(['.ts', '.vue', '.tsx', '.jsx']),
      ruleIds: GSAP_FRAMEWORK_HYGIENE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(GSAP_FRAMEWORK_HYGIENE_RULES, 'behavior'),
      ruleDescriptions: {
        'gsap-unscoped-component-selectors': 'Unscoped global selector in UI',
        'gsap-missing-context-revert': 'Missing revert or cleanup on unmount',
        'gsap-missing-plugin-registration': 'Unregistered GSAP plugin used',
        'gsap-banned-devtools-production': 'Devtools enabled in production'
      },
      ruleRemediations: {
        'gsap-unscoped-component-selectors':
          '1. Root Cause:\n' +
          'Global CSS string selectors (e.g. ".card", "#btn") are used directly inside a UI component (Vue SFC, React, Svelte).\n' +
          'This queries elements across the entire global document, accidentally animating other component instances or foreign DOM elements on the page.\n\n' +
          '2. Diagnosis:\n' +
          'Identify string selectors passed to gsap.to/from/fromTo. Inside UI components, selectors must be strictly scoped to the component subtree.\n\n' +
          '3. Canonical Solution:\n' +
          '1. Wrap animations inside "gsap.context((self) => { ... }, rootElementRef.value)". All selectors inside the context are automatically scoped to rootElementRef.\n' +
          '2. Alternatively, pass direct DOM element references (template ref or ref.value) instead of strings.\n\n' +
          '4. Example / Auto-fix command:\n' +
          '// ❌ Incorrect: unscoped global selector in UI component\n' +
          'gsap.to(".card", { opacity: 1 });\n\n' +
          '// ✅ Correct: scoped with gsap.context and template ref\n' +
          'const root = ref<HTMLElement | null>(null);\n' +
          'let ctx: gsap.Context;\n' +
          'onMounted(() => {\n' +
          '  ctx = gsap.context(() => {\n' +
          '    gsap.to(".card", { opacity: 1 }); // searches only within root\n' +
          '  }, root.value);\n' +
          '});',
        'gsap-missing-context-revert':
          '1. Root Cause:\n' +
          'The component initializes animations with "gsap.context()" but does not call "ctx.revert()" on unmount (onUnmounted in Vue, useEffect cleanup in React).\n' +
          'This causes memory leaks, orphan tweens, and visual artifacts when the user navigates away and back to the component.\n\n' +
          '2. Diagnosis:\n' +
          'Inspect the component lifecycle hook where the GSAP context is created.\n\n' +
          '3. Canonical Solution:\n' +
          'Store the gsap.context instance in a component-scoped variable and call "ctx.revert()" in the "onUnmounted" (or "onScopeDispose") hook.\n\n' +
          '4. Example / Auto-fix command:\n' +
          '// ❌ Incorrect: context created without revert on unmount\n' +
          'onMounted(() => {\n' +
          '  gsap.context(() => { gsap.to(el.value, { x: 100 }); });\n' +
          '});\n\n' +
          '// ✅ Correct: canonical revert on unmount\n' +
          'let ctx: gsap.Context;\n' +
          'onMounted(() => {\n' +
          '  ctx = gsap.context(() => { gsap.to(el.value, { x: 100 }); });\n' +
          '});\n' +
          'onUnmounted(() => {\n' +
          '  ctx?.revert();\n' +
          '});',
        'gsap-missing-plugin-registration':
          '1. Root Cause:\n' +
          'A GSAP plugin (ScrollTrigger, Flip, Draggable, SplitText, etc.) is imported but "gsap.registerPlugin(PluginName)" is never called.\n' +
          'Without explicit registration, modern bundlers like Vite / Rollup may tree-shake the plugin in production or fail to initialize internal GSAP core hooks.\n\n' +
          '2. Diagnosis:\n' +
          'Check file imports. When importing ScrollTrigger from "gsap/ScrollTrigger", it must be registered before use.\n\n' +
          '3. Canonical Solution:\n' +
          'Invoke "gsap.registerPlugin(ScrollTrigger)" immediately below the import statements.\n\n' +
          '4. Example / Auto-fix command:\n' +
          '// ❌ Incorrect: import and direct use\n' +
          'import { ScrollTrigger } from "gsap/ScrollTrigger";\n' +
          'gsap.to(".box", { scrollTrigger: ".box" });\n\n' +
          '// ✅ Correct: explicit plugin registration\n' +
          'import { gsap } from "gsap";\n' +
          'import { ScrollTrigger } from "gsap/ScrollTrigger";\n' +
          'gsap.registerPlugin(ScrollTrigger);',
        'gsap-banned-devtools-production':
          '1. Root Cause:\n' +
          'GSAP visual debugging tools (GSDevTools or MotionPathHelper) were detected without a development environment guard.\n' +
          'These tools increase bundle size and expose visual debugging overlays in production environments.\n\n' +
          '2. Diagnosis:\n' +
          'Locate calls to "GSDevTools.create()" or "MotionPathHelper.create()".\n\n' +
          '3. Canonical Solution:\n' +
          'Wrap the call in an "if (import.meta.env.DEV)" guard or remove the tool once animation tuning is complete.\n\n' +
          '4. Example / Auto-fix command:\n' +
          '// ❌ Incorrect: GSDevTools exposed unconditionally\n' +
          'GSDevTools.create();\n\n' +
          '// ✅ Correct: protected under development guard\n' +
          'if (import.meta.env.DEV) {\n' +
          '  GSDevTools.create();\n' +
          '}'
      }
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    const norm = normalizeFilePath(relPath);
    if (!this.isCodeFile(norm) || isExemptFile(relPath)) return;

    this.runSubAuditorSync('gsap-unscoped-component-selectors', () => {
      if (this.isUiComponent(norm) && isInCodeRoots(relPath)) {
        this.scanUnscopedSelectors(relPath, content);
      }
    });
    this.runSubAuditorSync('gsap-missing-context-revert', () => {
      if (this.isUiComponent(norm) && isInCodeRoots(relPath)) {
        this.scanContextRevert(relPath, content);
      }
    });

    this.runSubAuditorSync('gsap-missing-plugin-registration', () => {
      this.scanPluginRegistration(relPath, content);
    });
    this.runSubAuditorSync('gsap-banned-devtools-production', () => {
      this.scanDevtoolsProduction(relPath, content);
    });
  }

  private isCodeFile(norm: string): boolean {
    return (
      norm.endsWith('.ts') ||
      norm.endsWith('.vue') ||
      norm.endsWith('.tsx') ||
      norm.endsWith('.jsx')
    );
  }

  private isUiComponent(norm: string): boolean {
    const config = getAuditConfig(this.projectRoot);
    const uiRoots = [...(config.paths.componentsRoots ?? []), ...(config.paths.viewsRoots ?? [])];
    return norm.endsWith('.vue') || matchesAnyRoot(norm, uiRoots);
  }

  private scanUnscopedSelectors(relPath: string, content: string): void {
    const scopeRanges = findGsapScopeRanges(content);
    const unscopedRegex =
      /\b(?:gsap|timeline|\w*Timeline|tl)\s*\.\s*(?:to|from|fromTo)\s*\(\s*['"]([.#][\w\s>+~.:#-]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = unscopedRegex.exec(content)) !== null) {
      const selector = m[1];
      const preceding = content.slice(Math.max(0, m.index - 200), m.index);
      const lineEnd = content.indexOf('\n', m.index);
      const currentLine = content.slice(m.index, lineEnd === -1 ? undefined : lineEnd);
      const nearby = preceding + '\n' + currentLine;
      if (/\/\/\s*(?:scope-ok|selector-ok):\s*\S+/i.test(nearby)) continue;

      const isScoped = isInsideAnyScopeRange(m.index, scopeRanges);
      if (!isScoped) {
        this.addViolationAtMatch({
          ruleId: 'gsap-unscoped-component-selectors',
          filePath: relPath,
          content,
          matchIndex: m.index,
          message: `Global selector '${selector}' in UI component without scoped context. Use 'gsap.context(..., rootRef.value)' or 'useGSAP()' to prevent leaks.`,
          severity: 'error'
        });
      }
    }
  }

  private scanContextRevert(relPath: string, content: string): void {
    if (!/gsap\.context\s*\(/.test(content)) return;

    const hasRevert = /\.revert\s*\(|\.kill\s*\(/.test(content);
    const hasUnmountLifecycle = /onUnmounted|onScopeDispose|useEffect/.test(content);
    const hasRevertOk = /\/\/\s*revert-ok:\s*\S+/i.test(content);

    if ((!hasRevert || !hasUnmountLifecycle) && !hasRevertOk) {
      this.addViolationAtMatch({
        ruleId: 'gsap-missing-context-revert',
        filePath: relPath,
        content,
        matchIndex: content.indexOf('gsap.context'),
        message:
          "Usage of 'gsap.context()' in UI component without calling 'revert()' in 'onUnmounted' / 'onScopeDispose'.",
        severity: 'error'
      });
    }
  }

  private scanPluginRegistration(relPath: string, content: string): void {
    const pluginImportRegex =
      /import\s*\{[^}]*\b(ScrollTrigger|Flip|Draggable|SplitText|Observer|ScrollSmoother|InertiaPlugin|MotionPathPlugin)\b[^}]*\}\s*from\s*['"]gsap\/[a-zA-Z0-9]+['"]/g;
    let pluginMatch: RegExpExecArray | null;
    while ((pluginMatch = pluginImportRegex.exec(content)) !== null) {
      const pluginName = pluginMatch[1];
      const hasRegister = new RegExp(`gsap\\.registerPlugin\\s*\\([^)]*\\b${pluginName}\\b`).test(
        content
      );
      const hasPluginOk = /\/\/\s*plugin-ok:\s*\S+/i.test(content);

      if (!hasRegister && !hasPluginOk) {
        this.addViolationAtMatch({
          ruleId: 'gsap-missing-plugin-registration',
          filePath: relPath,
          content,
          matchIndex: pluginMatch.index,
          message: `GSAP plugin '${pluginName}' imported without calling 'gsap.registerPlugin(${pluginName})'. Risk of tree-shaking elimination.`,
          severity: 'error'
        });
      }
    }
  }

  private scanDevtoolsProduction(relPath: string, content: string): void {
    const devtoolsRegex = /\b(GSDevTools|MotionPathHelper)\.create\s*\(/g;
    let devtoolsMatch: RegExpExecArray | null;
    while ((devtoolsMatch = devtoolsRegex.exec(content)) !== null) {
      const toolName = devtoolsMatch[1];
      const windowAround = content.slice(
        Math.max(0, devtoolsMatch.index - DEVTOOLS_GUARD_WINDOW_PRE_CHARS),
        Math.min(content.length, devtoolsMatch.index + DEVTOOLS_GUARD_WINDOW_POST_CHARS)
      );
      const hasDevGuard = /import\.meta\.env\.DEV|NODE_ENV\s*!==\s*['"]production['"]/i.test(
        windowAround
      );
      const hasDevtoolsOk = /\/\/\s*devtools-ok:\s*\S+/i.test(windowAround);

      if (!hasDevGuard && !hasDevtoolsOk) {
        this.addViolationAtMatch({
          ruleId: 'gsap-banned-devtools-production',
          filePath: relPath,
          content,
          matchIndex: devtoolsMatch.index,
          message: `Debugging tool '${toolName}' detected without 'import.meta.env.DEV' environment guard. Prohibited in production.`,
          severity: 'error'
        });
      }
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateGsapFrameworkHygieneAuditor());
