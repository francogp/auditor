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
import { BaseAuditor,
  createUniformRemediationPhases, FileScanAuditor, createRuleCapabilities, resolveFileScanRoots, type FileScanRootsOptions } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { parseVueSfcBlocks } from '../../core/vueSfcParser.ts';

enableCompileCache();

export type VueSfcHygieneRuleId =
  | 'script-setup-required'
  | 'no-script-setup-exports'
  | 'vue-template-quote-escaping'
  | 'no-data-provider-in-template'
  | 'vue-template-magic-calculation';

export const VUE_SFC_HYGIENE_RULES: readonly VueSfcHygieneRuleId[] = [
  'script-setup-required',
  'no-script-setup-exports',
  'vue-template-quote-escaping',
  'no-data-provider-in-template',
  'vue-template-magic-calculation'
] as const;

export const SCRIPT_TAG_CONTEXT_MAX_CHARS = 80;

const OPTIONS_API_EXPORT_REGEX = /export\s+default\s*\{/g;
const SCRIPT_TAG_REGEX = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const SCRIPT_SETUP_EXPORT_REGEX =
  /^\s*export\s+(?:const|let|var|function|type|interface|class|enum)\b/gm;
const TEMPLATE_QUOTE_ESCAPE_REGEX =
  /(?:\s:|\bv-bind:)[\w-]+="[^"\n]*\\"[^"\n]*"|(?:\s:|\bv-bind:)[\w-]+="[^"\n]*"[\w$]/;
export const DEFAULT_DATA_PROVIDER_IN_TEMPLATE_REGEX =
  /\{\{[^}]*\b(?:\w*DataProvider|dataProvider)\.\w+\s*\(/g;

const MULT_DIV_MOD_REGEX = /[*/%]\s*\d+(?:\.\d+)?|\b\d+(?:\.\d+)?\s*[*/%]/;
const COMPARISON_REGEX =
  /(?:===|!==|==|!=|<=|>=|<|>)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:===|!==|==|!=|<=|>=|<|>)/g;
const ADD_SUB_REGEX = /(?:\+|-)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:\+|-)/g;

function checkMultDivMod(code: string): string | null {
  const m = MULT_DIV_MOD_REGEX.exec(code);
  return m ? m[0].trim() : null;
}

function checkMagicComparison(code: string): string | null {
  const compRegex = new RegExp(COMPARISON_REGEX.source, COMPARISON_REGEX.flags);
  let compMatch: RegExpExecArray | null;
  while ((compMatch = compRegex.exec(code)) !== null) {
    const val = Number(compMatch[1] ?? compMatch[2]);
    if (val !== 0 && val !== 1) {
      return compMatch[0].trim();
    }
  }
  return null;
}

function checkMagicAddSub(code: string): string | null {
  const addRegex = new RegExp(ADD_SUB_REGEX.source, ADD_SUB_REGEX.flags);
  let addMatch: RegExpExecArray | null;
  while ((addMatch = addRegex.exec(code)) !== null) {
    const val = Number(addMatch[1] ?? addMatch[2]);
    if (val > 1) {
      return addMatch[0].trim();
    }
  }
  return null;
}

function detectTemplateMagicCalculation(expression: string): string | null {
  const trimmed = expression.trim();
  if (!trimmed || !/\d/.test(trimmed)) return null;
  if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) return null;

  const codeOnly = trimmed.replace(/'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`[\s\S]*?`/g, (match) =>
    ' '.repeat(match.length)
  );
  return checkMultDivMod(codeOnly) ?? checkMagicComparison(codeOnly) ?? checkMagicAddSub(codeOnly);
}

export class VueSfcHygieneAuditor extends FileScanAuditor<VueSfcHygieneRuleId> {
  constructor(options: FileScanRootsOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(
      options,
      (cfg) => [...(cfg.paths.componentsRoots ?? []), ...(cfg.paths.viewsRoots ?? [])]
    );
    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      roots: targetRoots,
      projectRoot: effectiveRoot,
      ruleCapabilities: createRuleCapabilities(VUE_SFC_HYGIENE_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_vue_sfc_hygiene',
      name: 'Vue SFC & Script Setup Hygiene Auditor',
      description: 'Verifies Vue SFC standards and <script setup lang="ts">',
      family: 'architecture',
      ruleIds: VUE_SFC_HYGIENE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(VUE_SFC_HYGIENE_RULES, 'behavior'),
      packageName: 'Vue',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      icon: '💚',
      ruleDescriptions: {
        'script-setup-required': 'Component missing script setup',
        'no-script-setup-exports': 'Export inside script setup',
        'vue-template-quote-escaping': 'Unescaped quotes in template',
        'no-data-provider-in-template': 'Data provider in template',
        'vue-template-magic-calculation': 'Magic calculation in Vue template'
      },
      ruleRemediations: {
        'script-setup-required':
          '1. Root Cause:\n' +
          'A Vue component was detected using legacy Options API ("export default { ... }") or a <script> block missing the "setup" attribute.\n' +
          'The mandatory architecture standard requires native Vue 3 Composition API with "<script setup lang=\\"ts\\">" to maximize TypeScript inference, eliminate boilerplate, and optimize compiler performance.\n\n' +
          '2. Diagnosis:\n' +
          'Check the script tag of the component. It must be exactly "<script setup lang=\\"ts\\">".\n\n' +
          '3. Canonical Solution:\n' +
          'Migrate the component to Composition API with script setup:\n' +
          '1. Replace "data()" with "ref()" or "reactive()" calls.\n' +
          '2. Replace "computed: { ... }" with "computed(() => ...)" constants.\n' +
          '3. Declare methods as standard TypeScript arrow or function declarations.\n' +
          '4. Declare props via "const props = defineProps<{ ... }>()" and emits via "const emit = defineEmits<{ ... }>()".\n\n' +
          '4. Example / Auto-fix command:\n' +
          '// ❌ Incorrect: legacy Options API\n' +
          '<script lang="ts">\n' +
          'export default {\n' +
          '  data() { return { count: 0 }; },\n' +
          '  methods: { increment() { this.count++; } }\n' +
          '};\n' +
          '</script>\n\n' +
          '// ✅ Correct: modern script setup\n' +
          '<script setup lang="ts">\n' +
          'import { ref } from "vue";\n' +
          'const count = ref(0);\n' +
          'const increment = () => { count.value++; };\n' +
          '</script>',
        'no-script-setup-exports':
          '1. Root Cause:\n' +
          'An "export" statement ("export const", "export type", "export interface", "export enum") was detected inside a "<script setup>" block.\n' +
          'Per the official Vue SFC specification, <script setup> represents the body of the component setup function, not a standard ES module. Internal exports break static analysis tools, Vite, and SFC linters.\n\n' +
          '2. Diagnosis:\n' +
          'Look for "export" keywords inside <script setup>.\n\n' +
          '3. Canonical Solution:\n' +
          '1. If the type or interface must be shared across components or stores, extract it to a companion contracts file (e.g. "src/types/...ts" or a companion "[Component]Types.ts").\n' +
          '2. If the symbol is only used locally within this component, remove the "export" keyword.\n\n' +
          '4. Example / Auto-fix command:\n' +
          '// ❌ Incorrect: export inside script setup\n' +
          '<script setup lang="ts">\n' +
          'export interface CardProps { title: string; }\n' +
          '</script>\n\n' +
          '// ✅ Correct: local interface or extracted to types file\n' +
          '<script setup lang="ts">\n' +
          'interface CardProps { title: string; }\n' +
          'defineProps<CardProps>();\n' +
          '</script>',
        'vue-template-quote-escaping':
          '1. Root Cause:\n' +
          'Unescaped or unbalanced double quotes were detected inside a double-quoted dynamic attribute binding in the <template> (e.g. :alt="tier?.name || \\"Bronze\\"").\n' +
          'This breaks HTML attribute parsing and Vite / Vue template compilation, producing build-time syntax errors.\n\n' +
          '2. Diagnosis:\n' +
          'Inspect the dynamic attribute flagged in the report.\n\n' +
          '3. Canonical Solution:\n' +
          'Alternate quotes: use single quotes for inner string literals within double-quoted attribute expressions.\n\n' +
          '4. Example / Auto-fix command:\n' +
          '// ❌ Incorrect: unescaped nested double quotes\n' +
          '<img :alt="user?.role || \\"Guest\\"" />\n\n' +
          '// ✅ Correct: single quotes for inner string\n' +
          '<img :alt="user?.role || \'Guest\'" />',
        'no-data-provider-in-template':
          '1. Root Cause:\n' +
          'A persistence or database provider method (e.g. "dataProvider.get...", "supabase...", "db...") was invoked directly inside a template interpolation {{ ... }} or dynamic attribute binding :prop.\n' +
          'Templates re-evaluate on every render cycle; calling data providers inside templates causes query waterfalls, UI jank, and severe performance degradation.\n\n' +
          '2. Diagnosis:\n' +
          'Inspect template expressions for database clients or provider method calls.\n\n' +
          '3. Canonical Solution:\n' +
          'Move the query to an asynchronous fetch routine in "<script setup>", store the result in a "ref()" or "computed()", and bind the template strictly to that reactive state.\n\n' +
          '4. Example / Auto-fix command:\n' +
          '// ❌ Incorrect: direct data provider call in template\n' +
          '<span>{{ dataProvider.getStats(userId) }}</span>\n\n' +
          '// ✅ Correct: fetch in script setup and bind reactive state\n' +
          '<script setup lang="ts">\n' +
          'const stats = ref<UserStats | null>(null);\n' +
          'onMounted(async () => { stats.value = await dataProvider.getStats(props.userId); });\n' +
          '</script>\n' +
          '<template><span>{{ stats?.score }}</span></template>',
        'vue-template-magic-calculation':
          '1. Root Cause:\n' +
          'Mathematical calculations or complex comparisons with magic numbers were detected inside the <template> (e.g. "v-if=\\"items.length > 5\\"", "{{ (price * 1.21).toFixed(2) }}").\n' +
          'Vue templates must remain declarative and focused on presentation. Calculations and numeric constants must reside in TypeScript for strong typing and testability.\n\n' +
          '2. Diagnosis:\n' +
          'Search for arithmetic operators (*, /, %, +, -) or numeric comparisons (> 1, === 42) in template markup.\n\n' +
          '3. Canonical Solution:\n' +
          'Extract the expression into a semantically named "computed()" property in the "<script setup>" block.\n\n' +
          '4. Example / Auto-fix command:\n' +
          '// ❌ Incorrect: inline math in template\n' +
          '<span>{{ (subtotal * 0.21).toFixed(2) }}</span>\n\n' +
          '// ✅ Correct: computed property with named constant\n' +
          '<script setup lang="ts">\n' +
          'const VAT_RATE = 0.21;\n' +
          'const taxAmount = computed(() => (props.subtotal * VAT_RATE).toFixed(2));\n' +
          '</script>\n' +
          '<template><span>{{ taxAmount }}</span></template>'
      },
      allowedExtensions: new Set(['.vue'])
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    // 1. Audit Script Setup requirement and Options API prohibition
    this.runSubAuditorSync('script-setup-required', () => {
      this.auditScriptSetup(relPath, content);
    });

    // 2. Audit exports inside <script setup>
    this.runSubAuditorSync('no-script-setup-exports', () => {
      this.auditScriptSetupExports(relPath, content);
    });

    // 3. Audit template quote escaping
    this.runSubAuditorSync('vue-template-quote-escaping', () => {
      this.auditTemplateQuoteEscaping(relPath, content);
    });

    // 4. Audit data provider calls in template
    this.runSubAuditorSync('no-data-provider-in-template', () => {
      this.auditDataProviderInTemplate(relPath, content);
    });

    // 5. Audit magic calculations and comparisons in template expressions
    this.runSubAuditorSync('vue-template-magic-calculation', () => {
      this.auditTemplateMagicCalculation(relPath, content);
    });
  }

  private auditScriptSetup(relPath: string, content: string): void {
    // Options API detection
    let match: RegExpExecArray | null;
    const optionsRegex = new RegExp(
      OPTIONS_API_EXPORT_REGEX.source,
      OPTIONS_API_EXPORT_REGEX.flags
    );
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
    const scriptMatches = [
      ...content.matchAll(new RegExp(SCRIPT_TAG_REGEX.source, SCRIPT_TAG_REGEX.flags))
    ];
    if (scriptMatches.length > 0) {
      const hasSetup = scriptMatches.some((m) => /\bsetup\b/.test(m[1] ?? ''));
      if (!hasSetup) {
        const firstScriptLine = this.getLineNumber(content, scriptMatches[0]?.index ?? 0);
        const lineContent = this.getLineAt(content, firstScriptLine);
        if (
          !this.hasEscapeHatch(lineContent, ['sfc-ok']) &&
          !this.hasEscapeHatch(content, ['sfc-ok'])
        ) {
          this.addViolation({
            ruleId: 'script-setup-required',
            severity: 'error',
            file: relPath,
            line: 1,
            message: `Component has <script> but lacks 'setup'. All Vue components must use '<script setup lang="ts">'.`,
            context: scriptMatches[0]![0].slice(0, SCRIPT_TAG_CONTEXT_MAX_CHARS)
          });
        }
      }
    }
  }

  private auditScriptSetupExports(relPath: string, content: string): void {
    const scriptMatches = [
      ...content.matchAll(new RegExp(SCRIPT_TAG_REGEX.source, SCRIPT_TAG_REGEX.flags))
    ];

    for (const sMatch of scriptMatches) {
      const attrs = sMatch[1] ?? '';
      if (!/\bsetup\b/.test(attrs)) continue;

      const scriptBody = sMatch[2] ?? '';
      const scriptStartIndex = sMatch.index ?? 0;

      let expMatch: RegExpExecArray | null;
      const expRegex = new RegExp(
        SCRIPT_SETUP_EXPORT_REGEX.source,
        SCRIPT_SETUP_EXPORT_REGEX.flags
      );

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

  private extractTemplateBlock(
    content: string
  ): { templateContent: string; templateStartIndex: number } | null {
    const parsed = parseVueSfcBlocks(content);
    if (!parsed.template) return null;
    return {
      templateContent: parsed.template.rawBlock,
      templateStartIndex: parsed.template.startIndex
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

  private extractDynamicExpressions(
    templateContent: string
  ): Array<{ expression: string; offsetInTemplate: number }> {
    // 1. Mask HTML comments with whitespace to preserve character indices
    const masked = templateContent.replace(/<!--[\s\S]*?-->/g, (match) => ' '.repeat(match.length));

    const results: Array<{ expression: string; offsetInTemplate: number }> = [];

    // 2. Extract mustache interpolations: {{ ... }}
    const interpolationRegex = /\{\{([\s\S]*?)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = interpolationRegex.exec(masked)) !== null) {
      const inner = m[1] ?? '';
      results.push({
        expression: inner,
        offsetInTemplate: m.index + 2
      });
    }

    // 3. Extract dynamic directives in tag attributes: :prop="...", v-bind:prop="...", v-if="...", @event="...", etc.
    const directiveRegex = /(?:v-[\w.:-]+|:[\w.-]+|@[\w.-]+)\s*=\s*(["'])([\s\S]*?)\1/g;
    while ((m = directiveRegex.exec(masked)) !== null) {
      const fullMatch = m[0];
      const inner = m[2] ?? '';
      const quoteChar = m[1] ?? '"';
      const quoteIdx = fullMatch.indexOf(quoteChar);
      const offsetInTemplate = m.index + quoteIdx + 1;
      results.push({
        expression: inner,
        offsetInTemplate
      });
    }

    return results;
  }

  private getTemplateDynamicExpressions(content: string): {
    templateStartIndex: number;
    dynamicExpressions: Array<{ expression: string; offsetInTemplate: number }>;
  } | null {
    const template = this.extractTemplateBlock(content);
    if (!template) return null;
    return {
      templateStartIndex: template.templateStartIndex,
      dynamicExpressions: this.extractDynamicExpressions(template.templateContent)
    };
  }

  private auditDataProviderInTemplate(relPath: string, content: string): void {
    const data = this.getTemplateDynamicExpressions(content);
    if (!data) return;

    const { templateStartIndex, dynamicExpressions } = data;
    const config = getAuditConfig(this.projectRoot);
    const customPatterns = config.templates?.forbiddenTemplateCallPatterns;
    const providerRegex =
      customPatterns && customPatterns.length > 0
        ? new RegExp(`\\b(?:${customPatterns.join('|')})`, 'i')
        : /\b\w*DataProvider\.\w+\s*\(/i;

    const prohibitedDb = config.persistence?.prohibitedTemplateIdentifiers?.length
      ? config.persistence.prohibitedTemplateIdentifiers
      : config.persistence?.engine === 'none'
        ? []
        : ['supabase', 'db'];
    const dbRegex =
      prohibitedDb.length > 0 ? new RegExp(`\\b(?:${prohibitedDb.join('|')})\\b`, 'i') : null;

    for (const { expression, offsetInTemplate } of dynamicExpressions) {
      // 1. Check heavy data providers (e.g. dataProvider.get...)
      const providerMatch = providerRegex.exec(expression);
      if (providerMatch) {
        const fullIndex = templateStartIndex + offsetInTemplate + providerMatch.index;
        this.reportTemplateViolation(
          relPath,
          content,
          fullIndex,
          `Direct call to heavy data provider inside template render loop. Move calls to computed properties or script helpers.`
        );
      }

      // 2. Check prohibited database client identifiers outside string literals
      if (dbRegex) {
        // Strip string literals inside expression to avoid matching strings like tab === 'db'
        const strippedExpression = expression.replace(/'(?:\\.|[^'])*'|"(?:\\.|[^"])*"/g, (match) =>
          ' '.repeat(match.length)
        );
        const dbMatch = dbRegex.exec(strippedExpression);
        if (dbMatch) {
          const fullIndex = templateStartIndex + offsetInTemplate + dbMatch.index;
          this.reportTemplateViolation(
            relPath,
            content,
            fullIndex,
            `Direct access to database or persistence client detected in Vue template. Cache data via computed properties or script actions.`
          );
        }
      }
    }
  }

  private auditTemplateMagicCalculation(relPath: string, content: string): void {
    const data = this.getTemplateDynamicExpressions(content);
    if (!data) return;

    const { templateStartIndex, dynamicExpressions } = data;

    for (const { expression, offsetInTemplate } of dynamicExpressions) {
      const matchedSnippet = detectTemplateMagicCalculation(expression);
      if (!matchedSnippet) continue;

      const fullIndex = templateStartIndex + offsetInTemplate;
      const line = this.getLineNumber(content, fullIndex);
      const lineContent = this.getLineAt(content, line);

      if (!this.hasEscapeHatch(lineContent, ['template-ok', 'sfc-ok'])) {
        this.addViolation({
          ruleId: 'vue-template-magic-calculation',
          severity: 'error',
          file: relPath,
          line,
          message: `Magic calculation or comparison in Vue template ('${matchedSnippet}'). Move logic to a 'computed()' property in <script setup>.`,
          context: lineContent.trim()
        });
      }
    }
  }

  private reportTemplateViolation(
    relPath: string,
    content: string,
    fullIndex: number,
    message: string
  ): void {
    const line = this.getLineNumber(content, fullIndex);
    const lineContent = this.getLineAt(content, line);

    if (!this.hasEscapeHatch(lineContent, ['template-ok', 'sfc-ok'])) {
      this.addViolation({
        ruleId: 'no-data-provider-in-template',
        severity: 'error',
        file: relPath,
        line,
        message,
        context: lineContent.trim()
      });
    }
  }
}

// Standalone execution support
await BaseAuditor.runCliIfMain(import.meta.url, new VueSfcHygieneAuditor());
