/**
 * scripts/auditors/architecture/validate_css_duplicates.ts
 *
 * CSS & SCSS HYGIENE AND DUPLICATION AUDITOR (Node.js 26+ Native)
 *
 * Audits stylesheets, component styles, and Vue SFC style blocks using pure PostCSS AST
 * to detect duplicated CSS rules, similar classes, unvariabled colors, long values,
 * duplicate selectors, and empty rule blocks.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* src/suites/architecture/validate_css_duplicates.ts
 *   npm run validate:css-duplicates
 */

import { enableCompileCache } from 'node:module';
import { BaseAuditor, CANONICAL_IGNORE_DIRS } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import {
  runCssAnalysis,
  type CssAnalysisDetails,
  type CssAnalysisOptions
} from '../../analyzers/cssAnalyzer.ts';

enableCompileCache();

export type CssDuplicatesRuleId =
  | 'css-duplicate-rules'
  | 'css-similar-classes'
  | 'css-duplicate-long-lines'
  | 'css-unvariabled-colors'
  | 'css-duplicate-selectors'
  | 'css-empty-rules';

export const CSS_DUPLICATES_RULES: readonly CssDuplicatesRuleId[] = [
  'css-duplicate-rules',
  'css-similar-classes',
  'css-duplicate-long-lines',
  'css-unvariabled-colors',
  'css-duplicate-selectors',
  'css-empty-rules'
] as const;

export interface CssAuditJsonResult {
  readonly summary: {
    readonly filesScanned: number;
    readonly totalErrors: number;
    readonly totalWarnings: number;
    readonly durationMs: number;
    readonly countsByRule: Record<CssDuplicatesRuleId, number>;
  };
  readonly findings: readonly {
    readonly ruleId: string;
    readonly ruleDescription?: string;
    readonly severity: 'error' | 'warning';
    readonly file: string;
    readonly line: number;
    readonly message: string;
    readonly context: string;
  }[];
  readonly details: CssAnalysisDetails;
}

export class CssDuplicatesAuditor extends BaseAuditor<CssDuplicatesRuleId> {
  private readonly targetDir: string;
  private lastAnalysisDetails: CssAnalysisDetails | null = null;

  constructor(targetDir = '.', projectRoot?: string) {
    const config = getAuditConfig(projectRoot);
    super({
      id: 'validate_css_duplicates',
      name: 'CSS Duplication & Hygiene Validator',
      description: 'Audita calidad, duplicación y patrones en estilos CSS y SCSS',
      family: 'architecture',
      ruleIds: CSS_DUPLICATES_RULES,
      packageName: 'CSS',
      ruleDescriptions: {
        'css-duplicate-rules': 'Reglas duplicadas en estilos',
        'css-similar-classes': 'Clases similares sin unificar',
        'css-duplicate-long-lines': 'Valores largos duplicados',
        'css-unvariabled-colors': 'Colores repetidos sin variable',
        'css-duplicate-selectors': 'Selectores duplicados',
        'css-empty-rules': 'Bloques de estilos vacíos'
      },
      roots: config.paths.srcRoots ?? ['src'],
      projectRoot
    });
    this.targetDir = targetDir;
  }

  public getAnalysisDetails(): CssAnalysisDetails | null {
    return this.lastAnalysisDetails;
  }

  public override async runAudit(): Promise<void> {
    const config = getAuditConfig(this.projectRoot);
    const options: CssAnalysisOptions = config.styles?.duplicates ?? {};

    const { violations, details, filesScanned } = await runCssAnalysis(
      this.targetDir,
      new Set(CANONICAL_IGNORE_DIRS),
      options,
      this.projectRoot
    );

    this.filesScannedCount = filesScanned;
    this.lastAnalysisDetails = details;

    for (const v of violations) {
      let ruleId: CssDuplicatesRuleId = 'css-duplicate-rules';
      if (v.message.startsWith('Clases CSS similares')) {
        ruleId = 'css-similar-classes';
      } else if (v.message.startsWith('Valor CSS largo duplicado')) {
        ruleId = 'css-duplicate-long-lines';
      } else if (v.message.startsWith('Color repetido sin variable')) {
        ruleId = 'css-unvariabled-colors';
      } else if (v.message.startsWith('Selector duplicado')) {
        ruleId = 'css-duplicate-selectors';
      } else if (v.message.startsWith('Bloque CSS vacío')) {
        ruleId = 'css-empty-rules';
      }

      this.addViolation({
        ruleId,
        severity: v.severity || 'error',
        file: v.file,
        line: v.line || 1,
        message: v.message,
        context: v.context
      });
    }

    this.context.setMetric('Violaciones Detectadas', violations.length);
    this.context.setMetric('Reglas Duplicadas', details.duplicates.length);
    this.context.setMetric('Clases Similares', details.similar.length);
    this.context.setMetric('Valores Largos', details.longValues.length);
    this.context.setMetric('Colores sin Variable', details.unvariabledColors.length);
    this.context.setMetric('Selectores Duplicados', details.duplicateSelectors.length);
    this.context.setMetric('Reglas Vacías', details.emptyRules.length);
  }
}

if (process.argv[1] && (
  process.argv[1].endsWith('validate_css_duplicates.ts') ||
  (typeof import.meta.filename === 'string' && process.argv[1] === import.meta.filename)
)) {
  await BaseAuditor.runCli(new CssDuplicatesAuditor());
}
