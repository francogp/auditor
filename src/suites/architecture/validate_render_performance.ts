/**
 * scripts/auditors/architecture/validate_render_performance.ts
 *
 * RENDER & GPU PERFORMANCE HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Enforces static GPU rendering hygiene and animation standards across Facturación 2.0:
 *   1. Prohibits 'mix-blend-mode' on continuous weather overlays, atmosphere layers,
 *      and animated particle surfaces (eliminating GPU framebuffer readbacks).
 *   2. Prohibits costly real-time filters ('drop-shadow', 'blur') in weather styles,
 *      mandating layered vector strokes or pre-rendered canvas caches.
 *   3. Prohibits excessive negative insets (>128px) on atmospheric overlays to prevent
 *      inflating compositor textures to tens of millions of overdrawn pixels.
 *   4. Prohibits CPU JavaScript modifiers in continuous GSAP animation loops ('modifiers: { ... }'),
 *      requiring hardware-accelerated GPU transforms with modular translation.
 *
 * Escape Hatches:
 *   // render-ok, // blend-ok
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_render_performance.ts
 *   npm run validate:render-performance
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor } from '../../core/auditorBase.ts';

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
  'render-banned-mix-blend-mode': 'mix-blend-mode prohibido',
  'render-banned-filter-in-weather': 'Filtro costoso en clima',
  'render-excessive-atmospheric-inset': 'Inset negativo excesivo (>128px)',
  'render-gsap-cpu-modifier': 'Modificador de CPU en loop GSAP'
};

const MAX_PERMISSIBLE_NEGATIVE_INSET_PX = 128;

export class ValidateRenderPerformanceAuditor extends FileScanAuditor<RenderPerformanceRuleId> {
  constructor(roots: readonly string[] = ['src']) {
    super({
      id: 'validate_render_performance',
      name: 'Render & GPU Performance Hygiene Validator',
      description: 'Valida higiene GPU, blend-modes e insets en capas de clima',
      family: 'architecture',
      ruleIds: RENDER_PERFORMANCE_RULES,
      packageName: 'GPU',
      ruleDescriptions: RENDER_PERFORMANCE_DESCRIPTIONS,
      roots,
      allowedExtensions: new Set(['.scss', '.css', '.vue', '.ts'])
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    const normalizedPath = relPath.replace(/\\/g, '/');
    const isWeatherStyle =
      normalizedPath.includes('src/styles/components/weather/') ||
      normalizedPath.endsWith('AtmosphereLayer.styles.scss');

    const isAtmosphereAnim =
      normalizedPath.includes('src/components/common/useAtmosphere') ||
      normalizedPath.includes('src/components/common/AtmosphereLayer.vue') ||
      normalizedPath.includes('src/components/common/atmosphereSnowHelper.ts');

    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineNum = i + 1;

      // Escape hatches
      if (this.isLineIgnored(line, ['render-ok', 'blend-ok'])) {
        continue;
      }

      // Rule 1: render-banned-mix-blend-mode
      if (isWeatherStyle || line.includes('weather-overlay') || line.includes('rain-layer')) {
        const mixBlendMatch = /mix-blend-mode\s*:\s*(?!normal\b)([a-z-]+)/i.exec(line);
        if (mixBlendMatch) {
          this.addViolation({
            ruleId: 'render-banned-mix-blend-mode',
            severity: 'error',
            file: relPath,
            line: lineNum,
            message: `Uso prohibido de 'mix-blend-mode: ${mixBlendMatch[1]}' en capa de clima/animación. Causa framebuffer readbacks y degrada el fill-rate GPU. Usa composición alpha estándar o capas SVG.`,
            context: line.trim()
          });
        }
      }

      // Rule 2: render-banned-filter-in-weather
      if (isWeatherStyle) {
        const filterMatch = /filter\s*:\s*[^;]*(?:drop-shadow|blur)\s*\(/i.exec(line);
        if (filterMatch) {
          this.addViolation({
            ruleId: 'render-banned-filter-in-weather',
            severity: 'error',
            file: relPath,
            line: lineNum,
            message: `Filtro costoso ('drop-shadow' o 'blur') en estilos de clima. Forzar convolución gaussiana en GPU a 60 FPS causa tirones de fotogramas. Usa siluetas SVG multicapa o box-shadow.`,
            context: line.trim()
          });
        }
      }

      // Rule 3: render-excessive-atmospheric-inset
      if (isWeatherStyle) {
        const insetMatch = /inset\s*:\s*-\s*([0-9]+)px/i.exec(line);
        if (insetMatch) {
          const px = parseInt(insetMatch[1]!, 10);
          if (px > MAX_PERMISSIBLE_NEGATIVE_INSET_PX) {
            this.addViolation({
              ruleId: 'render-excessive-atmospheric-inset',
              severity: 'error',
              file: relPath,
              line: lineNum,
              message: `Inset negativo excesivo (-${px}px > -${MAX_PERMISSIBLE_NEGATIVE_INSET_PX}px) en capa atmosférica. Multiplica el búfer de textura por millones de píxeles innecesarios. Usa inset: -128px como máximo.`,
              context: line.trim()
            });
          }
        }
      }

      // Rule 4: render-gsap-cpu-modifier
      if (isAtmosphereAnim) {
        if (/\bmodifiers\s*:\s*\{/.test(line)) {
          this.addViolation({
            ruleId: 'render-gsap-cpu-modifier',
            severity: 'error',
            file: relPath,
            line: lineNum,
            message: `Modificador JS en GSAP ('modifiers: { ... }') ejecutado en bucle continuo de animación. Forzar cálculos en CPU cada fotograma degrada los 60 FPS. Usa transformaciones de GPU nativas con bucle modular de GSAP.`,
            context: line.trim()
          });
        }
      }
    }
  }
}

// Canonical CLI Entrypoint
if (
  process.argv[1] &&
  import.meta.filename &&
  path.basename(process.argv[1]) === path.basename(import.meta.filename)
) {
  await BaseAuditor.runCli(new ValidateRenderPerformanceAuditor());
}
