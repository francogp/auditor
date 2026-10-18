/**
 * packages/auditor/src/suites/architecture/validate_stylelint.ts
 *
 * STYLELINT CSS & SCSS HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Audits stylesheets, component styles, and Vue 3 SFCs (<style scoped lang="scss">)
 * using the official Stylelint engine with stylelint-config-standard-scss,
 * stylelint-config-standard-vue, and stylelint-order.
 *
 * Performance:
 *   - Ephemeral content-hashed caching at scratch/cache/stylelint_cache.json
 *   - Multithreaded orchestration via audit_full master runner
 *   - Zero false positives on SCSS nesting, mixins, or scoped components
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* src/suites/architecture/validate_stylelint.ts
 *   npm run validate:stylelint
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import stylelint, { type LinterResult, type LintResult } from 'stylelint';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  CANONICAL_IGNORE_DIRS,
  collectRepositoryFiles,
  createRuleCapabilities
} from '../../core/auditorBase.ts';
import type { GitIgnoreRequirement, FindingSeverity } from '../../core/auditContract.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { deriveCoverageFromRoots } from '../../core/auditCoverage.ts';
import { normalizePosixPath } from '../../core/reportUtils.ts';
import { sassTrapsPlugin, SASS_TRAPS_RULE_NAME } from './stylelintSassTrapsPlugin.ts';

enableCompileCache();

export const STYLELINT_RULES = [
  'stylelint-issue',
  'css-duplicate-selectors',
  'css-duplicate-properties',
  'css-empty-blocks',
  'css-order-violation',
  'scss-syntax-issue',
  'scss-sass-collision-casing',
  'scss-strict-values'
] as const;
export type StylelintRuleId = (typeof STYLELINT_RULES)[number];

export function resolveStylelintConfigFile(
  projectRoot: string,
  configuredConfigFile?: string
): string {
  if (configuredConfigFile) {
    const customCandidate = path.resolve(projectRoot, configuredConfigFile);
    if (fs.existsSync(customCandidate)) {
      return customCandidate;
    }
  }

  const candidateNames = [
    '.stylelintrc.json',
    '.stylelintrc.js',
    '.stylelintrc.cjs',
    '.stylelintrc.mjs',
    '.stylelintrc.yaml',
    '.stylelintrc.yml',
    'stylelint.config.js',
    'stylelint.config.cjs',
    'stylelint.config.mjs'
  ];

  for (const name of candidateNames) {
    const candidate = path.resolve(projectRoot, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const pkgJsonPath = path.resolve(projectRoot, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      if (pkg.stylelint) {
        return pkgJsonPath;
      }
    } catch {
      // catch-ok: Fall back to canonical auditor configuration
    }
  }

  // Canonical package fallback
  const canonicalConfig = path.resolve(import.meta.dirname, '../../../.stylelintrc.json');
  if (fs.existsSync(canonicalConfig)) {
    return canonicalConfig;
  }

  return '.stylelintrc.json';
}

export function categorizeStylelintRule(ruleName: string | undefined): StylelintRuleId {
  if (!ruleName) return 'stylelint-issue';
  if (ruleName === SASS_TRAPS_RULE_NAME) return 'scss-sass-collision-casing';
  if (ruleName === 'scale-unlimited/declaration-strict-value') return 'scss-strict-values';
  if (ruleName === 'no-duplicate-selectors') return 'css-duplicate-selectors';
  if (ruleName === 'declaration-block-no-duplicate-properties') return 'css-duplicate-properties';
  if (ruleName === 'block-no-empty') return 'css-empty-blocks';
  if (ruleName.startsWith('order/')) return 'css-order-violation';
  if (ruleName.startsWith('scss/')) return 'scss-syntax-issue';
  return 'stylelint-issue';
}

export function buildStylelintConfig(
  configFile: string,
  customRules?: Record<string, unknown>
): stylelint.Config {
  return {
    extends: [configFile],
    plugins: [sassTrapsPlugin],
    rules: {
      'function-name-case': [
        'lower',
        {
          ignoreFunctions: ['/^[A-Z]/', 'Drop-Shadow', 'Drop-shadow', 'hue-Rotate', 'Hue-Rotate']
        }
      ],
      'value-keyword-case': [
        'lower',
        {
          camelCaseSvgKeywords: true,
          ignoreProperties: ['/--.*/'],
          ignoreFunctions: ['v-bind']
        }
      ],
      [SASS_TRAPS_RULE_NAME]: true,
      ...customRules
    }
  };
}

export function buildStylelintIgnoreGlobs(
  configIgnoreGlobs?: readonly string[],
  stylelintIgnoreGlobs?: readonly string[]
): string[] {
  return [
    ...Array.from(CANONICAL_IGNORE_DIRS).map((d) => `${d}/**`),
    'dist/**',
    'dev-dist/**',
    'scratch/**',
    'tests/**',
    '**/*.spec.*',
    '**/*.test.*',
    ...(configIgnoreGlobs ?? []),
    ...(stylelintIgnoreGlobs ?? [])
  ];
}

interface StylelintViolationPayload {
  ruleId: StylelintRuleId;
  severity: FindingSeverity;
  file: string;
  line: number;
  message: string;
  context: string;
  fixable?: boolean;
}

export function repairDeprecatedWordBreak(content: string): { modified: boolean; content: string } {
  const pattern = /\bword-break\s*:\s*break-word(\s*!important)?\s*;/g;
  if (!pattern.test(content)) return { modified: false, content };
  const updated = content.replace(pattern, (_match, imp) => {
    return `overflow-wrap: break-word${imp ?? ''};`;
  });
  return { modified: true, content: updated };
}

const DEPRECATED_CSS_SCANNABLE_EXTENSIONS: ReadonlySet<string> = new Set<string>([
  '.css',
  '.scss',
  '.sass',
  '.vue'
]);

export function repairDeprecatedCssPropertiesInRoots(
  projectRoot: string,
  roots: readonly string[]
): number {
  let repairedCount = 0;
  for (const root of roots) {
    const fullRoot = path.resolve(projectRoot, root);
    if (!fs.existsSync(fullRoot)) continue;
    const files = collectRepositoryFiles(
      fullRoot,
      projectRoot,
      [],
      DEPRECATED_CSS_SCANNABLE_EXTENSIONS
    );
    for (const filePath of files) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const { modified, content } = repairDeprecatedWordBreak(raw);
        if (modified) {
          fs.writeFileSync(filePath, content, 'utf8');
          repairedCount++;
        }
      } catch {
        // catch-ok: Ignore unreadable files during repair pass
      }
    }
  }
  return repairedCount;
}

export const STYLELINT_BUILTIN_FIXABLE_RULES = [
  'alpha-value-notation',
  'at-rule-empty-line-before',
  'at-rule-no-vendor-prefix',
  'color-function-alias-notation',
  'color-function-notation',
  'color-hex-length',
  'comment-empty-line-before',
  'comment-whitespace-inside',
  'custom-property-empty-line-before',
  'declaration-block-no-duplicate-properties',
  'declaration-block-no-redundant-longhand-properties',
  'declaration-empty-line-before',
  'declaration-property-value-keyword-no-deprecated',
  'display-notation',
  'font-family-name-quotes',
  'font-weight-notation',
  'function-calc-no-unspaced-operator',
  'function-name-case',
  'function-url-quotes',
  'hue-degree-notation',
  'import-notation',
  'keyframe-selector-notation',
  'length-zero-no-unit',
  'lightness-notation',
  'media-feature-name-no-vendor-prefix',
  'media-feature-range-notation',
  'property-layout-mappings',
  'property-no-vendor-prefix',
  'relative-selector-nesting-notation',
  'rule-empty-line-before',
  'selector-attribute-quotes',
  'selector-no-vendor-prefix',
  'selector-not-notation',
  'selector-pseudo-element-colon-notation',
  'selector-type-case',
  'shorthand-property-no-redundant-values',
  'unit-layout-mappings',
  'value-keyword-case',
  'value-keyword-layout-mappings',
  'value-no-vendor-prefix'
] as const;

export type StylelintBuiltinFixableRule = (typeof STYLELINT_BUILTIN_FIXABLE_RULES)[number];

const STYLELINT_BUILTIN_FIXABLE_SET: ReadonlySet<string> = new Set<string>(
  STYLELINT_BUILTIN_FIXABLE_RULES
); // no-domain: O(1) fast lookup Set derived from canonical as const array

export const STYLELINT_ORDER_FIXABLE_RULES = [
  'order/order',
  'order/properties-order',
  'order/properties-alphabetical-order',
  'order/custom-properties-alphabetical-order'
] as const;

export type StylelintOrderFixableRule = (typeof STYLELINT_ORDER_FIXABLE_RULES)[number];

const STYLELINT_ORDER_FIXABLE_SET: ReadonlySet<string> = new Set<string>(
  STYLELINT_ORDER_FIXABLE_RULES
); // no-domain: O(1) fast lookup Set derived from canonical as const array

export function isStylelintRuleFixable(ruleName: string | undefined): boolean {
  if (!ruleName) return false;
  if (ruleName === SASS_TRAPS_RULE_NAME) return true;
  if (STYLELINT_ORDER_FIXABLE_SET.has(ruleName)) return true;
  if (STYLELINT_BUILTIN_FIXABLE_SET.has(ruleName)) return true;
  return false;
}

export function processStylelintResults(
  results: readonly LintResult[],
  projectRoot: string,
  isFixMode = false
): { violations: StylelintViolationPayload[]; totalErrors: number; totalWarnings: number } {
  let totalWarnings = 0;
  let totalErrors = 0;
  const violations: StylelintViolationPayload[] = [];

  for (const fileResult of results) {
    const relFile = normalizePosixPath(fileResult.source ?? '', projectRoot);

    for (const warning of fileResult.warnings) {
      const ruleId = categorizeStylelintRule(warning.rule);
      const severity = warning.severity === 'error' ? 'error' : 'warning';

      if (severity === 'error') {
        totalErrors++;
      } else {
        totalWarnings++;
      }

      const isFixable = isFixMode
        ? false
        : Boolean(warning.fix) || isStylelintRuleFixable(warning.rule);

      violations.push({
        ruleId,
        severity,
        file: relFile,
        line: warning.line || 1,
        message: warning.text,
        context: warning.rule || 'stylelint',
        fixable: isFixable
      });
    }
  }

  return { violations, totalErrors, totalWarnings };
}

export function persistStylelintReport(
  projectRoot: string,
  suiteId: string,
  filesScanned: number,
  totals: { totalErrors: number; totalWarnings: number },
  results: readonly LintResult[],
  durationMs: number
): void {
  const reportDir = path.resolve(projectRoot, 'scratch/audits/architecture');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportFile = path.resolve(reportDir, `${suiteId}.json`);
  try {
    fs.writeFileSync(
      reportFile,
      JSON.stringify(
        {
          summary: {
            filesScanned,
            totalErrors: totals.totalErrors,
            totalWarnings: totals.totalWarnings,
            durationMs
          },
          results: results.map((r: LintResult) => ({
            source: normalizePosixPath(r.source ?? '', projectRoot),
            errored: r.errored,
            warnings: r.warnings
          }))
        },
        null,
        2
      ),
      'utf-8'
    );
  } catch {
    // catch-ok: Scratch report persistence is non-fatal
  }
}

export interface StylelintAuditorOptions {
  projectRoot?: string;
  id?: string;
  name?: string;
}

export class StylelintAuditor extends BaseAuditor<StylelintRuleId> {
  private lastLinterResult: LinterResult | null = null;

  public static readonly gitIgnoreEntries: readonly GitIgnoreRequirement[] = [
    {
      id: '.stylelintcache',
      pattern: '.stylelintcache',
      samplePath: '.stylelintcache',
      reason: 'Archivo de caché incremental generado por Stylelint',
      isApplicable: (config) =>
        config.styles?.stylelint?.enabled !== false && config.stylelint?.enabled !== false
    }
  ];

  constructor(options?: StylelintAuditorOptions) {
    const projectRoot = options?.projectRoot;
    const config = getAuditConfig(projectRoot);
    const roots = Array.from(
      new Set([...(config.paths.srcRoots ?? []), ...(config.paths.stylesRoots ?? [])])
    );

    super({
      usesThirdPartyTool: true,
      thirdPartyToolPolicy: {
        toolName: 'Stylelint',
        fallbackBehavior: 'violation',
        fallbackRuleId: 'stylelint-issue'
      },
      ruleCapabilities: createRuleCapabilities(
        STYLELINT_RULES,
        {
          speed: 'light',
          phase: 'normal',
          fix: 'normal',
          md: false,
          ast: false,
          changedOnly: false,
          critical: true
        },
        [...STYLELINT_RULES]
      ),
      fixableRuleIds: [...STYLELINT_RULES],
      gitIgnoreEntries: StylelintAuditor.gitIgnoreEntries,
      id: options?.id || 'validate_stylelint',
      name: options?.name || 'Stylelint & SCSS Hygiene Validator',
      description: 'Audita calidad, sintaxis y patrones CSS/SCSS con Stylelint',
      family: 'architecture',
      packageName: 'Stylelint',
      configKey: 'stylelint.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '🎨',
      ruleIds: STYLELINT_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(STYLELINT_RULES, 'hygiene'),
      ruleDescriptions: {
        'stylelint-issue': 'Violación de estándar CSS o SCSS',
        'css-duplicate-selectors': 'Selectores duplicados en el bloque',
        'css-duplicate-properties': 'Propiedades duplicadas en la regla',
        'css-empty-blocks': 'Bloques de estilos vacíos',
        'css-order-violation': 'Orden de propiedades CSS',
        'scss-syntax-issue': 'Sintaxis SCSS inválida o desconocida',
        'scss-sass-collision-casing': 'Función CSS colisiona con Sass',
        'scss-strict-values': 'Valores no estrictos en SCSS'
      },
      ruleRemediations: {
        'stylelint-issue':
          '📖 GUÍA DE REMEDIACIÓN: stylelint-issue\n' +
          '1. Causa Raíz: Se detectó una infracción a las reglas estándar de hojas de estilo configuradas en .stylelintrc.json (selectores desconocidos, unidades inválidas o directivas no conformes).\n' +
          '2. Diagnóstico: Revisa el mensaje exacto de Stylelint en el reporte para identificar la regla específica (ej: selector-class-pattern, property-no-unknown).\n' +
          '3. Solución: Ejecuta "npm run auditor:fix" o "npm run auditor:css:fix" para corregir problemas automáticamente. Si la regla no es auto-reparable, edita el estilo según el estándar CSS/SCSS moderno.',
        'css-duplicate-selectors':
          '📖 GUÍA DE REMEDIACIÓN: css-duplicate-selectors\n' +
          '1. Causa Raíz: Se declaró el mismo selector CSS o SCSS múltiples veces dentro del mismo bloque o archivo. Esto fragmenta la definición de estilos y genera sobreescrituras difíciles de depurar.\n' +
          '2. Diagnóstico: Busca el selector duplicado indicado en la línea reportada y su ocurrencia previa.\n' +
          '3. Solución: Fusiona las propiedades de ambos bloques en una única regla consolidada.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: .badge { color: red; } ... .badge { padding: 4px; }\n' +
          '   ✅ Correcto:   .badge { color: red; padding: 4px; }',
        'css-duplicate-properties':
          '📖 GUÍA DE REMEDIACIÓN: css-duplicate-properties\n' +
          '1. Causa Raíz: Una misma regla de estilo declara la misma propiedad CSS dos veces con valores repetidos o contradictorios.\n' +
          '2. Diagnóstico: Revisa las declaraciones dentro del bloque señalado.\n' +
          '3. Solución: Elimina la propiedad duplicada o redundante conservando únicamente la que debe aplicarse.',
        'css-empty-blocks':
          '📖 GUÍA DE REMEDIACIÓN: css-empty-blocks\n' +
          '1. Causa Raíz: Se detectó un bloque de estilos completamente vacío (sin declaraciones de propiedades).\n' +
          '2. Diagnóstico: Busca selectores con llaves vacías { } en el archivo reportado.\n' +
          '3. Solución: Elimina el bloque de selector innecesario o añade las propiedades requeridas.',
        'css-order-violation':
          '📖 GUÍA DE REMEDIACIÓN: css-order-violation\n' +
          '1. Causa Raíz: Las propiedades CSS dentro del bloque no siguen el orden canónico establecido en el proyecto (posicionamiento -> caja/dimensiones -> tipografía -> visuales/color -> animaciones).\n' +
          '2. Diagnóstico: Revisa la secuencia de propiedades en la regla señalada.\n' +
          '3. Solución: Ejecuta "npm run auditor:fix" para reordenar las propiedades automáticamente.',
        'scss-syntax-issue':
          '📖 GUÍA DE REMEDIACIÓN: scss-syntax-issue\n' +
          '1. Causa Raíz: Se detectó un error sintáctico al parsear el archivo SCSS o bloque <style lang="scss"> de Vue (llaves sin cerrar, directiva @include rota o interpolación inválida).\n' +
          '2. Diagnóstico: Revisa la línea reportada y verifica el anidamiento de llaves con el compilador sass-embedded.\n' +
          '3. Solución: Corrige la sintaxis SCSS para que compile limpiamente.',
        'scss-sass-collision-casing':
          '📖 GUÍA DE REMEDIACIÓN: scss-sass-collision-casing\n' +
          '1. Causa Raíz: Se utilizó una función CSS nativa con un nombre que colisiona con funciones globales de Sass (como min(), max(), color(), invert()).\n' +
          '2. Diagnóstico: Revisa si la función matemática o de color es interpretada por Sass en lugar de emitirse como CSS nativo.\n' +
          '3. Solución: Utiliza el módulo Sass calificado (ej: math.min() con @use "sass:math") o escribe la función CSS en mayúsculas/minúsculas según la convención de escape.',
        'scss-strict-values':
          '📖 GUÍA DE REMEDIACIÓN: scss-strict-values\n' +
          '1. Causa Raíz: Se utilizaron valores numéricos o colores hexadecimales literales en propiedades CSS que deben gobernarse estrictamente mediante design tokens o variables del sistema (colores, espaciados, font-size, z-index, border-radius).\n' +
          '2. Diagnóstico: Busca valores como #ff0000, 16px, 9999 o 8px en propiedades restringidas por stylelint-declaration-strict-value.\n' +
          '3. Solución: Reemplaza el literal crudo por la variable SCSS o variable CSS correspondiente (ej: $color-danger, var(--font-size-md), $z-modal, var(--radius-sm)).\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: .btn { background-color: #2563eb; font-size: 14px; }\n' +
          '   ✅ Correcto:   .btn { background-color: $color-primary; font-size: var(--font-size-sm); }'
      },
      coverage: {
        include: [
          ...deriveCoverageFromRoots(
            roots,
            new Set(['.css', '.scss', '.sass', '.vue']),
            projectRoot
          ).include,
          '.stylelintrc*',
          'stylelint.config.*'
        ],
        exclude: [
          'node_modules/**',
          'dist/**',
          'scratch/**',
          'tests/**',
          '**/*.spec.*',
          '**/*.test.*'
        ],
        source: 'runtime'
      },
      roots,
      projectRoot
    });
  }

  public getLastLinterResult(): LinterResult | null {
    return this.lastLinterResult;
  }

  public override async runAudit(): Promise<void> {
    if (this.isSuiteGatingDisabled('Stylelint desactivado en config')) return;

    const config = getAuditConfig(this.projectRoot);
    const stylelintConfig = config.stylelint ?? config.styles?.stylelint;

    const roots = this.roots.length > 0 ? this.roots : ['src'];
    this.redeclareCoverage({
      include: [
        ...deriveCoverageFromRoots(
          roots,
          new Set(['.css', '.scss', '.sass', '.vue']),
          this.projectRoot
        ).include,
        '.stylelintrc*',
        'stylelint.config.*'
      ],
      exclude: [
        'node_modules/**',
        'dist/**',
        'scratch/**',
        'tests/**',
        '**/*.spec.*',
        '**/*.test.*'
      ],
      source: 'runtime'
    });

    const configFile = resolveStylelintConfigFile(this.projectRoot, stylelintConfig?.configFile);
    if (fs.existsSync(configFile)) {
      const relConfig = normalizePosixPath(configFile, this.projectRoot);
      if (!relConfig.startsWith('..')) {
        this.recordScanned(configFile);
      }
    }
    const isFixMode = this.isFixModeRequested();

    const cacheDir = path.resolve(this.projectRoot, 'scratch/cache');
    const cacheLocation = path.resolve(cacheDir, 'stylelint_cache.json');
    fs.mkdirSync(cacheDir, { recursive: true });

    const filesGlobs = roots.map(
      (r) => `${normalizePosixPath(r, this.projectRoot)}/**/*.{css,scss,sass,vue}`
    );
    const ignoreGlobs = buildStylelintIgnoreGlobs(
      config.paths.ignoreGlobs,
      stylelintConfig?.ignoreGlobs
    );
    const lintConfig = buildStylelintConfig(configFile, stylelintConfig?.rules);

    if (isFixMode) {
      repairDeprecatedCssPropertiesInRoots(this.projectRoot, roots);
    }

    let linterResult: LinterResult | undefined;
    try {
      linterResult = await stylelint.lint({
        files: filesGlobs,
        globbyOptions: {
          cwd: this.projectRoot,
          ignore: ignoreGlobs
        },
        config: lintConfig,
        cache: true,
        cacheLocation,
        cacheStrategy: 'content',
        fix: isFixMode,
        allowEmptyInput: true
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.addViolation({
        ruleId: 'stylelint-issue',
        severity: 'error',
        file: configFile,
        line: 1,
        message: `Fallo al ejecutar Stylelint: ${errorMsg}`,
        context: 'stylelint-engine-error'
      });
      for (const r of STYLELINT_RULES) {
        if (r !== 'stylelint-issue') this.markRuleEvaluated(r);
      }
      return;
    }

    if (!linterResult) return;

    this.lastLinterResult = linterResult;
    for (const fileResult of linterResult.results) {
      if (fileResult.source) {
        this.recordScanned(fileResult.source);
      }
    }

    const { violations, totalErrors, totalWarnings } = processStylelintResults(
      linterResult.results,
      this.projectRoot,
      isFixMode
    );
    for (const ruleId of STYLELINT_RULES) {
      this.runSubAuditorSync(ruleId, () => {
        for (const v of violations) {
          if (v.ruleId === ruleId) {
            this.addViolation(isFixMode ? { ...v, fixable: false } : v);
          }
        }
      });
    }

    persistStylelintReport(
      this.projectRoot,
      this.id,
      this.filesScannedCount,
      { totalErrors, totalWarnings },
      linterResult.results,
      Math.round(this.durationsByRule.get('stylelint-issue') ?? 0)
    );

    this.context.setMetric('Archivos Escaneados', this.filesScannedCount);
    this.context.setMetric('Errores CSS', totalErrors);
    this.context.setMetric('Advertencias CSS', totalWarnings);
    this.context.setMetric('Modo', isFixMode ? 'fix' : 'check');
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new StylelintAuditor());
