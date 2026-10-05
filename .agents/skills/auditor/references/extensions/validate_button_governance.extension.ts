/**
 * scripts/auditors/extensions/validate_button_governance.extension.ts
 *
 * ENTERPRISE BUTTON GOVERNANCE EXTENSION AUDITOR (Node.js 26+ Native)
 *
 * Extracted from @francogp/auditor core as a host-specific architecture extension.
 * Enforces UI Architecture Governance (Button Rule 23):
 *   1. Anti-clipping perimetral 360° border on buttons in _buttons.scss (no border-bottom-color).
 *   2. Anti-cutoff uniform inset shadows in _buttons.scss (no negative inset 0 -Npx).
 *   3. Prohibition of ad-hoc .btn style overrides in component <style> blocks.
 *   4. Canonical button variants only (btn-primary, btn-secondary, btn-dark, btn-3d, etc.).
 *
 * Usage in .auditor/audit.config.ts:
 *   import { ButtonGovernanceAuditor } from '../scripts/auditors/extensions/validate_button_governance.extension.ts';
 *   export default defineAuditConfig({
 *     extensions: [new ButtonGovernanceAuditor()]
 *   });
 */

import fs from 'node:fs';
import path from 'node:path';
import { BaseAuditor, getAuditConfig } from '@francogp/auditor';

export type ButtonGovernanceRuleId =
  | 'ad-hoc-button-styles'
  | 'button-border-clipping'
  | 'button-inset-cutoff';

export const BUTTON_GOVERNANCE_RULES: readonly ButtonGovernanceRuleId[] = [
  'ad-hoc-button-styles',
  'button-border-clipping',
  'button-inset-cutoff'
] as const;

export class ButtonGovernanceAuditor extends BaseAuditor<ButtonGovernanceRuleId> {
  constructor(projectRoot: string = process.cwd()) {
    super({
      id: 'validate_button_governance',
      name: 'Button Governance Validator (Rule 23)',
      description: 'Valida gobernanza de botones y variantes canónicas',
      icon: '🔘',
      family: 'architecture',
      ruleIds: BUTTON_GOVERNANCE_RULES,
      packageName: 'Botones',
      ruleDescriptions: {
        'ad-hoc-button-styles': 'Sobreescritura ad-hoc de botón',
        'button-border-clipping': 'Borde inferior recortado en botón',
        'button-inset-cutoff': 'Sombra inset negativa en botón'
      },
      roots: ['src/components', 'src/views', 'src/styles'],
      allowedExtensions: new Set(['.vue', '.scss']),
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const config = getAuditConfig(this.projectRoot);
    const srcDir = path.resolve(this.projectRoot, config.paths.srcRoots?.[0] ?? 'src');
    const buttonsScssPath = path.join(srcDir, 'styles', '_buttons.scss');

    // 1. Verify _buttons.scss integrity
    if (fs.existsSync(buttonsScssPath)) {
      const btnContent = fs.readFileSync(buttonsScssPath, 'utf-8');
      const relButtons = path.relative(this.projectRoot, buttonsScssPath).replace(/\\/g, '/');
      this.recordScanned(relButtons);

      this.assertRule('button-border-clipping', !btnContent.includes('border-bottom-color'), {
        severity: 'error',
        file: relButtons,
        line: 1,
        message: 'Forbidden usage of "border-bottom-color" on buttons. All buttons must maintain continuous 360° perimeter borders.',
        context: 'border-bottom-color'
      });

      this.assertRule('button-inset-cutoff', !/inset\s+0\s+-[0-9]+px/i.test(btnContent), {
        severity: 'error',
        file: relButtons,
        line: 1,
        message: 'Forbidden negative vertical inset shadow on buttons simulating visual clipping.',
        context: 'inset 0 -Npx'
      });
    } else {
      this.markRuleNotApplicable('button-border-clipping', 'No _buttons.scss found in styles');
      this.markRuleNotApplicable('button-inset-cutoff', 'No _buttons.scss found in styles');
    }

    // 2. Audit Vue components for ad-hoc button classes
    const compFiles = this.context.collectFiles(
      [...(config.paths.componentsRoots ?? ['src/components']), ...(config.paths.viewsRoots ?? ['src/views'])],
      new Set(['.vue'])
    );
    this.markRuleEvaluated('ad-hoc-button-styles');

    const canonicalVariants = new Set([
      'btn-primary', 'btn-secondary', 'btn-dark', 'btn-success', 'btn-warning', 'btn-danger',
      'btn-sm', 'btn-md', 'btn-lg', 'btn-block', 'btn-3d', 'btn-icon',
      ...(config.styles?.canonicalButtonVariants ?? [])
    ]);

    for (const file of compFiles) {
      const relPath = path.relative(this.projectRoot, file).replace(/\\/g, '/');
      const content = fs.readFileSync(file, 'utf-8');

      // Check ad-hoc button in <style>
      const styleMatches = Array.from(content.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi));
      for (const sm of styleMatches) {
        const styleBody = sm[2] ?? '';
        const btnSelectorMatch = styleBody.match(/(?:^|[^\w-])(\.btn(?:\s*\{|\s*[,>+~]|\.[a-z0-9_-]+))/i);
        if (btnSelectorMatch) {
          this.addViolation({
            ruleId: 'ad-hoc-button-styles',
            severity: 'error',
            file: relPath,
            line: 1,
            message: `Sobreescritura ad-hoc de estilos de botón detectada en <style>: "${btnSelectorMatch[1]}". Gobernanza exclusiva en src/styles/_buttons.scss (Mandato 23).`,
            context: btnSelectorMatch[1]!
          });
        }
      }

      // Check non-canonical button variant classes in templates
      const allClassMatches = content.matchAll(/(?<![-:\w])class=["']([^"']+)["']/g);
      for (const cm of allClassMatches) {
        const clsList = cm[1]!.split(/\s+/).filter(Boolean);
        if (clsList.includes('btn')) {
          for (const c of clsList) {
            if (c.startsWith('btn-') && !canonicalVariants.has(c)) {
              this.addViolation({
                ruleId: 'ad-hoc-button-styles',
                severity: 'error',
                file: relPath,
                line: 1,
                message: `Clase de botón no canónica "${c}" detectada según Mandato 23.`,
                context: c
              });
            }
          }
        }
      }
    }
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new ButtonGovernanceAuditor());
