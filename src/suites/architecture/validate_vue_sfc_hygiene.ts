/**
 * scripts/auditors/architecture/validate_vue_sfc_hygiene.ts
 *
 * VUE SFC & SCRIPT SETUP HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Enforces Vue 3 Composition API & Single File Component architecture rules (vue-best-practices):
 *   1. Script Setup Required (`script-setup-required`):
 *      Components in `src/components/` and `src/views/` must use `<script setup lang="ts">`.
 *      Options API (`export default { ... }`) is strictly forbidden.
 *   2. No Script Setup Exports (`no-script-setup-exports`):
 *      `<script setup>` cannot contain ES module exports (`export const`, `export type`,
 *      `export interface`). Shared contracts must be extracted to companion `*Types.ts` files.
 *   3. Vue Template Quote Escaping (`vueTemplateQuoteEscaping`):
 *      Prohibits unescaped inner double quotes inside double-quoted template attribute bindings
 *      (e.g. `:alt="tier?.name || "Bronce""`), which break Vite parsing.
 *   4. No Heavy Data Providers in Templates (`no-data-provider-in-template`):
 *      Prohibits invoking heavy database data providers (e.g. `dataProvider.get...()`)
 *      directly inside `<template>` render expressions.
 *
 * Escape Hatches:
 *   `// sfc-ok: <reason>`, `// template-ok: <reason>`
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_vue_sfc_hygiene.ts
 */

import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';

enableCompileCache();

export type VueSfcHygieneRuleId =
  | 'script-setup-required'
  | 'no-script-setup-exports'
  | 'vue-template-quote-escaping'
  | 'no-data-provider-in-template';

export const VUE_SFC_HYGIENE_RULES: readonly VueSfcHygieneRuleId[] = [
  'script-setup-required',
  'no-script-setup-exports',
  'vue-template-quote-escaping',
  'no-data-provider-in-template'
] as const;

const OPTIONS_API_EXPORT_REGEX = /export\s+default\s*\{/g;
const SCRIPT_TAG_REGEX = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const SCRIPT_SETUP_EXPORT_REGEX = /^\s*export\s+(?:const|let|var|function|type|interface|class|enum)\b/gm;
const TEMPLATE_QUOTE_ESCAPE_REGEX = /(?:\s:|\bv-bind:)[a-zA-Z0-9_-]+="[^"\n]*\\"[^"\n]*"|(?:\s:|\bv-bind:)[a-zA-Z0-9_-]+="[^"\n]*"[a-zA-Z0-9_$]/;
export const DEFAULT_DATA_PROVIDER_IN_TEMPLATE_REGEX = /\{\{[^}]*\b(?:[a-zA-Z0-9_]*DataProvider|dataProvider)\.[a-zA-Z0-9_]+\s*\(/g;

export class VueSfcHygieneAuditor extends FileScanAuditor<VueSfcHygieneRuleId> {
constructor(roots?: readonly string[], projectRoot?: string) {
    const config = getAuditConfig(projectRoot);
    const effectiveRoots = roots ?? [
      ...(config.paths.componentsRoots ?? ['src/components']),
      ...(config.paths.viewsRoots ?? ['src/views'])
    ];
    super({
      capabilities: { lint: true },
      id: 'validate_vue_sfc_hygiene',
      name: 'Vue SFC & Script Setup Hygiene Auditor',
      description: 'Verifica estándares de Vue SFC y <script setup lang="ts">',
      family: 'architecture',
      ruleIds: VUE_SFC_HYGIENE_RULES,
      packageName: 'Vue',
      icon: '💚',
      ruleDescriptions: {
        'script-setup-required': 'Componente sin script setup',
        'no-script-setup-exports': 'Export dentro de script setup',
        'vue-template-quote-escaping': 'Comillas sin escapar en template',
        'no-data-provider-in-template': 'Data provider en template'
      },
      roots: effectiveRoots,
      allowedExtensions: new Set(['.vue']),
      projectRoot
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    // 1. Audit Script Setup requirement and Options API prohibition
    this.auditScriptSetup(relPath, content);

    // 2. Audit exports inside <script setup>
    this.auditScriptSetupExports(relPath, content);

    // 3. Audit template quote escaping
    this.auditTemplateQuoteEscaping(relPath, content);

    // 4. Audit data provider calls in template
    this.auditDataProviderInTemplate(relPath, content);
  }

  private auditScriptSetup(relPath: string, content: string): void {
    // Options API detection
    let match: RegExpExecArray | null;
    const optionsRegex = new RegExp(OPTIONS_API_EXPORT_REGEX.source, OPTIONS_API_EXPORT_REGEX.flags);
    while ((match = optionsRegex.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      const lineContent = this.getLineAt(content, line);

      if (this.hasEscapeHatch(lineContent, ['sfc-ok'])) {
        continue;
      }

      this.addViolation({
        ruleId: 'script-setup-required',
        severity: 'error',
        file: relPath,
        line,
        message: `Options API export default detected. Project mandates Vue 3 Composition API with '<script setup lang="ts">'.`,
        context: lineContent.trim()
      });
    }

    // Check if component has any script tags, and if none has 'setup'
    const scriptMatches = [...content.matchAll(new RegExp(SCRIPT_TAG_REGEX.source, SCRIPT_TAG_REGEX.flags))];
    if (scriptMatches.length > 0) {
      const hasSetup = scriptMatches.some(m => /\bsetup\b/.test(m[1] ?? ''));
      if (!hasSetup) {
        const firstScriptLine = this.getLineNumber(content, scriptMatches[0]?.index ?? 0);
        const lineContent = this.getLineAt(content, firstScriptLine);
        if (!this.hasEscapeHatch(lineContent, ['sfc-ok']) && !this.hasEscapeHatch(content, ['sfc-ok'])) {
          this.addViolation({
            ruleId: 'script-setup-required',
            severity: 'error',
            file: relPath,
            line: 1,
            message: `Component has <script> but lacks 'setup'. All Vue components must use '<script setup lang="ts">'.`,
            context: scriptMatches[0]![0].slice(0, 80)
          });
        }
      }
    }
  }

  private auditScriptSetupExports(relPath: string, content: string): void {
    const scriptMatches = [...content.matchAll(new RegExp(SCRIPT_TAG_REGEX.source, SCRIPT_TAG_REGEX.flags))];

    for (const sMatch of scriptMatches) {
      const attrs = sMatch[1] ?? '';
      if (!/\bsetup\b/.test(attrs)) continue;

      const scriptBody = sMatch[2] ?? '';
      const scriptStartIndex = sMatch.index ?? 0;

      let expMatch: RegExpExecArray | null;
      const expRegex = new RegExp(SCRIPT_SETUP_EXPORT_REGEX.source, SCRIPT_SETUP_EXPORT_REGEX.flags);

      while ((expMatch = expRegex.exec(scriptBody)) !== null) {
        const fullIndex = scriptStartIndex + expMatch.index;
        const line = this.getLineNumber(content, fullIndex);
        const lineContent = this.getLineAt(content, line);

        if (this.hasEscapeHatch(lineContent, ['sfc-ok'])) {
          continue;
        }

        this.addViolation({
          ruleId: 'no-script-setup-exports',
          severity: 'error',
          file: relPath,
          line,
          message: `Illegal export inside <script setup>. Extract shared contracts to companion *Types.ts files or keep local symbols unexported.`,
          context: lineContent.trim()
        });
      }
    }
  }

  private extractTemplateBlock(content: string): { templateContent: string; templateStartIndex: number } | null {
    const templateMatch = content.match(/<template[\s\S]*<\/template>/);
    if (!templateMatch) return null;
    return {
      templateContent: templateMatch[0],
      templateStartIndex: templateMatch.index ?? 0
    };
  }

  private auditTemplateQuoteEscaping(relPath: string, content: string): void {
    const template = this.extractTemplateBlock(content);
    if (!template) return;

    const { templateContent, templateStartIndex } = template;

    // Scan lines for patterns like :attr="foo || "bar""
    const lines = templateContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i]!;
      // Detect unescaped double quotes inside attribute value
      if (TEMPLATE_QUOTE_ESCAPE_REGEX.test(lineText)) {
        const line = this.getLineNumber(content, templateStartIndex) + i;

        if (this.hasEscapeHatch(lineText, ['template-ok', 'sfc-ok'])) {
          continue;
        }

        this.addViolation({
          ruleId: 'vue-template-quote-escaping',
          severity: 'error',
          file: relPath,
          line,
          message: `Unescaped double quotes detected inside template attribute binding. Use single quotes for inner string literals.`,
          context: lineText.trim()
        });
      }
    }
  }

  private auditDataProviderInTemplate(relPath: string, content: string): void {
    const template = this.extractTemplateBlock(content);
    if (!template) return;

    const { templateContent, templateStartIndex } = template;

    const config = getAuditConfig(this.projectRoot);
    const customPatterns = config.templates?.forbiddenTemplateCallPatterns;
    const regex = customPatterns && customPatterns.length > 0
      ? new RegExp(`\\{\\{[^}]*\\b(?:${customPatterns.join('|')})`, 'g')
      : DEFAULT_DATA_PROVIDER_IN_TEMPLATE_REGEX;

    this.scanRegexMatches(
      templateContent,
      regex,
      relPath,
      'no-data-provider-in-template',
      ['template-ok', 'sfc-ok'],
      `Direct call to heavy data provider inside template render loop. Move calls to computed properties or script helpers.`,
      undefined,
      content,
      templateStartIndex
    );
  }
}

// Standalone execution support
await BaseAuditor.runCliIfMain(import.meta.url, new VueSfcHygieneAuditor());
