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
  createUniformRemediationPhases, FileScanAuditor, createRuleCapabilities } from '../../core/auditorBase.ts';
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

function resolveVueSfcScanRoots(
  roots?: readonly string[],
  projectRoot?: string
): readonly string[] {
  if (roots) return roots;
  const cfg = getAuditConfig(projectRoot);
  return [...(cfg.paths.componentsRoots ?? []), ...(cfg.paths.viewsRoots ?? [])];
}

export class VueSfcHygieneAuditor extends FileScanAuditor<VueSfcHygieneRuleId> {
  constructor(roots?: readonly string[], projectRoot?: string) {
    const sfcRoots = resolveVueSfcScanRoots(roots, projectRoot);
    super({
      usesThirdPartyTool: false,
      roots: sfcRoots,
      projectRoot,
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
      description: 'Verifica estándares de Vue SFC y <script setup lang="ts">',
      family: 'architecture',
      ruleIds: VUE_SFC_HYGIENE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(VUE_SFC_HYGIENE_RULES, 'behavior'),
      packageName: 'Vue',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      icon: '💚',
      ruleDescriptions: {
        'script-setup-required': 'Componente sin script setup',
        'no-script-setup-exports': 'Export dentro de script setup',
        'vue-template-quote-escaping': 'Comillas sin escapar en template',
        'no-data-provider-in-template': 'Data provider en template',
        'vue-template-magic-calculation': 'Cálculo mágico en template Vue'
      },
      ruleRemediations: {
        'script-setup-required':
          'Causa Raíz:\n' +
          'Se detectó un componente Vue utilizando la API heredada de Opciones ("export default { ... }") o un bloque <script> que no declara el atributo "setup".\n' +
          'El estándar mandatorio de arquitectura del repositorio exige Vue 3 Composition API nativa con "<script setup lang=\\"ts\\">" para maximizar la inferencia estricta de TypeScript, reducir el código repetitivo y optimizar el rendimiento del compilador.\n\n' +
          'Diagnóstico:\n' +
          'Revisa el tag de script del componente. Debe ser exactamente "<script setup lang=\\"ts\\">".\n\n' +
          'Solución Canónica:\n' +
          'Migrar el componente a Composition API con script setup:\n' +
          '1. Sustituir "data()" por llamadas a "ref()" o "reactive()".\n' +
          '2. Reemplazar "computed: { ... }" por constantes "computed(() => ...)".\n' +
          '3. Declarar métodos como funciones flecha o funciones estándar de TypeScript.\n' +
          '4. Declarar props con "const props = defineProps<{ ... }>()" y eventos con "const emit = defineEmits<{ ... }>()".\n\n' +
          'Ejemplo Antes vs Después:\n' +
          '// ❌ Incorrecto: Options API heredada\n' +
          '<script lang="ts">\n' +
          'export default {\n' +
          '  data() { return { count: 0 }; },\n' +
          '  methods: { increment() { this.count++; } }\n' +
          '};\n' +
          '</script>\n\n' +
          '// ✅ Correcto: script setup moderno\n' +
          '<script setup lang="ts">\n' +
          'import { ref } from "vue";\n' +
          'const count = ref(0);\n' +
          'const increment = () => { count.value++; };\n' +
          '</script>',
        'no-script-setup-exports':
          'Causa Raíz:\n' +
          'Se detectó una sentencia "export" ("export const", "export type", "export interface", "export enum") dentro de un bloque "<script setup>".\n' +
          'Por especificación oficial de Vue SFC, <script setup> representa el cuerpo de la función setup del componente, no un módulo estándar. Realizar exportaciones internas rompe herramientas de análisis estático, Vite y linters de SFC.\n\n' +
          'Diagnóstico:\n' +
          'Busca palabras clave "export" dentro de <script setup>.\n\n' +
          'Solución Canónica:\n' +
          '1. Si el tipo o interfaz debe compartirse con otros componentes o stores, extráelo a un archivo de contratos complementario (ej. "src/types/...ts" o un archivo compañero "[Componente]Types.ts").\n' +
          '2. Si el símbolo solo se usa dentro de este componente, elimina la palabra clave "export".\n\n' +
          'Ejemplo Antes vs Después:\n' +
          '// ❌ Incorrecto: export dentro de script setup\n' +
          '<script setup lang="ts">\n' +
          'export interface CardProps { title: string; }\n' +
          '</script>\n\n' +
          '// ✅ Correcto: tipo extraído a archivo independiente o mantenido local\n' +
          '<script setup lang="ts">\n' +
          'interface CardProps { title: string; }\n' +
          'defineProps<CardProps>();\n' +
          '</script>',
        'vue-template-quote-escaping':
          'Causa Raíz:\n' +
          'Se detectaron comillas dobles sin escapar o mal balanceadas dentro de un atributo dinámico con comillas dobles en el <template> (ej. :alt="tier?.name || \\"Bronce\\"").\n' +
          'Esto confunde el parser de atributos HTML y el compilador de templates de Vite / Vue, arrojando errores de sintaxis en tiempo de build.\n\n' +
          'Diagnóstico:\n' +
          'Examina el atributo dinámico señalado en el reporte.\n\n' +
          'Solución Canónica:\n' +
          'Alternar comillas dobles y simples: usar comillas simples para literales de string dentro de expresiones delimitadas por comillas dobles.\n\n' +
          'Ejemplo Antes vs Después:\n' +
          '// ❌ Incorrecto: comillas dobles anidadas sin escapar\n' +
          '<img :alt="user?.role || \\"Invitado\\"" />\n\n' +
          '// ✅ Correcto: comillas simples en el string interior\n' +
          '<img :alt="user?.role || \'Invitado\'" />',
        'no-data-provider-in-template':
          'Causa Raíz:\n' +
          'Se invocó un método de proveedor de persistencia o base de datos (ej. "dataProvider.get...", "supabase...", "db...") directamente dentro de una interpolación {{ ... }} o directiva :prop en el <template>.\n' +
          'El template se re-evalúa en cada frame o ciclo reactivo de Vue; llamar a proveedores de datos en el template genera tormentas de consultas, bloqueos de UI y pérdida severa de rendimiento.\n\n' +
          'Diagnóstico:\n' +
          'Revisa el template y localiza llamadas a métodos o clientes de persistencia dentro de {{ ... }} o atributos.\n\n' +
          'Solución Canónica:\n' +
          'Mover la consulta a una función o ciclo de carga en "<script setup>", almacenando el resultado en un "ref()" o "computed()", y vincular el template únicamente a dicha variable reactiva.\n\n' +
          'Ejemplo Antes vs Después:\n' +
          '// ❌ Incorrecto: invocación directa del data provider en template\n' +
          '<span>{{ dataProvider.getStats(userId) }}</span>\n\n' +
          '// ✅ Correcto: carga en script setup y lectura de estado\n' +
          '<script setup lang="ts">\n' +
          'const stats = ref<UserStats | null>(null);\n' +
          'onMounted(async () => { stats.value = await dataProvider.getStats(props.userId); });\n' +
          '</script>\n' +
          '<template><span>{{ stats?.score }}</span></template>',
        'vue-template-magic-calculation':
          'Causa Raíz:\n' +
          'Se detectaron operaciones matemáticas o comparaciones complejas con números mágicos directamente dentro del <template> (ej. "v-if=\\"items.length > 5\\"", "{{ (price * 1.21).toFixed(2) }}").\n' +
          'Los templates de Vue deben permanecer declarativos y dedicados a la presentación. Los cálculos matemáticos y constantes numéricas deben residir en TypeScript para favorecer la tipificación estricta y los tests unitarios.\n\n' +
          'Diagnóstico:\n' +
          'Busca operadores matemáticos (*, /, %, +, -) o comparaciones numéricas (> 1, === 42) dentro del marcado template.\n\n' +
          'Solución Canónica:\n' +
          'Mover la lógica a una propiedad "computed()" con nombre semántico en el bloque "<script setup>".\n\n' +
          'Ejemplo Antes vs Después:\n' +
          '// ❌ Incorrecto: cálculo de impuestos inline en template\n' +
          '<span>{{ (subtotal * 0.21).toFixed(2) }}</span>\n\n' +
          '// ✅ Correcto: derivación en computed con constante nombrada\n' +
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
            `Acceso directo a persistencia/base de datos detectado en template Vue. Cachea los datos con computed o acciones en <script>.`
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
          message: `Cálculo o comparación con número mágico en template Vue ('${matchedSnippet}'). Mueve la lógica a un 'computed()' en <script setup>.`,
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
