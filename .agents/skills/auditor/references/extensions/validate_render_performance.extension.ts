/**
 * skills/auditor/references/extensions/validate_render_performance.extension.ts
 *
 * HOST EXTENSION BLUEPRINT: RENDER & GPU PERFORMANCE HYGIENE AUDITOR
 *
 * Enforces static GPU rendering hygiene and animation standards across weather/atmosphere surfaces:
 *   1. Prohibits 'mix-blend-mode' on continuous weather overlays, atmosphere layers,
 *      and animated particle surfaces (eliminating GPU framebuffer readbacks).
 *   2. Prohibits costly real-time filters ('drop-shadow', 'blur') in weather styles,
 *      mandating layered vector strokes or pre-rendered canvas caches.
 *   3. Prohibits excessive negative insets (>128px) on atmospheric overlays to prevent
 *      inflating compositor textures to tens of millions of overdrawn pixels.
 *   4. Prohibits CPU JavaScript modifiers in continuous GSAP animation loops ('modifiers: { ... }'),
 *      requiring hardware-accelerated GPU transforms with modular translation.
 *
 * Usage in .auditor/audit.config.ts:
 *   export default defineAuditConfig({
 *     extensions: ['scripts/auditors/architecture/validate_render_performance.ts']
 *   });
 */

import { enableCompileCache } from 'node:module';

import {
  BaseAuditor,
  FileScanAuditor,
  createUniformRuleCapabilities,
  createUniformRemediationPhases,
  getAuditConfig,
  DEFAULT_AUDIT_CONFIG,
  normalizePosixPath,
  type FileScanRootsOptions
} from '@francogp/auditor';
import ts from 'typescript';

enableCompileCache();

export type RenderPerformanceRuleId =
  | 'render-banned-mix-blend-mode'
  | 'render-banned-filter-in-weather'
  | 'render-excessive-atmospheric-inset'
  | 'render-gsap-cpu-modifier';

export const RENDER_PERFORMANCE_RULES: readonly RenderPerformanceRuleId[] = [
  'render-banned-mix-blend-mode',
  'render-banned-filter-in-weather',
  'render-excessive-atmospheric-inset',
  'render-gsap-cpu-modifier'
] as const;

export const RENDER_PERFORMANCE_DESCRIPTIONS: Record<RenderPerformanceRuleId, string> = {
  'render-banned-mix-blend-mode': 'Forbidden mix-blend-mode on weather layer',
  'render-banned-filter-in-weather': 'Costly CSS filter on weather layer',
  'render-excessive-atmospheric-inset': 'Excessive negative inset (>128px)',
  'render-gsap-cpu-modifier': 'CPU modifier in continuous GSAP loop'
};

const MAX_PERMISSIBLE_NEGATIVE_INSET_PX = 128;

export type ValidateRenderPerformanceOptions = FileScanRootsOptions;

export class ValidateRenderPerformanceAuditor extends FileScanAuditor<RenderPerformanceRuleId> {
  public constructor(options: ValidateRenderPerformanceOptions = {}) {
    const config = getAuditConfig(options.projectRoot);
    const effectiveRoots =
      options.roots ??
      config.paths.stylesRoots ??
      config.paths.srcRoots ??
      DEFAULT_AUDIT_CONFIG.paths.srcRoots;
    super({
      ruleFixers: {},
      id: 'validate_render_performance',
      name: 'Render & GPU Performance Hygiene Validator',
      description: 'Validates GPU hygiene and blend-modes in weather layers',
      icon: '⚡',
      family: 'architecture',
      ruleCapabilities: {
        ...createUniformRuleCapabilities(
          [
            'render-banned-mix-blend-mode',
            'render-banned-filter-in-weather',
            'render-excessive-atmospheric-inset'
          ],
          {
            speed: 'light',
            phase: 'normal',
            md: false,
            ast: false,
            changedOnly: true,
            critical: false
          }
        ),
        'render-gsap-cpu-modifier': {
          speed: 'light',
          phase: 'normal',
          md: false,
          ast: true,
          changedOnly: true,
          critical: false
        }
      },
      ruleIds: RENDER_PERFORMANCE_RULES,
      packageName: 'GPU',
      configKey: 'performance.renderPerformance',
      defaultConfig: {
        enabled: true
      },
      criticalConfig: {},
      requiredPermissions: [],
      ruleRemediationPhases: createUniformRemediationPhases(RENDER_PERFORMANCE_RULES, 'behavior'),
      usesThirdPartyTool: false,
      ruleDescriptions: RENDER_PERFORMANCE_DESCRIPTIONS,
      ruleRemediations: {
        'render-banned-mix-blend-mode':
          '1. Root Cause: Disallowed mix-blend-mode detected on heavy continuous rendering layers.\n' +
          '2. Diagnosis: Inspect the reported weather or atmosphere stylesheet line.\n' +
          '3. Canonical Solution: Replace mix-blend-mode with precomputed alpha opacities or optimized SVG/PNG layers.\n' +
          '4. Example / Command: npm run auditor',
        'render-banned-filter-in-weather':
          '1. Root Cause: Costly CSS filter (blur, drop-shadow) detected on continuously animated elements.\n' +
          '2. Diagnosis: Inspect the reported filter declaration in weather styles.\n' +
          '3. Canonical Solution: Pre-render textures/sprites or use GPU transforms instead of continuous raster filters.\n' +
          '4. Example / Command: npm run auditor',
        'render-excessive-atmospheric-inset':
          '1. Root Cause: Negative inset exceeds the safe 128px threshold, inflating GPU compositor textures.\n' +
          '2. Diagnosis: Inspect the inset declaration in the reported atmospheric layer.\n' +
          '3. Canonical Solution: Clamp negative inset to <= 128px and use transform: translate(...) for motion.\n' +
          '4. Example / Command: npm run auditor',
        'render-gsap-cpu-modifier':
          '1. Root Cause: A GSAP modifiers callback forces per-frame CPU calculations in a continuous animation loop.\n' +
          '2. Diagnosis: Inspect the GSAP tween configuration in the reported file.\n' +
          '3. Canonical Solution: Migrate the animation to native GPU transforms (x, y, scale).\n' +
          '4. Example / Command: npm run auditor'
      },
      roots: effectiveRoots,
      allowedExtensions: new Set(['.scss', '.css', '.vue', '.ts']),
      projectRoot: options.projectRoot
    });
  }

  protected override scanFile(
    relPath: string,
    content: string,
    sourceFile?: ts.SourceFile
  ): void {
    const normalizedPath = normalizePosixPath(relPath);
    const config = getAuditConfig(this.projectRoot);
    const heavyPaths = config.styles?.heavyEffectPaths ?? [];
    const isWeatherStyle =
      heavyPaths.some((p) => normalizedPath.includes(p.replace(/^\/+|\/+$/g, ''))) ||
      normalizedPath.includes('weather') ||
      normalizedPath.includes('atmosphere');

    const isAtmosphereAnim =
      isWeatherStyle ||
      normalizedPath.includes('atmosphere') ||
      normalizedPath.includes('snow') ||
      normalizedPath.includes('rain');

    const isStylesheet = normalizedPath.endsWith('.scss') || normalizedPath.endsWith('.css');
    const styleLines = isStylesheet ? content.split(/\r?\n/) : [];

    // Rule 1: render-banned-mix-blend-mode (stylesheet format)
    this.runSubAuditorSync('render-banned-mix-blend-mode', () => {
      if (!isStylesheet) return;
      for (let i = 0; i < styleLines.length; i++) {
        const line = styleLines[i] ?? '';
        if (isWeatherStyle || line.includes('weather-overlay') || line.includes('rain-layer')) {
          const mixBlendMatch = /mix-blend-mode\s*:\s*(?!normal\b)([a-z-]+)/i.exec(line);
          if (mixBlendMatch) {
            this.addViolation({
              ruleId: 'render-banned-mix-blend-mode',
              severity: 'error',
              file: relPath,
              line: i + 1,
              message: `Forbidden 'mix-blend-mode: ${mixBlendMatch[1]}' on continuous weather/animation layer. Causes GPU framebuffer readbacks; use standard alpha composition or SVG layers.`,
              context: line.trim()
            });
          }
        }
      }
    });

    // Rule 2: render-banned-filter-in-weather (stylesheet format)
    this.runSubAuditorSync('render-banned-filter-in-weather', () => {
      if (!isStylesheet || !isWeatherStyle) return;
      for (let i = 0; i < styleLines.length; i++) {
        const line = styleLines[i] ?? '';
        const filterMatch = /filter\s*:\s*[^;]*(?:drop-shadow|blur)\s*\(/i.exec(line);
        if (filterMatch) {
          this.addViolation({
            ruleId: 'render-banned-filter-in-weather',
            severity: 'error',
            file: relPath,
            line: i + 1,
            message: `Costly CSS filter ('drop-shadow' or 'blur') in weather styles. Continuous Gaussian convolution at 60 FPS causes frame drops; use multi-layer SVG silhouettes or box-shadow.`,
            context: line.trim()
          });
        }
      }
    });

    // Rule 3: render-excessive-atmospheric-inset (stylesheet format)
    this.runSubAuditorSync('render-excessive-atmospheric-inset', () => {
      if (!isStylesheet || !isWeatherStyle) return;
      for (let i = 0; i < styleLines.length; i++) {
        const line = styleLines[i] ?? '';
        const insetMatch = /inset\s*:\s*-\s*([0-9]+)px/i.exec(line);
        if (insetMatch && insetMatch[1]) {
          const px = parseInt(insetMatch[1], 10);
          if (px > MAX_PERMISSIBLE_NEGATIVE_INSET_PX) {
            this.addViolation({
              ruleId: 'render-excessive-atmospheric-inset',
              severity: 'error',
              file: relPath,
              line: i + 1,
              message: `Excessive negative inset (-${px}px > -${MAX_PERMISSIBLE_NEGATIVE_INSET_PX}px) on atmospheric layer. Clamp inset to -128px maximum.`,
              context: line.trim()
            });
          }
        }
      }
    });

    // Rule 4: render-gsap-cpu-modifier (TypeScript / Vue SFC AST traversal — zero regex on code)
    this.runSubAuditorSync('render-gsap-cpu-modifier', () => {
      if (!isAtmosphereAnim || !sourceFile) return;
      const visit = (node: ts.Node): void => {
        if (
          ts.isPropertyAssignment(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === 'modifiers' &&
          ts.isObjectLiteralExpression(node.initializer)
        ) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(
            node.name.getStart(sourceFile)
          );
          this.addViolation({
            ruleId: 'render-gsap-cpu-modifier',
            severity: 'error',
            file: relPath,
            line: line + 1,
            col: character + 1,
            message: `GSAP JS modifier ('modifiers: { ... }') inside continuous animation loop degrades 60 FPS. Use native GPU transforms.`
          });
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    });
  }
}

// Canonical CLI Entrypoint (delegates argument parsing to Citty via BaseAuditor)
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateRenderPerformanceAuditor());
