/**
 * scripts/auditors/architecture/validate_mobile_accessibility.ts
 *
 * MOBILE & WEB ACCESSIBILITY STANDARDS AUDITOR (Node.js 26+ Native)
 *
 * Enforces accessibility & mobile standards (mobile-design & web-design-guidelines):
 *   1. No Zoom Blocking Viewport (`no-zoom-blocking-viewport`):
 *      In `index.html`, forbids `user-scalable=no` or `maximum-scale=1.0` which violates
 *      WCAG 1.4.4 text resize accessibility.
 *   2. Image Alt Required (`img-alt-required`):
 *      In `.vue` templates, all `<img>` elements must provide an `alt` or `:alt` attribute.
 *   3. Icon Button Accessible Label (`icon-button-accessible-label`):
 *      Buttons that contain only icons and no textual content must provide an `aria-label`,
 *      a `title`, or be wrapped in a tooltip (`PVTooltip`).
 *
 * Escape Hatches:
 *   `// a11y-ok: <reason>`, `<!-- a11y-ok: <reason> -->`
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_mobile_accessibility.ts
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';

enableCompileCache();

export type MobileAccessibilityRuleId =
  | 'no-zoom-blocking-viewport'
  | 'img-alt-required'
  | 'icon-button-accessible-label';

export const MOBILE_ACCESSIBILITY_RULES: readonly MobileAccessibilityRuleId[] = [
  'no-zoom-blocking-viewport',
  'img-alt-required',
  'icon-button-accessible-label'
] as const;

export class MobileAccessibilityAuditor extends BaseAuditor<MobileAccessibilityRuleId> {
  constructor(projectRoot: string = process.cwd()) {
    super({
      id: 'validate_mobile_accessibility',
      name: 'Mobile & Web Accessibility Auditor',
      description: 'Valida accesibilidad móvil, tap targets y etiquetas alt',
      family: 'architecture',
      ruleIds: MOBILE_ACCESSIBILITY_RULES,
      packageName: 'A11y',
      ruleDescriptions: {
        'no-zoom-blocking-viewport': 'Viewport bloquea zoom móvil',
        'img-alt-required': 'Imagen sin atributo alt',
        'icon-button-accessible-label': 'Botón sin aria-label'
      },
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    // 1. Check index.html viewport
    await this.auditIndexViewport();

    // 2. Check Vue templates in src/components and src/views
    await this.auditVueTemplates();
  }

  private async auditIndexViewport(): Promise<void> {
    const indexPath = path.resolve(this.projectRoot, 'index.html');
    if (!existsSync(indexPath)) return;

    this.filesScannedCount++;
    const content = await fs.readFile(indexPath, 'utf-8');

    const viewportMatch = content.match(/<meta\s+name=["']viewport["'][^>]*>/i);
    if (viewportMatch) {
      const metaTag = viewportMatch[0];
      if (/user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=\s*1(?:\.0)?/i.test(metaTag)) {
        this.addViolation({
          ruleId: 'no-zoom-blocking-viewport',
          severity: 'error',
          file: 'index.html',
          line: this.getLineNumber(content, viewportMatch.index ?? 0),
          message: `Viewport meta tag blocks pinch-to-zoom (user-scalable=no or maximum-scale=1.0). Violates WCAG 1.4.4 resize accessibility.`,
          context: metaTag
        });
      }
    }
  }

  private async auditVueTemplates(): Promise<void> {
    const vueFiles = [
      ...this.context.collectFiles(['src/components'], new Set(['.vue'])),
      ...this.context.collectFiles(['src/views'], new Set(['.vue']))
    ];

    for (const file of vueFiles) {
      this.filesScannedCount++;
      const relFile = path.relative(this.projectRoot, file).replace(/\\/g, '/');
      const content = await fs.readFile(file, 'utf-8');

      const templateMatch = content.match(/<template[\s\S]*<\/template>/);
      if (!templateMatch) continue;

      const template = templateMatch[0];
      const templateStart = templateMatch.index ?? 0;

      // 1. Audit img alt attribute
      this.auditImgAlt(relFile, content, template, templateStart);

      // 2. Audit icon-only button labels
      this.auditIconButtonLabels(relFile, content, template, templateStart);
    }
  }

  private auditImgAlt(relFile: string, fullContent: string, template: string, templateStart: number): void {
    const imgRegex = /<img\b((?:[^>"'`]|"[^"]*"|'[^']*'|`[^`]*`)*)\/?>/gi;
    let match: RegExpExecArray | null;

    while ((match = imgRegex.exec(template)) !== null) {
      const attrs = match[1] ?? '';
      const hasAlt = /\b:?alt=["']/i.test(attrs);

      if (!hasAlt) {
        const fullIndex = templateStart + match.index;
        const line = this.getLineNumber(fullContent, fullIndex);
        const lineContent = this.getLineAt(fullContent, line);

        if (this.hasEscapeHatch(lineContent, ['a11y-ok', 'alt-ok'])) {
          continue;
        }

        this.addViolation({
          ruleId: 'img-alt-required',
          severity: 'error',
          file: relFile,
          line,
          message: `<img> tag is missing an 'alt' or ':alt' attribute for screen reader accessibility.`,
          context: match[0].slice(0, 100)
        });
      }
    }
  }

  private auditIconButtonLabels(relFile: string, fullContent: string, template: string, templateStart: number): void {
    const buttonRegex = /<button\b((?:[^>"'`]|"[^"]*"|'[^']*'|`[^`]*`)*)>([\s\S]*?)<\/button>/gi;
    let match: RegExpExecArray | null;

    while ((match = buttonRegex.exec(template)) !== null) {
      const attrs = match[1] ?? '';
      const innerHtml = match[2] ?? '';

      // Check if button has aria-label or title
      const hasAriaLabel = /\b(?:aria-label|:aria-label|title|:title)=["']/i.test(attrs);
      if (hasAriaLabel) continue;

      // Check if innerHtml contains only an icon tag (<i class="fa...", <svg, <span class="...icon") and no text
      const strippedText = innerHtml.replace(/<[^>]*>/g, '').trim();
      const hasIcon = /<(?:i|svg|span)\b[^>]*(?:fa-|icon|material-icons)/i.test(innerHtml);

      if (strippedText.length === 0 && hasIcon) {
        // Check if wrapped in PVTooltip or tooltip in context
        const contextBefore = template.slice(Math.max(0, match.index - 80), match.index);
        if (/PVTooltip\b/i.test(contextBefore)) {
          continue;
        }

        const fullIndex = templateStart + match.index;
        const line = this.getLineNumber(fullContent, fullIndex);
        const lineContent = this.getLineAt(fullContent, line);

        if (this.hasEscapeHatch(lineContent, ['a11y-ok', 'tooltip-ok'])) {
          continue;
        }

        this.addViolation({
          ruleId: 'icon-button-accessible-label',
          severity: 'error',
          file: relFile,
          line,
          message: `Icon-only button has no accessible label. Add 'aria-label', 'title', or wrap with 'PVTooltip'.`,
          context: match[0].slice(0, 100)
        });
      }
    }
  }
}

// Standalone execution support
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new MobileAccessibilityAuditor());
}
