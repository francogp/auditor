/**
 * scripts/auditors/architecture/validate_template_ids.ts
 *
 * TEMPLATE STATIC ID INTEGRITY & COLLISION AUDITOR (Node.js 26+ Native)
 *
 * Enforces HTML/DOM uniqueness and E2E locator predictability across all Vue components:
 *   1. Duplicate Static ID within Component (`template-duplicate-static-id`):
 *      Forbids having two elements with the exact same static `id="..."` attribute
 *      inside the same `<template>` block.
 *   2. Shared Generic Static IDs Across Components (`template-shared-static-id`):
 *      Detects collision-prone static IDs reused across different components (e.g.
 *      `id="close-btn"`, `id="confirm-btn"`). Components should namespace their IDs
 *      (e.g. `id="rename-modal-close-btn"`) to prevent DOM collisions and Playwright
 *      locator ambiguity.
 *
 * Escape Hatches:
 *   `<!-- id-ok -->`, `// id-ok`, `// template-ok`
 *
 * Usage:
 *   npm run validate:template-ids
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import {
  FileScanAuditor,
  BaseAuditor
} from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';

enableCompileCache();

export type TemplateIdRuleId =
  | 'template-duplicate-static-id'
  | 'template-shared-static-id'
  | 'template-missing-input-id';

export const TEMPLATE_ID_RULES: readonly TemplateIdRuleId[] = [
  'template-duplicate-static-id',
  'template-shared-static-id',
  'template-missing-input-id'
] as const;

// Match static HTML id attributes: id="some-id" or id='some-id' (strictly preceded by whitespace or tag open)
const STATIC_ID_REGEX = /(?:^|[\s<])id\s*=\s*["']([^"'\s>]+)["']/g;
// Match interactive form controls: <input, <select, <textarea
const FORM_CONTROL_REGEX = /<(input|select|textarea)\b([^>]*?)>/gis;

interface IdOccurrence {
  file: string;
  line: number;
  context: string;
}

export class TemplateIdAuditor extends FileScanAuditor<TemplateIdRuleId> {
  private readonly globalIdMap = new Map<string, IdOccurrence[]>();
  private readonly requireInputIds: boolean;

  constructor(roots: readonly string[] = ['src'], options?: { requireInputIds?: boolean }) {
    super({
      id: 'validate_template_ids',
      name: 'Template Static ID Uniqueness & Collision Validator',
      description: 'Verifica IDs estáticos e inputs en templates Vue',
      family: 'architecture',
      ruleIds: TEMPLATE_ID_RULES,
      packageName: 'Template',
      ruleDescriptions: {
        'template-duplicate-static-id': 'ID estático duplicado',
        'template-shared-static-id': 'ID compartido entre componentes',
        'template-missing-input-id': 'Control sin ID único'
      },
      roots,
      allowedExtensions: new Set(['.vue'])
    });
    this.requireInputIds = options?.requireInputIds ?? getAuditConfig().templates?.requireInputIds ?? false;
  }

  protected override scanFile(relPath: string, content: string): void {
    const templateMatch = content.match(/<template\b[^>]*>([\s\S]*?)<\/template>/i);
    if (!templateMatch) return;

    const templateContent = templateMatch[1];
    if (!templateContent) return;

    const templateStartOffset = templateMatch.index ?? 0;
    const lines = content.split('\n');

    const intraMap = new Map<string, IdOccurrence>();
    let match: RegExpExecArray | null;
    STATIC_ID_REGEX.lastIndex = 0;

    while ((match = STATIC_ID_REGEX.exec(templateContent)) !== null) {
      const id = match[1];
      if (!id) continue;

      const absoluteOffset = templateStartOffset + match.index;
      const lineNumber = content.slice(0, absoluteOffset).split('\n').length;
      const lineContent = lines[lineNumber - 1] || '';

      if (this.isLineIgnored(lineContent, ['id-ok', 'template-ok'])) continue;

      const occurrence: IdOccurrence = {
        file: relPath,
        line: lineNumber,
        context: lineContent.trim()
      };

      if (!intraMap.has(id)) {
        intraMap.set(id, occurrence);
      } else {
        const first = intraMap.get(id)!;
        this.addViolation({
          ruleId: 'template-duplicate-static-id',
          severity: 'error',
          file: relPath,
          line: lineNumber,
          message: `Duplicate static id '${id}' found within the same component template (previously defined at line ${first.line}).`,
          context: lineContent.trim()
        });
      }

      if (!this.globalIdMap.has(id)) {
        this.globalIdMap.set(id, [occurrence]);
      } else {
        this.globalIdMap.get(id)!.push(occurrence);
      }
    }

    // 3. Mandatory ID on form controls (<input>, <select>, <textarea>) if enabled in audit.config.ts
    if (this.requireInputIds) {
      let formMatch: RegExpExecArray | null;
      FORM_CONTROL_REGEX.lastIndex = 0;
      while ((formMatch = FORM_CONTROL_REGEX.exec(templateContent)) !== null) {
        const tagType = formMatch[1] ?? 'input';
        const tagFull = formMatch[0];
        const hasId = /\b(?::)?id\s*=\s*["'][^"'\s>]+["']/i.test(tagFull);

        const absoluteOffset = templateStartOffset + formMatch.index;
        const lineNumber = content.slice(0, absoluteOffset).split('\n').length;
        const lineContent = lines[lineNumber - 1] || '';

        if (this.isLineIgnored(lineContent, ['id-ok', 'template-ok'])) continue;

        if (!hasId) {
          this.addViolation({
            ruleId: 'template-missing-input-id',
            severity: 'error',
            file: relPath,
            line: lineNumber,
            message: `Control de formulario <${tagType}> carece de atributo id para automatización con Playwright y accesibilidad.`,
            context: lineContent.trim()
          });
        }
      }
    }
  }

  public override async runAudit(): Promise<void> {
    await super.runAudit();

    // Cross-component collision check
    for (const [id, occs] of this.globalIdMap.entries()) {
      const distinctFiles = Array.from(new Set(occs.map(o => o.file)));
      if (distinctFiles.length > 1) {
        const firstOcc = occs[0];
        for (let i = 1; i < occs.length; i++) {
          const occ = occs[i];
          if (occ && firstOcc && occ.file !== firstOcc.file) {
            this.addViolation({
              ruleId: 'template-shared-static-id',
              severity: 'error',
              file: occ.file,
              line: occ.line,
              message: `Static id '${id}' is shared across multiple components (${distinctFiles.slice(0, 3).map(f => path.basename(f)).join(', ')}${distinctFiles.length > 3 ? '...' : ''}). Prefix with component name to avoid E2E locator collisions.`,
              context: occ.context
            });
          }
        }
      }
    }
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new TemplateIdAuditor());
}
