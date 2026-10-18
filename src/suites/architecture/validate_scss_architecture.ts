import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  FileScanAuditor,
  createUniformRuleCapabilities,
  createUniformRemediationPhases,
  LIGHT_RULE_CAPABILITIES,
  resolveFileScanRoots
} from '../../core/auditorBase.ts';
import { deriveCoverageFromRoots } from '../../core/auditCoverage.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { stripCommentsAndStrings } from '../../core/scannerUtils.ts';

enableCompileCache();

export const SCSS_ARCHITECTURE_RULES = [
  'raw-css-in-sfc',
  'scss-deep-selector-abuse',
  'non-standard-spacing-unit',
  'missing-theme-token-usage',
  'excessive-scss-nesting'
] as const;

export type ScssArchitectureRuleId = (typeof SCSS_ARCHITECTURE_RULES)[number];

const SCANNABLE_EXTS = new Set(['.scss', '.vue', '.css']);

export class ValidateScssArchitectureAuditor extends FileScanAuditor<ScssArchitectureRuleId> {
  constructor(options: { projectRoot?: string; fix?: boolean; roots?: readonly string[] } = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(options);
    const config = getAuditConfig(effectiveRoot);
    super({
      usesThirdPartyTool: false,
      id: 'validate_scss_architecture',
      name: 'SCSS Architecture & Distinctive Design Validator',
      description: 'Arquitectura SCSS, tokenización y diseño distintivo',
      family: 'architecture',
      packageName: 'SCSSArch',
      icon: '🎨',
      configKey: 'scssArchitecture.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      roots: targetRoots,
      allowedExtensions: SCANNABLE_EXTS,
      ruleIds: SCSS_ARCHITECTURE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(SCSS_ARCHITECTURE_RULES, 'hygiene'),
      ruleDescriptions: {
        'raw-css-in-sfc': '<style> sin atributo lang="scss"',
        'scss-deep-selector-abuse': 'Abuso o anidamiento de :deep()',
        'non-standard-spacing-unit': 'Espaciado arbitrario sin escala',
        'missing-theme-token-usage': 'Color hardcodeado sin token de tema',
        'excessive-scss-nesting': 'Anidamiento SCSS superior a 3 niveles'
      },
      ruleRemediations: {
        'raw-css-in-sfc':
          '📖 GUÍA DE REMEDIACIÓN: raw-css-in-sfc\n' +
          '1. Causa Raíz: Se encontró una etiqueta `<style>` en un componente Vue (.vue) sin el atributo `lang="scss"`. La arquitectura del proyecto estandariza el preprocesador SCSS para todos los componentes.\n' +
          '2. Diagnóstico: Ubica la etiqueta `<style>` en el componente Vue.\n' +
          '3. Solución Canónica: Añade `lang="scss"` (y `scoped` si aplica al componente): `<style lang="scss" scoped>`.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: `<style scoped>`\n' +
          '   ✅ Correcto:   `<style lang="scss" scoped>`',
        'scss-deep-selector-abuse':
          '📖 GUÍA DE REMEDIACIÓN: scss-deep-selector-abuse\n' +
          '1. Causa Raíz: Se utilizó `:deep()` anidado o aplicado a múltiples niveles dentro de un selector (`:deep(.a :deep(.b))`), o de forma redundante. Esto rompe el encapsulamiento de estilos y genera selectores inestables.\n' +
          '2. Diagnóstico: Busca la regla CSS con `:deep()` en la línea señalada.\n' +
          '3. Solución Canónica: Aplica `:deep()` una sola vez en el nivel raíz del selector hijo que necesitas estilizar: `:deep(.target-class)`.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Abuso:    `:deep(.parent) :deep(.child)`\n' +
          '   ✅ Canónico: `:deep(.parent .child)`',
        'non-standard-spacing-unit':
          '📖 GUÍA DE REMEDIACIÓN: non-standard-spacing-unit\n' +
          '1. Causa Raíz: Se utilizó un valor de espaciado en píxeles arbitrario (ej: `margin: 13px`, `padding: 27px`) que no se ajusta a la escala modular de diseño (múltiplos de 4px/8px o tokens de espaciado).\n' +
          '2. Diagnóstico: Revisa la propiedad de margen, padding o gap reportada.\n' +
          '3. Solución Canónica:\n' +
          '   a) Reemplaza el valor por la variable de espaciado del sistema de diseño (ej: `var(--spacing-md)` o `$spacing-4`).\n' +
          '   b) Ajusta el valor al múltiplo canónico más cercano (ej: 12px o 16px en lugar de 13px).\n' +
          '4. Ejemplo:\n' +
          '   ❌ Arbitrario: `padding: 15px;`\n' +
          '   ✅ En escala:   `padding: var(--space-4, 16px);`',
        'missing-theme-token-usage':
          '📖 GUÍA DE REMEDIACIÓN: missing-theme-token-usage\n' +
          '1. Causa Raíz: Se encontró un color hardcodeado (`#fff`, `rgb(...)`, `#1e293b`) en las hojas de estilo en lugar de utilizar tokens de tema o variables CSS. Los colores hardcodeados impiden el soporte multitema (Dark/Light mode).\n' +
          '2. Diagnóstico: Identifica el color literal en la línea señalada.\n' +
          '3. Solución Canónica: Sustituye el color por la variable CSS de tema semántica correspondiente (ej: `var(--color-surface)`, `var(--color-primary-text)`).\n' +
          '4. Ejemplo:\n' +
          '   ❌ Hardcodeado: `background-color: #0f172a; color: #ffffff;`\n' +
          '   ✅ Tokenizado:   `background-color: var(--color-bg-primary); color: var(--color-text-primary);`',
        'excessive-scss-nesting':
          '📖 GUÍA DE REMEDIACIÓN: excessive-scss-nesting\n' +
          '1. Causa Raíz: Se anidaron reglas SCSS a más de 3 niveles de profundidad, lo que infla la especificidad de los selectores generados y degrada la mantenibilidad del CSS.\n' +
          '2. Diagnóstico: Observa la jerarquía de llaves `{ { { { } } } }` en el bloque de estilos.\n' +
          '3. Solución Canónica: Aplana las reglas SCSS utilizando la metodología BEM o selectores directos de clase.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Anidamiento profundo: `.card { .header { .title { span { color: red; } } } }`\n' +
          '   ✅ Aplanado:            `.card__title-highlight { color: var(--color-danger); }`'
      },
      ruleCapabilities: createUniformRuleCapabilities(
        SCSS_ARCHITECTURE_RULES,
        LIGHT_RULE_CAPABILITIES
      ),
      projectRoot: effectiveRoot,
      coverage: deriveCoverageFromRoots(targetRoots, SCANNABLE_EXTS, effectiveRoot),
      exemptPaths: config.scssArchitecture?.exemptPaths
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    const isVueSfc = relPath.endsWith('.vue');
    const isScssFile = relPath.endsWith('.scss');
    const isCssFile = relPath.endsWith('.css');

    this.runSubAuditorSync('raw-css-in-sfc', () => {
      if (isVueSfc) {
        this.auditRawCssInSfc(relPath, content);
      }
    });

    if (isVueSfc) {
      const styleBlocks = this.extractStyleBlocks(content);
      for (const block of styleBlocks) {
        this.runSubAuditorSync('scss-deep-selector-abuse', () => {
          this.auditScssDeepSelectorAbuse(relPath, block.content, block.startLine);
        });
        this.runSubAuditorSync('non-standard-spacing-unit', () => {
          this.auditNonStandardSpacingUnit(relPath, block.content, block.startLine);
        });
        this.runSubAuditorSync('missing-theme-token-usage', () => {
          this.auditMissingThemeTokenUsage(relPath, block.content, block.startLine, block.scoped);
        });
        this.runSubAuditorSync('excessive-scss-nesting', () => {
          this.auditExcessiveScssNesting(relPath, block.content, block.startLine, block.scoped);
        });
      }
    } else if (isScssFile || isCssFile) {
      this.runSubAuditorSync('scss-deep-selector-abuse', () => {
        this.auditScssDeepSelectorAbuse(relPath, content, 1);
      });
      this.runSubAuditorSync('non-standard-spacing-unit', () => {
        this.auditNonStandardSpacingUnit(relPath, content, 1);
      });
      this.runSubAuditorSync('missing-theme-token-usage', () => {
        this.auditMissingThemeTokenUsage(relPath, content, 1, false);
      });
      this.runSubAuditorSync('excessive-scss-nesting', () => {
        this.auditExcessiveScssNesting(relPath, content, 1, false);
      });
    }
  }

  private extractStyleBlocks(
    content: string
  ): Array<{ content: string; startLine: number; scoped: boolean }> {
    const blocks: Array<{ content: string; startLine: number; scoped: boolean }> = [];
    const styleRegex = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
    let match: RegExpExecArray | null;
    while ((match = styleRegex.exec(content)) !== null) {
      const attrs = match[1] ?? '';
      const scoped = /\bscoped\b/i.test(attrs);
      const before = content.slice(0, match.index);
      const startLine = before.split('\n').length;
      blocks.push({ content: match[2] ?? '', startLine, scoped });
    }
    return blocks;
  }

  private auditRawCssInSfc(relPath: string, content: string): void {
    if (content.includes('raw-css-ok')) return;
    if (!relPath.endsWith('.vue')) return;

    // Detect <style> without lang="scss"
    const styleTagRegex = /<style\b([^>]*)>/gi;
    let match: RegExpExecArray | null;
    while ((match = styleTagRegex.exec(content)) !== null) {
      const attrs = match[1] ?? '';
      const hasScss = /lang=["']scss["']/i.test(attrs);
      if (!hasScss) {
        const line = this.getLineNumber(content, match.index);
        this.addViolation({
          ruleId: 'raw-css-in-sfc',
          severity: 'error',
          message: 'Bloque <style> en componente SFC sin atributo lang="scss" mandatorio',
          file: relPath,
          line
        });
      }
    }
  }

  private auditScssDeepSelectorAbuse(
    relPath: string,
    content: string,
    lineOffset: number = 1
  ): void {
    if (content.includes('deep-selector-ok')) return;

    // 1. Detect nested :deep() e.g. :deep(...) :deep(...)
    const nestedDeepRegex = /:deep\([^)]*\)[^{};]*:deep\(/g;
    let nestedMatch: RegExpExecArray | null;
    while ((nestedMatch = nestedDeepRegex.exec(content)) !== null) {
      const line = lineOffset + this.getLineNumber(content, nestedMatch.index) - 1;
      this.addViolation({
        ruleId: 'scss-deep-selector-abuse',
        severity: 'error',
        message: 'Uso de selector :deep() anidado dentro de otro :deep() en la misma regla',
        file: relPath,
        line
      });
    }

    // 2. Detect overly complex selector chain inside :deep (> 3 compound selectors)
    const complexDeepRegex = /:deep\(\s*([^)]+)\s*\)/g;
    let complexMatch: RegExpExecArray | null;
    while ((complexMatch = complexDeepRegex.exec(content)) !== null) {
      const innerSelector = complexMatch[1] ?? '';
      const parts = innerSelector.trim().split(/\s+/).filter(Boolean);
      if (parts.length > 3) {
        const line = lineOffset + this.getLineNumber(content, complexMatch.index) - 1;
        this.addViolation({
          ruleId: 'scss-deep-selector-abuse',
          severity: 'error',
          message: `Cadena de selectores excesivamente compleja dentro de :deep() (${parts.length} selectores > 3)`,
          file: relPath,
          line
        });
      }
    }
  }

  private auditNonStandardSpacingUnit(
    relPath: string,
    content: string,
    lineOffset: number = 1
  ): void {
    if (content.includes('spacing-unit-ok')) return;
    const config = getAuditConfig(this.projectRoot);
    if (config.scssArchitecture?.allowPixelArtSpacing) return;

    const allowedUnits = new Set(config.scssArchitecture?.allowedSpacingUnits ?? []);

    // Detect arbitrary odd pixel values like 11px, 13px, 15px, 17px, 19px, 21px, 23px, 27px in spacing
    const arbitrarySpacingRegex =
      /(?:margin(?:-(?:top|bottom|left|right|inline|block))?|padding(?:-(?:top|bottom|left|right|inline|block))?|gap|row-gap|column-gap)\s*:[^;]*?\b(1[13579]|2[13579]|3[13579]|7|9|13|17|23|27)px\b/gi;
    let match: RegExpExecArray | null;
    while ((match = arbitrarySpacingRegex.exec(content)) !== null) {
      const val = match[1]!;
      const unitStr = `${val}px`;
      if (allowedUnits.has(unitStr) || allowedUnits.has(val)) continue;

      const line = lineOffset + this.getLineNumber(content, match.index) - 1;
      this.addViolation({
        ruleId: 'non-standard-spacing-unit',
        severity: 'error',
        message: `Valor de espaciado arbitrario (${unitStr}) fuera de escala estándar o sin token de diseño`,
        file: relPath,
        line
      });
    }
  }

  private auditMissingThemeTokenUsage(
    relPath: string,
    content: string,
    lineOffset: number = 1,
    isScoped: boolean = false
  ): void {
    if (content.includes('theme-token-ok')) return;
    const config = getAuditConfig(this.projectRoot);
    if (isScoped && config.scssArchitecture?.allowScopedColors) return;

    // Detect hardcoded hex colors or rgb(...) in color properties without var(--...)
    const hardcodedColorRegex =
      /(?:color|background-color|background|border-color|fill|stroke)\s*:\s*([^;{}]*)/gi;
    let match: RegExpExecArray | null;
    while ((match = hardcodedColorRegex.exec(content)) !== null) {
      const val = match[1] ?? '';
      if (
        val.includes('var(') ||
        val.includes('$') ||
        val.includes('transparent') ||
        val.includes('currentColor') ||
        val.includes('inherit')
      ) {
        continue;
      }
      const hasHex = /#[0-9a-f]{3,8}\b/i.test(val);
      const hasRgb = /\brgba?\([^)]+\)/.test(val);
      if (hasHex || hasRgb) {
        const line = lineOffset + this.getLineNumber(content, match.index) - 1;
        this.addViolation({
          ruleId: 'missing-theme-token-usage',
          severity: 'error',
          message:
            'Color hexadecimal o rgb hardcodeado sin utilizar variable o token del sistema de diseño',
          file: relPath,
          line
        });
      }
    }
  }

  private isLineNestingExempt(rawLines: readonly string[], index: number): boolean {
    const rawLine = rawLines[index] ?? '';
    const prevRawLine = index > 0 ? (rawLines[index - 1] ?? '') : '';
    return rawLine.includes('scss-nesting-ok') || prevRawLine.includes('scss-nesting-ok');
  }

  private processScssLineBraces(
    line: string,
    blockStack: Array<'selector' | 'atrule'>,
    maxAllowedDepth: number,
    onViolation: (depth: number) => void
  ): void {
    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '{') {
        const preceding = line.slice(0, c).trim();
        const isAtRule = preceding.startsWith('@');
        blockStack.push(isAtRule ? 'atrule' : 'selector');

        if (!isAtRule) {
          const selectorDepth = blockStack.filter((b) => b === 'selector').length;
          if (selectorDepth > maxAllowedDepth) {
            onViolation(selectorDepth);
          }
        }
      } else if (char === '}') {
        blockStack.pop();
      }
    }
  }

  private auditExcessiveScssNesting(
    relPath: string,
    content: string,
    lineOffset: number = 1,
    isScoped: boolean = false
  ): void {
    if (content.includes('scss-nesting-ok')) return;

    const config = getAuditConfig(this.projectRoot);
    const maxAllowedDepth = isScoped
      ? (config.scssArchitecture?.scopedMaxNestingDepth ?? 4)
      : (config.scssArchitecture?.maxNestingDepth ?? 3);

    const cleanContent = stripCommentsAndStrings(content);
    const lines = cleanContent.split('\n');
    const rawLines = content.split('\n');
    const blockStack: Array<'selector' | 'atrule'> = [];

    for (let i = 0; i < lines.length; i++) {
      if (this.isLineNestingExempt(rawLines, i)) continue;

      this.processScssLineBraces(lines[i]!, blockStack, maxAllowedDepth, (depth) => {
        this.addViolation({
          ruleId: 'excessive-scss-nesting',
          severity: 'error',
          message: `Anidamiento SCSS excesivo (${depth} niveles > ${maxAllowedDepth}); aplanar selectores con BEM o clases semánticas`,
          file: relPath,
          line: lineOffset + i
        });
      });
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateScssArchitectureAuditor());
