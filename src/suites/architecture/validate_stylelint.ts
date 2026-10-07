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
import { BaseAuditor, CANONICAL_IGNORE_DIRS } from '../../core/auditorBase.ts';
import type { GitIgnoreRequirement, FindingSeverity } from '../../core/auditContract.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
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
  'scss-sass-collision-casing'
] as const;
export type StylelintRuleId = (typeof STYLELINT_RULES)[number];

export function resolveStylelintConfigFile(projectRoot: string, configuredConfigFile?: string): string {
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
  if (ruleName === 'no-duplicate-selectors') return 'css-duplicate-selectors';
  if (ruleName === 'declaration-block-no-duplicate-properties') return 'css-duplicate-properties';
  if (ruleName === 'block-no-empty') return 'css-empty-blocks';
  if (ruleName.startsWith('order/')) return 'css-order-violation';
  if (ruleName.startsWith('scss/')) return 'scss-syntax-issue';
  return 'stylelint-issue';
}

export function buildStylelintConfig(configFile: string, customRules?: Record<string, unknown>): stylelint.Config {
  return {
    extends: [configFile],
    plugins: [sassTrapsPlugin],
    rules: {
      'function-name-case': [
        'lower',
        {
          ignoreFunctions: [
            '/^[A-Z]/',
            'Drop-Shadow',
            'Drop-shadow',
            'hue-Rotate',
            'Hue-Rotate'
          ]
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
      ...(customRules ?? {})
    }
  };
}

export function buildStylelintIgnoreGlobs(
  configIgnoreGlobs?: readonly string[],
  stylelintIgnoreGlobs?: readonly string[]
): string[] {
  return [
    ...Array.from(CANONICAL_IGNORE_DIRS).map(d => `${d}/**`),
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
}

export function processStylelintResults(
  results: readonly LintResult[],
  projectRoot: string
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

      violations.push({
        ruleId,
        severity,
        file: relFile,
        line: warning.line || 1,
        message: warning.text,
        context: warning.rule || 'stylelint'
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
      isApplicable: (config) => config.styles?.stylelint?.enabled !== false && config.stylelint?.enabled !== false
    }
  ];

  constructor(options?: StylelintAuditorOptions) {
    const projectRoot = options?.projectRoot;
    const config = getAuditConfig(projectRoot);
    const roots = config.paths.srcRoots ?? ['src'];

    super({
      capabilities: { fix: true, lint: true },
      gitIgnoreEntries: StylelintAuditor.gitIgnoreEntries,
      id: options?.id || 'validate_stylelint',
      name: options?.name || 'Stylelint & SCSS Hygiene Validator',
      description: 'Audita calidad, sintaxis y patrones CSS/SCSS con Stylelint',
      family: 'architecture',
      packageName: 'Stylelint',
      configKey: 'stylelint.enabled',
      defaultConfig: { enabled: true },
      icon: '🎨',
      ruleIds: STYLELINT_RULES,
      ruleDescriptions: {
        'stylelint-issue': 'Violación de estándar CSS o SCSS',
        'css-duplicate-selectors': 'Selectores duplicados en el bloque',
        'css-duplicate-properties': 'Propiedades duplicadas en la regla',
        'css-empty-blocks': 'Bloques de estilos vacíos',
        'css-order-violation': 'Orden de propiedades CSS',
        'scss-syntax-issue': 'Sintaxis SCSS inválida o desconocida',
        'scss-sass-collision-casing': 'Función CSS colisiona con Sass'
      },
      coverage: {
        include: ['src/**/*.{css,scss,sass,vue}', '.stylelintrc*', 'stylelint.config.*'],
        exclude: ['node_modules/**', 'dist/**', 'scratch/**', 'tests/**', '**/*.spec.*', '**/*.test.*'],
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
    const startTime = performance.now();
    if (this.isSuiteGatingDisabled('Stylelint desactivado en config')) return;

    const config = getAuditConfig(this.projectRoot);
    const stylelintConfig = config.stylelint ?? config.styles?.stylelint;

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

    const roots = this.roots.length > 0 ? this.roots : ['src'];
    const filesGlobs = roots.map(r => `${normalizePosixPath(r, this.projectRoot)}/**/*.{css,scss,sass,vue}`);
    const ignoreGlobs = buildStylelintIgnoreGlobs(config.paths.ignoreGlobs, stylelintConfig?.ignoreGlobs);
    const lintConfig = buildStylelintConfig(configFile, stylelintConfig?.rules);

    let linterResult: LinterResult;
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
      return;
    }

    this.lastLinterResult = linterResult;
    for (const r of STYLELINT_RULES) {
      this.markRuleEvaluated(r);
    }
    for (const fileResult of linterResult.results) {
      if (fileResult.source) {
        this.recordScanned(fileResult.source);
      }
    }

    const { violations, totalErrors, totalWarnings } = processStylelintResults(linterResult.results, this.projectRoot);
    for (const v of violations) {
      this.addViolation(v);
    }

    persistStylelintReport(
      this.projectRoot,
      this.id,
      this.filesScannedCount,
      { totalErrors, totalWarnings },
      linterResult.results,
      Math.round(performance.now() - startTime)
    );

    this.context.setMetric('Archivos Escaneados', this.filesScannedCount);
    this.context.setMetric('Errores CSS', totalErrors);
    this.context.setMetric('Advertencias CSS', totalWarnings);
    this.context.setMetric('Modo', isFixMode ? 'fix' : 'check');
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new StylelintAuditor());
