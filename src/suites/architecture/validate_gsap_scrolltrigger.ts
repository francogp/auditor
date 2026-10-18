/**
 * src/suites/architecture/validate_gsap_scrolltrigger.ts
 *
 * GSAP SCROLLTRIGGER ARCHITECTURAL HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Enforces best practices and anti-pattern prevention for GSAP ScrollTrigger (AGENTS.md):
 *   1. `gsap-scrolltrigger-in-timeline-child`: Prohibits scrollTrigger in child tweens of timelines.
 *   2. `gsap-scrolltrigger-scrub-and-toggle`: Prohibits conflicting scrub and toggleActions.
 *   3. `gsap-scrolltrigger-markers-production`: Prohibits markers: true in production source files.
 *   4. `gsap-scrolltrigger-animating-pinned-element`: Prohibits animating transforms on pinned element.
 *   5. `gsap-scrolltrigger-container-animation-ease`: Enforces ease: "none" on containerAnimation tweens.
 *
 * Escape Hatches:
 *   `// scrolltrigger-ok: <reason>`, `// markers-ok: <reason>`, `// st-ok: <reason>`
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_gsap_scrolltrigger.ts
 */

import { enableCompileCache } from 'node:module';
import { BaseAuditor,
  createUniformRemediationPhases, FileScanAuditor, createRuleCapabilities } from '../../core/auditorBase.ts';
import { getAuditConfig, isExemptFile } from '../../core/auditConfig.ts';

enableCompileCache();

export type GsapScrollTriggerRuleId =
  | 'gsap-scrolltrigger-in-timeline-child'
  | 'gsap-scrolltrigger-scrub-and-toggle'
  | 'gsap-scrolltrigger-markers-production'
  | 'gsap-scrolltrigger-animating-pinned-element'
  | 'gsap-scrolltrigger-container-animation-ease';

export const GSAP_SCROLLTRIGGER_RULES: readonly GsapScrollTriggerRuleId[] = [
  'gsap-scrolltrigger-in-timeline-child',
  'gsap-scrolltrigger-scrub-and-toggle',
  'gsap-scrolltrigger-markers-production',
  'gsap-scrolltrigger-animating-pinned-element',
  'gsap-scrolltrigger-container-animation-ease'
] as const;

export class ValidateGsapScrollTriggerAuditor extends FileScanAuditor<GsapScrollTriggerRuleId> {
  constructor(roots?: readonly string[], projectRoot?: string) {
    const config = getAuditConfig(projectRoot);
    const effectiveRoots = roots ?? config.paths.srcRoots;

    super({
      usesThirdPartyTool: false,
      id: 'validate_gsap_scrolltrigger',
      name: 'GSAP ScrollTrigger Hygiene',
      description: 'Gobernanza de sincronización y anclajes en ScrollTrigger',
      family: 'architecture',
      packageName: 'ScrollTrigger',
      icon: '📜',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      ruleCapabilities: createRuleCapabilities(GSAP_SCROLLTRIGGER_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      roots: effectiveRoots,
      allowedExtensions: new Set(['.ts', '.vue', '.tsx', '.js']),
      ruleIds: GSAP_SCROLLTRIGGER_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(GSAP_SCROLLTRIGGER_RULES, 'behavior'),
      ruleDescriptions: {
        'gsap-scrolltrigger-in-timeline-child': 'scrollTrigger en tween de timeline',
        'gsap-scrolltrigger-scrub-and-toggle': 'Conflicto scrub y toggleActions',
        'gsap-scrolltrigger-markers-production': 'markers: true en código productivo',
        'gsap-scrolltrigger-animating-pinned-element': 'Animación en elemento fijado pin',
        'gsap-scrolltrigger-container-animation-ease': 'Falta ease: none en contenedor'
      },
      ruleRemediations: {
        'gsap-scrolltrigger-in-timeline-child':
          'Causa Raíz:\n' +
          'Se declaró la propiedad "scrollTrigger" dentro de un tween individual (tl.to, tl.from, tl.fromTo) que forma parte de una Timeline de GSAP.\n' +
          'Los tweens hijos no pueden tener su propio ScrollTrigger independiente porque la Timeline madre es la que controla el progreso y tiempo de sus hijos, generando bloqueos o desincronización severa.\n\n' +
          'Diagnóstico:\n' +
          'Busca ".to(..., { scrollTrigger: ... })" o similar encadenado a una Timeline ("tl" o "timeline").\n\n' +
          'Solución Canónica:\n' +
          'Declarar el ScrollTrigger en la configuración de la Timeline constructora: "gsap.timeline({ scrollTrigger: { ... } })". Todos los tweens hijos se ejecutarán secuencialmente conforme avance el scroll.\n\n' +
          'Ejemplo Antes vs Después:\n' +
          '// ❌ Incorrecto: scrollTrigger en tween hijo de timeline\n' +
          '// tl.to(".box1", { x: 100, [\'scroll\' + \'Trigger\']: { ... } })\n' +
          '// ✅ Correcto: scrollTrigger en la timeline madre\n' +
          'const tl = gsap.timeline({ scrollTrigger: { trigger: ".container", scrub: true } });\n' +
          'tl.to(".box1", { x: 100 }).to(".box2", { x: 200 });',
        'gsap-scrolltrigger-scrub-and-toggle':
          'Causa Raíz:\n' +
          'Se configuraron simultáneamente "scrub" y "toggleActions" en el mismo objeto ScrollTrigger.\n' +
          '"scrub" vincula el progreso continuo de la animación a la posición de la barra de desplazamiento, haciendo que "toggleActions" (que reacciona a eventos discretos al cruzar umbrales como onEnter/onLeave) quede neutralizado o entre en conflicto de cálculo.\n\n' +
          'Diagnóstico:\n' +
          'Revisa las opciones de ScrollTrigger donde coinciden ambas propiedades.\n\n' +
          'Solución Canónica:\n' +
          'Decide el modelo de interacción deseado:\n' +
          '1. Si la animación debe seguir el dedo o rueda del ratón progresivamente, conserva "scrub" y elimina "toggleActions".\n' +
          '2. Si la animación debe dispararse (play, pause, reverse, restart) al entrar o salir del viewport, conserva "toggleActions" y elimina "scrub".\n\n' +
          'Ejemplo Antes vs Después:\n' +
          '// ❌ Incorrecto: combinar scrub numérico con toggleActions en el mismo objeto\n' +
          '// ✅ Correcto: modelo scrub puro sin toggleActions (o viceversa)\n' +
          'ScrollTrigger.create({ trigger: ".elem", scrub: 1 });',
        'gsap-scrolltrigger-markers-production':
          'Causa Raíz:\n' +
          'Se encontró "markers: true" en el código fuente de ScrollTrigger sin protección condicional de desarrollo.\n' +
          'Esto dibuja guías visuales rojas y verdes en el viewport de los usuarios en producción.\n\n' +
          'Diagnóstico:\n' +
          'Busca la propiedad "markers: true" en la inicialización de ScrollTrigger.\n\n' +
          'Solución Canónica:\n' +
          'Eliminar "markers: true" o condicionarla mediante "markers: import.meta.env.DEV".\n\n' +
          'Ejemplo Antes vs Después:\n' +
          '// ❌ Incorrecto: marcadores expuestos en producción\n' +
          'scrollTrigger: { trigger: ".box", markers: true }\n\n' +
          '// ✅ Correcto: condicionado al entorno de desarrollo\n' +
          'scrollTrigger: { trigger: ".box", markers: import.meta.env.DEV }',
        'gsap-scrolltrigger-animating-pinned-element':
          'Causa Raíz:\n' +
          'Se aplican animaciones de transformación ("x", "y", "scale", "rotation") directamente sobre un elemento fijado ("pin: true").\n' +
          'Al fijar un elemento, ScrollTrigger envuelve el nodo en un contenedor espaciador ("pin-spacer") y manipula sus estilos de posición. Modificar las transformaciones del elemento fijado distorsiona las dimensiones del espaciador y genera saltos visuales o desalineación de layout.\n\n' +
          'Diagnóstico:\n' +
          'Revisa el tween: si el elemento animado en el target es el mismo que tiene "pin: true".\n\n' +
          'Solución Canónica:\n' +
          'Fijar el contenedor padre y animar un contenedor hijo interno (nested wrapper).\n\n' +
          'Ejemplo Antes vs Después:\n' +
          '// ❌ Incorrecto: animar el mismo elemento fijado\n' +
          'gsap.to(".pinned-card", {\n' +
          '  scrollTrigger: { trigger: ".pinned-card", pin: true },\n' +
          '  x: 200\n' +
          '});\n\n' +
          '// ✅ Correcto: fijar el contenedor exterior y animar el contenido interior\n' +
          'gsap.to(".pinned-card-inner", {\n' +
          '  scrollTrigger: { trigger: ".pinned-card-wrapper", pin: true },\n' +
          '  x: 200\n' +
          '});',
        'gsap-scrolltrigger-container-animation-ease':
          'Causa Raíz:\n' +
          'El tween impulsor de un scroll horizontal (usado como "containerAnimation" para ScrollTriggers anidados) tiene un ease no lineal (como "power1.out" o el valor predeterminado "power1.inOut").\n' +
          'Para que los ScrollTriggers anidados sincronicen perfectamente sus posiciones de activación con el avance del desplazamiento horizontal, el movimiento del contenedor debe ser estrictamente lineal.\n\n' +
          'Diagnóstico:\n' +
          'Comprueba la definición del tween asignado a containerAnimation.\n\n' +
          'Solución Canónica:\n' +
          'Establecer "ease: \'none\'" en el tween principal del contenedor horizontal.\n\n' +
          'Ejemplo Antes vs Después:\n' +
          '// ❌ Incorrecto: tween con ease implícito o no lineal\n' +
          'const horizontalTween = gsap.to(".sections", { xPercent: -300 });\n\n' +
          '// ✅ Correcto: interpolación lineal obligatoria\n' +
          'const horizontalTween = gsap.to(".sections", {\n' +
          '  xPercent: -300,\n' +
          '  ease: "none"\n' +
          '});'
      }
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    if (isExemptFile(relPath)) return;
    this.runSubAuditorSync('gsap-scrolltrigger-in-timeline-child', () => {
      this.checkTimelineChild(relPath, content);
    });
    this.runSubAuditorSync('gsap-scrolltrigger-scrub-and-toggle', () => {
      this.checkScrubAndToggle(relPath, content);
    });
    this.runSubAuditorSync('gsap-scrolltrigger-markers-production', () => {
      this.checkMarkersProduction(relPath, content);
    });
    this.runSubAuditorSync('gsap-scrolltrigger-animating-pinned-element', () => {
      this.checkAnimatingPinnedElement(relPath, content);
    });
    this.runSubAuditorSync('gsap-scrolltrigger-container-animation-ease', () => {
      this.checkContainerAnimationEase(relPath, content);
    });
  }

  private isLineSuppressed(content: string, index: number, pattern: RegExp): boolean {
    const lineStart = content.lastIndexOf('\n', index) + 1;
    const lineEnd = content.indexOf('\n', index);
    const lineText = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    const trimmed = lineText.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      return true;
    }
    return pattern.test(lineText);
  }

  private checkTimelineChild(relPath: string, content: string): void {
    const timelineChildRegex =
      /(?:\b(?:tl|timeline|\w*Timeline)|\))\s*\.\s*(?:to|from|fromTo)\s*\([^){]*\{[^)}]*(?:\}[^){]*\{[^)}]*)*(?:\)[^}]*)?\bscrollTrigger\s*:/g;
    let m: RegExpExecArray | null;
    while ((m = timelineChildRegex.exec(content)) !== null) {
      if (this.isLineSuppressed(content, m.index, /\/\/\s*(?:scrolltrigger-ok|st-ok):\s*\S+/i))
        continue;

      this.addViolationAtMatch({
        ruleId: 'gsap-scrolltrigger-in-timeline-child',
        filePath: relPath,
        content,
        matchIndex: m.index,
        message:
          "Declarar 'scrollTrigger' en un tween hijo de timeline rompe la secuencia. Decláralo en 'gsap.timeline({ scrollTrigger: ... })'.",
        severity: 'error'
      });
    }
  }

  private scanScrollTriggerBlocks(
    content: string,
    callback: (blockBody: string, matchIndex: number) => void
  ): void {
    const stBlockRegex = /(?:scrollTrigger\s*:\s*\{|ScrollTrigger\.create\s*\(\s*\{)([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = stBlockRegex.exec(content)) !== null) {
      const blockBody = m[1] ?? '';
      const matchIndex = m.index;
      if (this.isLineSuppressed(content, matchIndex, /\/\/\s*(?:scrolltrigger-ok|st-ok):\s*\S+/i))
        continue;
      callback(blockBody, matchIndex);
    }
  }

  private checkScrubAndToggle(relPath: string, content: string): void {
    this.scanScrollTriggerBlocks(content, (blockBody, matchIndex) => {
      if (/\bscrub\s*:/i.test(blockBody) && /\btoggleActions\s*:/i.test(blockBody)) {
        this.addViolationAtMatch({
          ruleId: 'gsap-scrolltrigger-scrub-and-toggle',
          filePath: relPath,
          content,
          matchIndex,
          message:
            "Conflicto en ScrollTrigger: 'scrub' y 'toggleActions' no pueden coexistir. 'scrub' neutraliza las toggleActions.",
          severity: 'error'
        });
      }
    });
  }

  private checkMarkersProduction(relPath: string, content: string): void {
    this.scanScrollTriggerBlocks(content, (blockBody, matchIndex) => {
      if (/\bmarkers\s*:\s*true\b/i.test(blockBody)) {
        const surroundingWindow = content.slice(
          Math.max(0, matchIndex - 100),
          Math.min(content.length, matchIndex + 200)
        );
        const hasDevGuard = /import\.meta\.env\.DEV|NODE_ENV\s*!==\s*['"]production['"]/i.test(
          surroundingWindow
        );
        const hasMarkersOk = /\/\/\s*markers-ok:\s*\S+/i.test(surroundingWindow);
        if (!hasDevGuard && !hasMarkersOk) {
          this.addViolationAtMatch({
            ruleId: 'gsap-scrolltrigger-markers-production',
            filePath: relPath,
            content,
            matchIndex,
            message:
              "Uso de 'markers: true' en código productivo. Elimina los marcadores o enciérralos con guardia de desarrollo ('import.meta.env.DEV').",
            severity: 'error'
          });
        }
      }
    });
  }

  private checkAnimatingPinnedElement(relPath: string, content: string): void {
    const pinnedAnimationRegex =
      /\b(?:gsap|tl|timeline)\s*\.\s*(?:to|from|fromTo)\s*\([^,]+,\s*\{[^}]*\bpin\s*:\s*true[^}]*(?:\bx|\by|\bscale|\brotation)\s*:/g;
    let m: RegExpExecArray | null;
    while ((m = pinnedAnimationRegex.exec(content)) !== null) {
      if (
        this.isLineSuppressed(content, m.index, /\/\/\s*(?:scrolltrigger-ok|st-ok|pin-ok):\s*\S+/i)
      )
        continue;

      this.addViolationAtMatch({
        ruleId: 'gsap-scrolltrigger-animating-pinned-element',
        filePath: relPath,
        content,
        matchIndex: m.index,
        message:
          "Animación de transformación sobre elemento fijado con 'pin: true' distorsiona el pin-spacer. Fija el contenedor padre.",
        severity: 'error'
      });
    }
  }

  private checkContainerAnimationEase(relPath: string, content: string): void {
    const containerAnimRegex = /\bcontainerAnimation\s*:\s*([^,}\n]+)/g;
    let m: RegExpExecArray | null;
    while ((m = containerAnimRegex.exec(content)) !== null) {
      const animVar = m[1]?.trim() ?? '';
      if (!animVar) continue;
      const defRegex = new RegExp(
        `(?:const|let|var)\\s+${animVar}\\s*=\\s*gsap\\.(?:to|from|fromTo)\\s*\\([^}]*\\}`,
        'g'
      );
      const defMatch = defRegex.exec(content);
      if (defMatch) {
        const tweenBody = defMatch[0];
        const easeMatch = /\bease\s*:\s*['"]([^'"]+)['"]/.exec(tweenBody);
        if (easeMatch && easeMatch[1] !== 'none') {
          this.addViolationAtMatch({
            ruleId: 'gsap-scrolltrigger-container-animation-ease',
            filePath: relPath,
            content,
            matchIndex: defMatch.index,
            message: `El tween impulsor de containerAnimation '${animVar}' debe tener 'ease: "none"' para sincronizar linealmente con el scroll.`,
            severity: 'error'
          });
        }
      }
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateGsapScrollTriggerAuditor());
