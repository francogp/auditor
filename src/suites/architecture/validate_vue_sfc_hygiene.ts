/**
 * scripts/auditors/architecture/validate_vue_sfc_hygiene.ts
 *
 * VUE SFC & SCRIPT SETUP HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Enforces Vue 3 Composition API & Single File Component architecture rules (vue-best-practices):
 *   1. Script Setup Required (`script-setup-required`)
 *   2. No Script Setup Exports (`no-script-setup-exports`)
 *   3. Vue Template Quote Escaping (`vue-template-quote-escaping`)
 *   4. No Heavy Data Providers in Templates (`no-data-provider-in-template`)
 *   5. No Magic Calculations in Templates (`vue-template-magic-calculation`)
 *   6. IME-Safe Enter Submission (`ime-unsafe-enter-submit`)
 *   7. Pure Template Expressions Without Side Effects (`vue-template-no-side-effects`)
 */

import fs from 'node:fs';
import { enableCompileCache } from 'node:module';
import path from 'node:path';

import type ts from 'typescript';

import {
  MODERN_VUE_HYGIENE_RULES,
  analyzeImeSafeEnterInScriptAst,
  analyzeTemplateSideEffectsAst
} from '../../analyzers/vueModernHygieneAnalyzer.ts';
import { SharedAstContext } from '../../core/astContext.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  FileScanAuditor,
  createRuleCapabilities,
  resolveFileScanRoots,
  type FileScanRootsOptions
} from '../../core/auditorBase.ts';
import { parseVueSfc, parseVueSfcBlocks } from '../../core/vueSfcParser.ts';

enableCompileCache();

export const VUE_SFC_HYGIENE_RULES = [
  'script-setup-required',
  'no-script-setup-exports',
  'vue-template-quote-escaping',
  'no-data-provider-in-template',
  'vue-template-magic-calculation',
  ...MODERN_VUE_HYGIENE_RULES
] as const;

export type VueSfcHygieneRuleId = (typeof VUE_SFC_HYGIENE_RULES)[number];

export const SCRIPT_TAG_CONTEXT_MAX_CHARS = 80;

const OPTIONS_API_EXPORT_REGEX = /export\s+default\s*\{/g;
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
  private readonly astCache = new SharedAstContext();

  public constructor(options: FileScanRootsOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(options, (cfg) => [
      ...(cfg.paths.componentsRoots ?? []),
      ...(cfg.paths.viewsRoots ?? [])
    ]);
    super({
      ruleFixers: {},
      fixableRuleIds: ['ime-unsafe-enter-submit', 'vue-template-no-side-effects'],
      usesThirdPartyTool: false,
      requiredPermissions: [],
      roots: targetRoots,
      projectRoot: effectiveRoot,
      ruleCapabilities: createRuleCapabilities(VUE_SFC_HYGIENE_RULES, {
        speed: 'light',
        phase: 'normal',
        md: false,
        ast: true,
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
        'vue-template-magic-calculation': 'Magic calculation in Vue template',
        'ime-unsafe-enter-submit': 'Enter key handler missing !e.isComposing',
        'vue-template-no-side-effects': 'Mutating .sort/.reverse/.splice in template'
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
          '<template><span>{{ taxAmount }}</span></template>',
        'ime-unsafe-enter-submit':
          '1. Root Cause:\n' +
          'A keyboard submission handler checks `event.key === "Enter"` without verifying `!event.isComposing`. When users type with CJK or mobile IME composition, pressing Enter to confirm an IME candidate triggers premature form/message submission.\n\n' +
          '2. Diagnosis:\n' +
          'Inspect the `keydown` handler in `<script setup>` at the reported line.\n\n' +
          '3. Canonical Solution:\n' +
          'Guard the Enter key check with `&& !event.isComposing`. Run `npm run auditor:fix` to auto-repair.\n\n' +
          '4. Example / Auto-fix command:\n' +
          '// ❌ Premature IME submit: if (e.key === "Enter") submitChat();\n' +
          '// ✅ IME-safe submit:      if (e.key === "Enter" && !e.isComposing) submitChat();',
        'vue-template-no-side-effects':
          '1. Root Cause:\n' +
          'An in-place mutating array method (`.sort()`, `.reverse()`, `.splice()`) or state mutation operator (`++`, `--`) was invoked inside a non-event `<template>` expression. Mutating reactive state during render triggers infinite re-render loops.\n\n' +
          '2. Diagnosis:\n' +
          'Locate the `.sort()`, `.reverse()`, or `.splice()` call in the `<template>`.\n\n' +
          '3. Canonical Solution:\n' +
          'Use ES2023 immutable methods (`.toSorted()`, `.toReversed()`, `.toSpliced()`) or move the transformation to a `computed()` property. Run `npm run auditor:fix` to auto-migrate `.sort()`/`.reverse()`.\n\n' +
          '4. Example / Auto-fix command:\n' +
          '// ❌ Mutates state in render: <li v-for="item in items.sort()" :key="item.id">\n' +
          '// ✅ Immutable render:        <li v-for="item in items.toSorted()" :key="item.id">'
      },
      allowedExtensions: new Set(['.vue'])
    });
  }

  protected override scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile): void {
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

    // 6 & 7. Audit modern Vue AST rules (IME-safe Enter & pure template expressions)
    this.auditModernVueHygieneRules(relPath, content, sourceFile);
  }

  private auditModernVueHygieneRules(
    relPath: string,
    content: string,
    sourceFile?: ts.SourceFile
  ): void {
    const isFix = this.isFixActive();
    const absFile = path.resolve(this.projectRoot, relPath);
    let updatedContent: string | undefined;

    this.runSubAuditorSync('ime-unsafe-enter-submit', () => {
      const sf = sourceFile ?? this.astCache.getSourceFile(relPath, content);
      const imeRes = analyzeImeSafeEnterInScriptAst(content, sf, isFix);
      for (const f of imeRes.findings) {
        this.addViolation({
          ruleId: 'ime-unsafe-enter-submit',
          severity: 'error',
          file: relPath,
          line: f.line,
          message: f.message,
          context: f.context
        });
      }
      if (isFix && imeRes.fixedContent !== undefined) {
        updatedContent = imeRes.fixedContent;
      }
    });

    this.runSubAuditorSync('vue-template-no-side-effects', () => {
      const baseContent = updatedContent ?? content;
      const sfc = parseVueSfc(baseContent);
      if (!sfc.template) return;

      const tplRes = analyzeTemplateSideEffectsAst(
        baseContent,
        sfc.template.content,
        sfc.template.contentStartIndex,
        this.astCache,
        isFix
      );
      for (const f of tplRes.findings) {
        this.addViolation({
          ruleId: 'vue-template-no-side-effects',
          severity: 'error',
          file: relPath,
          line: f.line,
          message: f.message,
          context: f.context
        });
      }
      if (isFix && tplRes.fixedContent !== undefined) {
        updatedContent = tplRes.fixedContent;
      }
    });

    if (isFix && updatedContent !== undefined && fs.existsSync(absFile)) {
      fs.writeFileSync(absFile, updatedContent, 'utf-8');
    }
  }

  private auditScriptSetup(relPath: string, content: string): void {
    let match: RegExpExecArray | null;
    const optionsRegex = new RegExp(
      OPTIONS_API_EXPORT_REGEX.source,
      OPTIONS_API_EXPORT_REGEX.flags
    );
    while ((match = optionsRegex.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      const lineContent = this.getLineAt(content, line);

      this.addViolation({
        ruleId: 'script-setup-required',
        severity: 'error',
        file: relPath,
        line,
        message: `Options API export default detected. Project mandates Vue 3 Composition API with '<script setup lang="ts">'.`,
        context: lineContent.trim()
      });
    }

    const sfc = parseVueSfc(content);
    if (sfc.scripts.length > 0) {
      const hasSetup = sfc.scripts.some((s) => s.isSetup);
      if (!hasSetup) {
        this.addViolation({
          ruleId: 'script-setup-required',
          severity: 'error',
          file: relPath,
          line: 1,
          message: `Component has <script> but lacks 'setup'. All Vue components must use '<script setup lang="ts">'.`,
          context: sfc.scripts[0]!.rawBlock.slice(0, SCRIPT_TAG_CONTEXT_MAX_CHARS)
        });
      }
    }
  }

  private auditScriptSetupExports(relPath: string, content: string): void {
    const sfc = parseVueSfc(content);

    for (const sBlock of sfc.scripts) {
      if (!sBlock.isSetup) continue;

      let expMatch: RegExpExecArray | null;
      const expRegex = new RegExp(
        SCRIPT_SETUP_EXPORT_REGEX.source,
        SCRIPT_SETUP_EXPORT_REGEX.flags
      );

      while ((expMatch = expRegex.exec(sBlock.content)) !== null) {
        const fullIndex = sBlock.contentStartIndex + expMatch.index;
        const line = this.getLineNumber(content, fullIndex);
        const lineContent = this.getLineAt(content, line);

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

    const lines = templateContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i]!;
      if (TEMPLATE_QUOTE_ESCAPE_REGEX.test(lineText)) {
        const line = this.getLineNumber(content, templateStartIndex) + i;

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
    const masked = templateContent.replace(/<!--[\s\S]*?-->/g, (match) => ' '.repeat(match.length));

    const results: Array<{ expression: string; offsetInTemplate: number }> = [];

    const interpolationRegex = /\{\{([\s\S]*?)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = interpolationRegex.exec(masked)) !== null) {
      const inner = m[1] ?? '';
      results.push({
        expression: inner,
        offsetInTemplate: m.index + 2
      });
    }

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

      if (dbRegex) {
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

  private reportTemplateViolation(
    relPath: string,
    content: string,
    fullIndex: number,
    message: string
  ): void {
    const line = this.getLineNumber(content, fullIndex);
    const lineContent = this.getLineAt(content, line);

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

await BaseAuditor.runCliIfMain(import.meta.url, new VueSfcHygieneAuditor());
