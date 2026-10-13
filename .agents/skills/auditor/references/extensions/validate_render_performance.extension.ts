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
 * Escape Hatches:
 *   // render-ok, // blend-ok
 *
 * Usage in .auditor/audit.config.ts:
 *   extensions: ['../scripts/auditors/architecture/validate_render_performance.ts']
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor, createUniformRuleCapabilities, getAuditConfig, normalizePosixPath } from '@francogp/auditor';

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

export interface ValidateRenderPerformanceOptions {
  readonly projectRoot?: string;
  readonly roots?: readonly string[];
}

export class ValidateRenderPerformanceAuditor extends FileScanAuditor<RenderPerformanceRuleId> {
  constructor(options: ValidateRenderPerformanceOptions = {}) {
    const config = getAuditConfig(options.projectRoot);
    const effectiveRoots = options.roots ?? config.paths.stylesRoots ?? config.paths.srcRoots ?? ['src'];
    super({
      id: 'validate_render_performance',
      name: 'Render & GPU Performance Hygiene Validator',
      description: 'Valida higiene GPU y blend-modes en capas de clima',
      icon: '⚡',
      family: 'architecture',
      ruleCapabilities: createUniformRuleCapabilities(RENDER_PERFORMANCE_RULES, {
        fix: false,
        fixPriority: false,
        lint: true,
        md: false,
        ast: false,
        changedSince: true,
        heavy: false,
        requiresBuild: false,
        postRun: false
      }),
      ruleIds: RENDER_PERFORMANCE_RULES,
      packageName: 'GPU',
      configKey: 'styles.heavyEffectPaths',
      defaultConfig: {
        heavyEffectPaths: []
      },
      criticalConfig: {},
      usesThirdPartyTool: false,
      ruleDescriptions: RENDER_PERFORMANCE_DESCRIPTIONS,
      ruleRemediations: {
        'render-banned-mix-blend-mode':
          'Se detectó uso de mix-blend-mode no permitido en capas de renderizado pesado.\n' +
          '1. Sustituye mix-blend-mode por opacidades precalculadas o capas PNG/SVG optimizadas.\n' +
          '2. Revisa la lista de excepciones en audit.config.ts si es un efecto atmosférico autorizado.',
        'render-banned-filter-in-weather':
          'Se detectó un filtro CSS costoso (blur, drop-shadow) en elementos animados recurrentes.\n' +
          '1. Aplica pre-renderizado en texturas o sprites.\n' +
          '2. Utiliza transforms de GPU en lugar de filtros de rasterización continua.',
        'render-excessive-atmospheric-inset':
          'El valor de inset negativo supera el umbral seguro de 128px provocando sobregiro de viewport.\n' +
          '1. Reduce el margen o inset negativo a valores dentro de los límites seguros.\n' +
          '2. Emplea transform: translate(...) en su lugar.',
        'render-gsap-cpu-modifier':
          'Se detectó un modificador GSAP que fuerza cálculos continuos en la CPU por frame.\n' +
          '1. Migra la animación a transforms nativos de GPU (x, y, scale).\n' +
          '2. Evita modifiers o onUpdate pesados en loops de alta frecuencia.'
      },
      roots: effectiveRoots,
      allowedExtensions: new Set(['.scss', '.css', '.vue', '.ts']),
      projectRoot: options.projectRoot
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    const normalizedPath = normalizePosixPath(relPath);
    const config = getAuditConfig();
    const heavyPaths = config.styles?.heavyEffectPaths ?? [];
    const isWeatherStyle =
      heavyPaths.some(p => normalizedPath.includes(p.replace(/^\/+|\/+$/g, ''))) ||
      normalizedPath.includes('weather') ||
      normalizedPath.includes('atmosphere');

    const isAtmosphereAnim =
      isWeatherStyle ||
      normalizedPath.includes('atmosphere') ||
      normalizedPath.includes('snow') ||
      normalizedPath.includes('rain');

    const lines = content.split(/\r?\n/);

    // Rule 1: render-banned-mix-blend-mode
    this.runSubAuditorSync('render-banned-mix-blend-mode', () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (this.isLineIgnored(line, ['render-ok', 'blend-ok'])) continue;
        if (isWeatherStyle || line.includes('weather-overlay') || line.includes('rain-layer')) {
          const mixBlendMatch = /mix-blend-mode\s*:\s*(?!normal\b)([a-z-]+)/i.exec(line);
          if (mixBlendMatch) {
            this.addViolation({
              ruleId: 'render-banned-mix-blend-mode',
              severity: 'error',
              file: relPath,
              line: i + 1,
              message: `Uso prohibido de 'mix-blend-mode: ${mixBlendMatch[1]}' en capa de clima/animación. Causa framebuffer readbacks y degrada el fill-rate GPU. Usa composición alpha estándar o capas SVG.`,
              context: line.trim()
            });
          }
        }
      }
    });

    // Rule 2: render-banned-filter-in-weather
    this.runSubAuditorSync('render-banned-filter-in-weather', () => {
      if (!isWeatherStyle) return;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (this.isLineIgnored(line, ['render-ok', 'blend-ok'])) continue;
        const filterMatch = /filter\s*:\s*[^;]*(?:drop-shadow|blur)\s*\(/i.exec(line);
        if (filterMatch) {
          this.addViolation({
            ruleId: 'render-banned-filter-in-weather',
            severity: 'error',
            file: relPath,
            line: i + 1,
            message: `Filtro costoso ('drop-shadow' o 'blur') en estilos de clima. Forzar convolución gaussiana en GPU a 60 FPS causa tirones de fotogramas. Usa siluetas SVG multicapa o box-shadow.`,
            context: line.trim()
          });
        }
      }
    });

    // Rule 3: render-excessive-atmospheric-inset
    this.runSubAuditorSync('render-excessive-atmospheric-inset', () => {
      if (!isWeatherStyle) return;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (this.isLineIgnored(line, ['render-ok', 'blend-ok'])) continue;
        const insetMatch = /inset\s*:\s*-\s*([0-9]+)px/i.exec(line);
        if (insetMatch) {
          const px = parseInt(insetMatch[1]!, 10);
          if (px > MAX_PERMISSIBLE_NEGATIVE_INSET_PX) {
            this.addViolation({
              ruleId: 'render-excessive-atmospheric-inset',
              severity: 'error',
              file: relPath,
              line: i + 1,
              message: `Inset negativo excesivo (-${px}px > -${MAX_PERMISSIBLE_NEGATIVE_INSET_PX}px) en capa atmosférica. Multiplica el búfer de textura por millones de píxeles innecesarios. Usa inset: -128px como máximo.`,
              context: line.trim()
            });
          }
        }
      }
    });

    // Rule 4: render-gsap-cpu-modifier
    this.runSubAuditorSync('render-gsap-cpu-modifier', () => {
      if (!isAtmosphereAnim) return;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (this.isLineIgnored(line, ['render-ok', 'blend-ok'])) continue;
        if (/\bmodifiers\s*:\s*\{/.test(line)) {
          this.addViolation({
            ruleId: 'render-gsap-cpu-modifier',
            severity: 'error',
            file: relPath,
            line: i + 1,
            message: `Modificador JS en GSAP ('modifiers: { ... }') ejecutado en bucle continuo de animación. Forzar cálculos en CPU cada fotograma degrada los 60 FPS. Usa transformaciones de GPU nativas con bucle modular de GSAP.`,
            context: line.trim()
          });
        }
      }
    });
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateRenderPerformanceAuditor());
