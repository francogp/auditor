/**
 * skills/auditor/references/extensions/validate_overscroll_lock.extension.ts
 *
 * MOBILE VIEWPORT & OVERSCROLL LOCK EXTENSION AUDITOR (Node.js 26+ Native)
 *
 * Extracted from @francogp/auditor core as a host-specific mobile game extension.
 * Enforces mobile viewport lock:
 *   - Verifies that the base stylesheet (e.g. 'src/styles/core/_base.scss') declares
 *     'overscroll-behavior: none !important;' on 'html, body' to prevent accidental
 *     pull-to-refresh and swipe-navigation gestures on mobile canvas/touch screens.
 *
 * Usage in .auditor/audit.config.ts:
 *   import { OverscrollLockAuditor } from '../scripts/auditors/extensions/validate_overscroll_lock.extension.ts';
 *   export default defineAuditConfig({
 *     extensions: [new OverscrollLockAuditor()]
 *   });
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  BaseAuditor,
  createUniformRuleCapabilities,
  getAuditConfig,
  type FileScanRootsOptions
} from '@francogp/auditor';

export type OverscrollLockRuleId = 'overscroll-behavior-lock';

export const OVERSCROLL_LOCK_RULES: readonly OverscrollLockRuleId[] = [
  'overscroll-behavior-lock'
] as const;

export class OverscrollLockAuditor extends BaseAuditor<OverscrollLockRuleId> {
  constructor(options: FileScanRootsOptions = {}) {
    const projectRoot = options.projectRoot ?? process.cwd();
    super({
      id: 'validate_overscroll_lock',
      name: 'Mobile Overscroll Behavior Lock Validator',
      description: 'Validates overscroll-behavior lock in mobile base styles',
      icon: '📱',
      family: 'architecture',
      ruleCapabilities: createUniformRuleCapabilities(OVERSCROLL_LOCK_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: true,
        critical: false
      }),
      ruleIds: OVERSCROLL_LOCK_RULES,
      packageName: 'Mobile',
      configKey: 'styles.baseScssFile',
      defaultConfig: {
        baseScssFile: 'src/styles/base.scss'
      },
      criticalConfig: {},
      requiredPermissions: [],
      remediationPhase: 'polish',
      usesThirdPartyTool: false,
      ruleDescriptions: {
        'overscroll-behavior-lock': 'Missing overscroll-behavior in base stylesheet'
      },
      ruleRemediations: {
        'overscroll-behavior-lock':
          '1. Root Cause: The base stylesheet is missing overscroll-behavior: none !important on html, body.\n' +
          '2. Diagnosis: Open the base stylesheet configured in styles.baseScssFile (e.g. src/styles/base.scss).\n' +
          '3. Canonical Solution: Add "overscroll-behavior: none !important;" on the html, body selector to prevent accidental mobile pull-to-refresh gestures.\n' +
          '4. Example / Command: npm run auditor'
      },
      roots: options.roots ?? ['src/styles'],
      allowedExtensions: new Set(['.scss', '.css']),
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const config = getAuditConfig(this.projectRoot);
    const targetRelFile = config.styles?.baseScssFile ?? config.styles?.zLayersScssFile;

    if (!targetRelFile) {
      this.runSubAuditorSync('overscroll-behavior-lock', () => {
        this.markRuleNotApplicable(
          'overscroll-behavior-lock',
          'No baseScssFile or zLayersScssFile configured in .auditor/audit.config.ts'
        );
      });
      return;
    }

    this.runSubAuditorSync('overscroll-behavior-lock', () => {
      const absPath = path.resolve(this.projectRoot, targetRelFile);
      if (!fs.existsSync(absPath)) {
        this.recordScanned(targetRelFile);
        this.addViolation({
          ruleId: 'overscroll-behavior-lock',
          severity: 'error',
          file: targetRelFile,
          line: 1,
          message: `Configured base stylesheet '${targetRelFile}' does not exist on disk.`,
          context: targetRelFile
        });
        return;
      }

      this.recordScanned(targetRelFile);
      const content = fs.readFileSync(absPath, 'utf-8');
      const hasLock = content.includes('overscroll-behavior: none !important;');
      let line = 1;
      if (!hasLock) {
        const match = content.match(/html\s*,\s*body\s*\{/);
        if (match && match.index !== undefined) {
          line = content.slice(0, match.index).split('\n').length;
        }
      }

      this.assertRule('overscroll-behavior-lock', hasLock, {
        severity: 'error',
        file: targetRelFile,
        line,
        message: `Mobile overscroll lock mandate violated: '${targetRelFile}' must declare 'overscroll-behavior: none !important;' on 'html, body' to prevent accidental pull-to-refresh and gesture navigation on mobile browsers.`,
        context: 'html, body { overscroll-behavior: none !important; }'
      });
    });
  }
}

// Canonical CLI Entrypoint (delegates argument parsing to Citty via BaseAuditor)
await BaseAuditor.runCliIfMain(import.meta.url, new OverscrollLockAuditor());
