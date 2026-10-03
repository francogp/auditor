/**
 * packages/auditor/src/suites/architecture/validate_css_duplicates.ts
 *
 * CSS & SCSS HYGIENE AND DUPLICATION AUDITOR (Node.js 26+ Native)
 *
 * Powered by Stylelint engine with Vue SFC and SCSS support.
 * Serves as standard auditor suite and backwards-compatible alias for validate_stylelint.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* src/suites/architecture/validate_css_duplicates.ts
 *   npm run validate:css-duplicates
 */

import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import {
  StylelintAuditor,
  type StylelintRuleId
} from './validate_stylelint.ts';

enableCompileCache();

export type CssDuplicatesRuleId = StylelintRuleId;
export const CSS_DUPLICATES_RULES: readonly CssDuplicatesRuleId[] = [
  'stylelint-issue',
  'css-duplicate-selectors',
  'css-duplicate-properties',
  'css-empty-blocks',
  'css-order-violation',
  'scss-syntax-issue'
] as const;

export class CssDuplicatesAuditor extends BaseAuditor<CssDuplicatesRuleId> {
private readonly stylelintAuditor: StylelintAuditor;

  constructor(_targetDir = '.', projectRoot?: string) {
    const config = getAuditConfig(projectRoot);
    const roots = config.paths.srcRoots ?? ['src'];

    super({
id: 'validate_css_duplicates',
      name: 'CSS Duplication & Hygiene Validator',
      description: 'Audita calidad, sintaxis y patrones CSS/SCSS con Stylelint',
      family: 'architecture',
      ruleIds: CSS_DUPLICATES_RULES,
      packageName: 'Stylelint',
      icon: '🎨',
      ruleDescriptions: {
        'stylelint-issue': 'Violación de estándar CSS o SCSS',
        'css-duplicate-selectors': 'Selectores duplicados en el bloque',
        'css-duplicate-properties': 'Propiedades duplicadas en la regla',
        'css-empty-blocks': 'Bloques de estilos vacíos',
        'css-order-violation': 'Orden de propiedades CSS',
        'scss-syntax-issue': 'Sintaxis SCSS inválida o desconocida'
      },
      roots,
      projectRoot
    });

    this.stylelintAuditor = new StylelintAuditor({
      projectRoot,
      id: 'validate_css_duplicates',
      name: 'CSS Duplication & Hygiene Validator'
    });
  }

  public override async runAudit(): Promise<void> {
    const res = await this.stylelintAuditor.execute();
    this.importAuditFindings(res.findings, 'stylelint-issue');
    this.filesScannedCount = this.stylelintAuditor.getFilesScanned();
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new CssDuplicatesAuditor());
