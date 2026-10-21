/**
 * scripts/auditors/extensions/validate_button_governance.extension.ts
 *
 * ENTERPRISE BUTTON GOVERNANCE EXTENSION AUDITOR (Node.js 26+ Native)
 *
 * Extracted from @francogp/auditor core as a host-specific architecture extension.
 * Enforces UI Architecture Governance (Button Rule 23):
 *   1. Anti-clipping perimeter 360° border on buttons in _buttons.scss (no border-bottom-color).
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
import {
  BaseAuditor,
  createUniformRuleCapabilities,
  getAuditConfig,
  toPosixRelative,
  parseVueSfc,
  type FileScanRootsOptions
} from '@francogp/auditor';

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
  constructor(options: FileScanRootsOptions = {}) {
    const projectRoot = options.projectRoot ?? process.cwd();
    super({
      id: 'validate_button_governance',
      name: 'Button Governance Validator (Rule 23)',
      description: 'Validates button governance and canonical variants',
      icon: '🔘',
      family: 'architecture',
      ruleCapabilities: createUniformRuleCapabilities(BUTTON_GOVERNANCE_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: true,
        critical: false
      }),
      ruleIds: BUTTON_GOVERNANCE_RULES,
      packageName: 'Buttons',
      configKey: 'styles.buttonGovernance',
      defaultConfig: {
        enabled: true
      },
      criticalConfig: {},
      requiredPermissions: [],
      remediationPhase: 'contracts',
      usesThirdPartyTool: false,
      ruleDescriptions: {
        'ad-hoc-button-styles': 'Ad-hoc button style override',
        'button-border-clipping': 'Clipped bottom border on button',
        'button-inset-cutoff': 'Negative inset shadow on button'
      },
      ruleRemediations: {
        'ad-hoc-button-styles':
          '1. Root Cause: An ad-hoc style overriding a button class was detected inside a component.\n' +
          '2. Diagnosis: Inspect the reported Vue SFC <style> or <template> block.\n' +
          '3. Canonical Solution: Use canonical button variants (btn-primary, btn-secondary, etc.) and keep shared button styles in src/styles/_buttons.scss.\n' +
          '4. Example / Command: npm run auditor',
        'button-border-clipping':
          '1. Root Cause: A button overrides border-bottom-color individually, causing asymmetric perimeter clipping.\n' +
          '2. Diagnosis: Inspect src/styles/_buttons.scss for border-bottom-color declarations.\n' +
          '3. Canonical Solution: Maintain continuous 360-degree perimeter borders using design system tokens.\n' +
          '4. Example / Command: npm run auditor',
        'button-inset-cutoff':
          '1. Root Cause: A negative vertical inset shadow clips the button rendering.\n' +
          '2. Diagnosis: Inspect src/styles/_buttons.scss for negative inset 0 -Npx declarations.\n' +
          '3. Canonical Solution: Use canonical positive or symmetric inset shadows.\n' +
          '4. Example / Command: npm run auditor'
      },
      roots: options.roots ?? ['src/components', 'src/views', 'src/styles'],
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
      const relButtons = toPosixRelative(buttonsScssPath, this.projectRoot);
      this.recordScanned(relButtons);

      this.runSubAuditorSync('button-border-clipping', () => {
        if (btnContent.includes('border-bottom-color')) {
          this.addViolation({
            ruleId: 'button-border-clipping',
            severity: 'error',
            file: relButtons,
            line: 1,
            message:
              'Forbidden usage of "border-bottom-color" on buttons. All buttons must maintain continuous 360° perimeter borders.',
            context: 'border-bottom-color'
          });
        }
      });

      this.runSubAuditorSync('button-inset-cutoff', () => {
        if (/inset\s+0\s+-[0-9]+px/i.test(btnContent)) {
          this.addViolation({
            ruleId: 'button-inset-cutoff',
            severity: 'error',
            file: relButtons,
            line: 1,
            message:
              'Forbidden negative vertical inset shadow on buttons simulating visual clipping.',
            context: 'inset 0 -Npx'
          });
        }
      });
    } else {
      this.runSubAuditorSync('button-border-clipping', () => {
        this.markRuleNotApplicable('button-border-clipping', 'No _buttons.scss found in styles');
      });
      this.runSubAuditorSync('button-inset-cutoff', () => {
        this.markRuleNotApplicable('button-inset-cutoff', 'No _buttons.scss found in styles');
      });
    }

    // 2. Audit Vue components for ad-hoc button classes
    const compFiles = await this.context.collectFiles(
      [
        ...(config.paths.componentsRoots ?? ['src/components']),
        ...(config.paths.viewsRoots ?? ['src/views'])
      ],
      new Set(['.vue'])
    );

    const canonicalVariants = new Set([
      'btn-primary',
      'btn-secondary',
      'btn-dark',
      'btn-success',
      'btn-warning',
      'btn-danger',
      'btn-sm',
      'btn-md',
      'btn-lg',
      'btn-block',
      'btn-3d',
      'btn-icon',
      ...(config.styles?.canonicalButtonVariants ?? [])
    ]);

    this.runSubAuditorSync('ad-hoc-button-styles', () => {
      for (const file of compFiles) {
        const relPath = toPosixRelative(file, this.projectRoot);
        const content = fs.readFileSync(file, 'utf-8');
        const parsedSfc = parseVueSfc(content);

        // Check ad-hoc button in <style>
        for (const styleBlock of parsedSfc.styles) {
          const styleBody = styleBlock.content;
          const btnSelectorMatch = styleBody.match(
            /(?:^|[^\w-])(\.btn(?:\s*\{|\s*[,>+~]|\.[a-z0-9_-]+))/i
          );
          if (btnSelectorMatch) {
            this.addViolation({
              ruleId: 'ad-hoc-button-styles',
              severity: 'error',
              file: relPath,
              line: styleBlock.startLine,
              message: `Ad-hoc button style override detected in <style>: "${btnSelectorMatch[1]}". Button styling must be centralized in src/styles/_buttons.scss.`,
              context: btnSelectorMatch[1]!
            });
          }
        }

        // Check non-canonical button variant classes in templates
        const templateContent = parsedSfc.template?.content ?? '';
        const allClassMatches = templateContent.matchAll(/(?<![-:\w])class=["']([^"']+)["']/g);
        for (const cm of allClassMatches) {
          const clsList = cm[1]!.split(/\s+/).filter(Boolean);
          if (clsList.includes('btn')) {
            for (const c of clsList) {
              if (c.startsWith('btn-') && !canonicalVariants.has(c)) {
                this.addViolation({
                  ruleId: 'ad-hoc-button-styles',
                  severity: 'error',
                  file: relPath,
                  line: parsedSfc.template?.startLine ?? 1,
                  message: `Non-canonical button variant class "${c}" detected.`,
                  context: c
                });
              }
            }
          }
        }
      }
    });
  }
}

// Canonical CLI Entrypoint (delegates argument parsing to Citty via BaseAuditor)
await BaseAuditor.runCliIfMain(import.meta.url, new ButtonGovernanceAuditor());
