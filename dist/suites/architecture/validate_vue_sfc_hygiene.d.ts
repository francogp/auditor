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
import { FileScanAuditor } from '../../core/auditorBase.ts';
export type VueSfcHygieneRuleId = 'script-setup-required' | 'no-script-setup-exports' | 'vue-template-quote-escaping' | 'no-data-provider-in-template' | 'vue-template-magic-calculation';
export declare const VUE_SFC_HYGIENE_RULES: readonly VueSfcHygieneRuleId[];
export declare const SCRIPT_TAG_CONTEXT_MAX_CHARS = 80;
export declare const DEFAULT_DATA_PROVIDER_IN_TEMPLATE_REGEX: RegExp;
export declare class VueSfcHygieneAuditor extends FileScanAuditor<VueSfcHygieneRuleId> {
    constructor(roots?: readonly string[], projectRoot?: string);
    protected scanFile(relPath: string, content: string): void;
    private auditScriptSetup;
    private auditScriptSetupExports;
    private extractTemplateBlock;
    private auditTemplateQuoteEscaping;
    private extractDynamicExpressions;
    private auditDataProviderInTemplate;
    private auditTemplateMagicCalculation;
    private reportTemplateViolation;
}
//# sourceMappingURL=validate_vue_sfc_hygiene.d.ts.map