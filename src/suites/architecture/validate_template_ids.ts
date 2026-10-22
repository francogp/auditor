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
 * Usage:
 *   npm run validate:template-ids
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { FileScanAuditor, BaseAuditor,
  createUniformRemediationPhases, createRuleCapabilities, resolveFileScanRoots, type FileScanRootsOptions } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { parseVueSfc } from '../../core/vueSfcParser.ts';

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
// Match start of interactive form controls and elements: <input, <select, <textarea, <button or any tag with interactive events
const INTERACTIVE_TAG_REGEX = /<([\w-]+)\b/g;
const INHERENT_INTERACTIVE_TAGS: ReadonlySet<string> = new Set([
  'input',
  'select',
  'textarea',
  'button'
]);
const INTERACTIVE_EVENT_REGEX =
  /@(?:click|change|submit|input|keydown\.enter)\b|v-on:(?:click|change|submit|input)/i;

function extractFullTag(
  content: string,
  startIndex: number
): { tag: string; endIndex: number } | null {
  let inQuote: string | null = null;
  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];
    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      }
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === '>') {
      return {
        tag: content.substring(startIndex, i + 1),
        endIndex: i + 1
      };
    }
  }
  return null;
}

interface IdOccurrence {
  file: string;
  line: number;
  context: string;
}

interface TemplateScanContext {
  content: string;
  lines: string[];
  templateContent: string;
  templateStartOffset: number;
  relPath: string;
  auditor: TemplateIdAuditor;
  globalIdMap: Map<string, IdOccurrence[]>;
}

function scanTemplateStaticIds(ctx: TemplateScanContext): void {
  const intraMap = new Map<string, IdOccurrence>();
  let match: RegExpExecArray | null;
  STATIC_ID_REGEX.lastIndex = 0;

  while ((match = STATIC_ID_REGEX.exec(ctx.templateContent)) !== null) {
    const id = match[1];
    if (!id) continue;

    const info = ctx.auditor.getMatchLineInfo(
      ctx.content,
      ctx.lines,
      ctx.templateStartOffset + match.index
    );

    const occurrence: IdOccurrence = {
      file: ctx.relPath,
      line: info.lineNumber,
      context: info.lineContent.trim()
    };

    if (!intraMap.has(id)) {
      intraMap.set(id, occurrence);
    } else {
      const first = intraMap.get(id)!;
      ctx.auditor.addViolation({
        ruleId: 'template-duplicate-static-id',
        severity: 'error',
        file: ctx.relPath,
        line: info.lineNumber,
        message: `Duplicate static id '${id}' found within the same component template (previously defined at line ${first.line}).`,
        context: info.lineContent.trim()
      });
    }

    if (!ctx.globalIdMap.has(id)) {
      ctx.globalIdMap.set(id, [occurrence]);
    } else {
      ctx.globalIdMap.get(id)!.push(occurrence);
    }
  }
}

function scanTemplateFormControlIds(ctx: TemplateScanContext): void {
  INTERACTIVE_TAG_REGEX.lastIndex = 0;
  let formMatch: RegExpExecArray | null;

  while ((formMatch = INTERACTIVE_TAG_REGEX.exec(ctx.templateContent)) !== null) {
    const tagType = (formMatch[1] ?? '').toLowerCase();
    const tagInfo = extractFullTag(ctx.templateContent, formMatch.index);
    if (!tagInfo) continue;

    const tagFull = tagInfo.tag;
    const isInteractive =
      INHERENT_INTERACTIVE_TAGS.has(tagType) || INTERACTIVE_EVENT_REGEX.test(tagFull);
    if (!isInteractive) continue;

    // Non-interactive hidden inputs do not require interactive IDs or labels
    if (tagType === 'input' && /\btype\s*=\s*["']hidden["']/i.test(tagFull)) {
      continue;
    }

    // Match static id, dynamic :id, or v-bind:id
    const hasId = /\b(?:v-bind:id|:id|id)\s*=/i.test(tagFull);

    const info = ctx.auditor.getMatchLineInfo(
      ctx.content,
      ctx.lines,
      ctx.templateStartOffset + formMatch.index
    );

    if (!hasId) {
      ctx.auditor.addViolation({
        ruleId: 'template-missing-input-id',
        severity: 'error',
        file: ctx.relPath,
        line: info.lineNumber,
        message: `Interactive element <${tagType}> lacks an id attribute for Playwright automation and accessibility.`,
        context: info.lineContent.trim()
      });
    }
  }
}

export interface TemplateIdAuditorOptions extends FileScanRootsOptions {
  readonly requireInputIds?: boolean;
}

export class TemplateIdAuditor extends FileScanAuditor<TemplateIdRuleId> {
  private readonly globalIdMap = new Map<string, IdOccurrence[]>();
  private readonly requireInputIds: boolean;

  constructor(options: TemplateIdAuditorOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(
      options,
      (config) => [
        ...(config.paths.componentsRoots ?? []),
        ...(config.paths.viewsRoots ?? [])
      ]
    );
    const config = getAuditConfig(effectiveRoot);
    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(TEMPLATE_ID_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_template_ids',
      name: 'Template Static ID Uniqueness & Collision Validator',
      description: 'Verifies static IDs and inputs in Vue templates',
      family: 'architecture',
      ruleIds: TEMPLATE_ID_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(TEMPLATE_ID_RULES, 'hygiene'),
      packageName: 'Template',
      configKey: 'templates.requireInputIds',
      defaultConfig: { enabled: true, requireInputIds: true },
      criticalConfig: {},
      icon: '🆔',
      ruleDescriptions: {
        'template-duplicate-static-id': 'Duplicate static ID',
        'template-shared-static-id': 'Static ID shared across components',
        'template-missing-input-id': 'Form control missing unique ID'
      },
      ruleRemediations: {
        'template-duplicate-static-id':
          '📖 REMEDIATION GUIDE: template-duplicate-static-id\n' +
          '1. Root Cause: The same static attribute `id="..."` was found on two or more elements inside the same Vue component template. Under HTML5 standards, IDs must be unique within a document.\n' +
          '2. Diagnosis: Locate the duplicate ID indicated in the error message and contrast it with the line of its first occurrence.\n' +
          '3. Canonical Solution: Assign distinct and descriptive IDs to each element, or use CSS classes (`class="..."`) if grouping for styling.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Duplicate: `<div id="card">...</div> <div id="card">...</div>`\n' +
          '   ✅ Unique:    `<div id="card-primary">...</div> <div id="card-secondary">...</div>`',
        'template-shared-static-id':
          '📖 REMEDIATION GUIDE: template-shared-static-id\n' +
          '1. Root Cause: The same static identifier `id="foo"` was detected across two different Vue components. If both mount simultaneously, an ID collision occurs in the global DOM.\n' +
          '2. Diagnosis: Inspect the two component files reported in the finding.\n' +
          '3. Canonical Solution:\n' +
          '   a) Prefix the ID with the component name (e.g. `id="user-profile-header"` vs `id="settings-header"`).\n' +
          '   b) Or generate unique per-instance IDs using Vue 3 `useId()` (`const inputId = useId();` with `:id="inputId"`).\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Collision: `id="submit-btn"` in LoginForm.vue and RegisterForm.vue\n' +
          '   ✅ Prefixed:  `id="login-submit-btn"` and `id="register-submit-btn"`',
        'template-missing-input-id':
          '📖 REMEDIATION GUIDE: template-missing-input-id\n' +
          '1. Root Cause: A form control (`<input>`, `<select>`, `<textarea>`) lacks an `id` attribute or `:id` binding, preventing accessible `<label :for="...">` association.\n' +
          '2. Diagnosis: Review the form control in the component template.\n' +
          '3. Canonical Solution:\n' +
          '   a) Add a unique ID to the control: `<input id="search-query" ...>` and associate with `<label for="search-query">`.\n' +
          '   b) If reusable across multiple instances, generate the ID with Vue 3 `useId()` and bind `:id="id"`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Missing ID: `<input v-model="name" type="text" />`\n' +
          '   ✅ With ID:    `<input :id="nameInputId" v-model="name" type="text" />`'
      },
      roots: targetRoots,
      allowedExtensions: new Set(['.vue']),
      projectRoot: effectiveRoot
    });
    this.requireInputIds = options.requireInputIds ?? config.templates?.requireInputIds ?? false;
  }

  public getMatchLineInfo(
    content: string,
    lines: string[],
    offset: number
  ): { lineNumber: number; lineContent: string } {
    const lineNumber = content.slice(0, offset).split('\n').length;
    const lineContent = lines[lineNumber - 1] || '';
    return { lineNumber, lineContent };
  }

  protected override scanFile(relPath: string, content: string): void {
    const sfc = parseVueSfc(content);
    if (!sfc.template || !sfc.template.content) return;

    const ctx: TemplateScanContext = {
      content,
      lines: content.split('\n'),
      templateContent: sfc.template.content,
      templateStartOffset: sfc.template.contentStartIndex,
      relPath,
      auditor: this,
      globalIdMap: this.globalIdMap
    };

    this.runSubAuditorSync('template-duplicate-static-id', () => {
      scanTemplateStaticIds(ctx);
    });

    if (this.requireInputIds) {
      this.runSubAuditorSync('template-missing-input-id', () => {
        scanTemplateFormControlIds(ctx);
      });
    }
  }

  private checkSingleIdCollisions(id: string, occs: readonly IdOccurrence[]): void {
    const distinctFiles = Array.from(new Set(occs.map((o) => o.file)));
    if (distinctFiles.length <= 1) return;

    const firstOcc = occs[0];
    const fileSummary =
      distinctFiles
        .slice(0, 3)
        .map((f) => path.basename(f))
        .join(', ') + (distinctFiles.length > 3 ? '...' : '');

    for (let i = 1; i < occs.length; i++) {
      const occ = occs[i];
      if (occ && firstOcc && occ.file !== firstOcc.file) {
        this.addViolation({
          ruleId: 'template-shared-static-id',
          severity: 'error',
          file: occ.file,
          line: occ.line,
          message: `Static id '${id}' is shared across multiple components (${fileSummary}). Prefix with component name to avoid E2E locator collisions.`,
          context: occ.context
        });
      }
    }
  }

  public override async runAudit(): Promise<void> {
    await super.runAudit();
    this.runSubAuditorSync('template-shared-static-id', () => {
      for (const [id, occs] of this.globalIdMap.entries()) {
        this.checkSingleIdCollisions(id, occs);
      }
    });
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new TemplateIdAuditor());
