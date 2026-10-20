/**
 * src/suites/architecture/validate_html_validate_config.ts
 *
 * HTML-VALIDATE CONFIGURATION INTEGRITY VALIDATOR (Node.js 26+ Native)
 *
 * Enforces the presence and mandatory baseline integrity of .htmlvalidate.json:
 *   1. Guarantees .htmlvalidate.json exists in the project root.
 *   2. Validates JSON syntax.
 *   3. Enforces the mandatory minimum strict baseline rules:
 *      - no-deprecated-attr: "error"
 *      - deprecated: "error"
 *      - element-permitted-content: "error"
 *      - element-required-attributes: "error"
 *      - attribute-allowed-values: "error"
 *      - doctype-style: ["error", { style: "lowercase" }] (for Vite+ oxfmt harmonization)
 *   4. Enforces required plugins ('html-validate-vue') and transforms for Vue projects.
 *   5. Automatically scaffolds or non-destructively repairs .htmlvalidate.json in --fix mode.
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  createRuleCapabilities,
  collectRepositoryFiles,
  type AuditorOptions
} from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { toPosixRelative } from '../../core/safePath.ts';
import { getPackageJson } from '../../core/packageJson.ts';
import type { AuditorConfigFileRequirement } from '../../core/auditContract.ts';

enableCompileCache();

export type HtmlValidateConfigRuleId =
  | 'html-validate-config-missing'
  | 'html-validate-config-syntax'
  | 'html-validate-config-missing-strict-rule'
  | 'html-validate-config-missing-plugin'
  | 'html-validate-config-missing-transform'
  | 'html-validate-config-missing-doctype-style';

export const HTML_VALIDATE_CONFIG_RULES: readonly HtmlValidateConfigRuleId[] = [
  'html-validate-config-missing',
  'html-validate-config-syntax',
  'html-validate-config-missing-strict-rule',
  'html-validate-config-missing-plugin',
  'html-validate-config-missing-transform',
  'html-validate-config-missing-doctype-style'
] as const;

export const MANDATORY_STRICT_HTML_RULES = [
  'no-deprecated-attr',
  'deprecated',
  'element-permitted-content',
  'element-required-attributes',
  'attribute-allowed-values'
] as const;

export const CANONICAL_HTML_VALIDATE_CONFIG = {
  elements: ['html5'],
  plugins: ['html-validate-vue'],
  extends: ['html-validate:recommended', 'html-validate-vue:recommended'],
  transform: {
    '^.*\\.vue$': 'html-validate-vue'
  },
  rules: {
    'no-deprecated-attr': 'error',
    deprecated: 'error',
    'element-permitted-content': 'error',
    'element-required-attributes': 'error',
    'attribute-allowed-values': 'error',
    'doctype-style': ['error', { style: 'lowercase' }],
    'element-case': 'off',
    'element-name': 'off',
    'no-inline-style': 'off',
    'text-content': 'off',
    'void-style': 'off',
    'no-implicit-button-type': 'off',
    'prefer-native-element': 'off',
    'unique-landmark': 'off',
    'wcag/h63': 'off'
  }
};

export const CANONICAL_HTML_VALIDATE_CONFIG_CONTENT =
  JSON.stringify(CANONICAL_HTML_VALIDATE_CONFIG, null, 2) + '\n';

export const HTML_VALIDATE_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<HtmlValidateConfigRuleId> =
  {
    id: 'html-validate-config',
    file: '.htmlvalidate.json',
    candidateFiles: [
      '.htmlvalidate.json',
      '.htmlvalidate.js',
      '.htmlvalidate.cjs',
      'htmlvalidate.config.js'
    ],
    description: 'Configuración canónica para HTML5 y Vue con html-validate',
    ruleId: 'html-validate-config-missing',
    generateDefaultContent: () => CANONICAL_HTML_VALIDATE_CONFIG_CONTENT,
    customMissingMessage: (_ctx, file) =>
      `No se encontró el archivo de configuración de HTML-Validate '${file}'. Ejecuta "auditor fix" para crearlo automáticamente.`
  };

export function isVueProjectContext(projectRoot: string): boolean {
  try {
    const pkg = getPackageJson(projectRoot);
    if (pkg) {
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.vue || deps['@vitejs/plugin-vue']) return true;
    }
  } catch {
    // catch-ok: fallback to scanning filesystem
  }

  const config = getAuditConfig(projectRoot);
  const uiRoots = [
    ...(config.paths.componentsRoots ?? []),
    ...(config.paths.viewsRoots ?? []),
    'src'
  ];

  for (const r of uiRoots) {
    const fullDir = path.resolve(projectRoot, r);
    if (fs.existsSync(fullDir)) {
      try {
        const vueFiles = collectRepositoryFiles(fullDir, projectRoot, [], new Set(['.vue']));
        if (vueFiles.length > 0) {
          return true;
        }
      } catch {
        // catch-ok: ignore directory read failure
      }
    }
  }

  return false;
}

export class ValidateHtmlValidateConfigAuditor extends BaseAuditor<HtmlValidateConfigRuleId> {
  constructor(
    rootsOrOptions?:
      | readonly string[]
      | (Partial<AuditorOptions<HtmlValidateConfigRuleId>> & {
          projectRoot?: string;
          fix?: boolean;
          configFile?: string;
        }),
    maybeProjectRoot?: string
  ) {
    const isOptionsObj = Boolean(rootsOrOptions && !Array.isArray(rootsOrOptions));
    const optionsObj = isOptionsObj
      ? (rootsOrOptions as Partial<AuditorOptions<HtmlValidateConfigRuleId>> & {
          projectRoot?: string;
          fix?: boolean;
          configFile?: string;
        })
      : undefined;
    const projectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();

    const fixableRules: readonly HtmlValidateConfigRuleId[] = [
      'html-validate-config-missing',
      'html-validate-config-missing-strict-rule',
      'html-validate-config-missing-plugin',
      'html-validate-config-missing-transform',
      'html-validate-config-missing-doctype-style'
    ];

    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(
        HTML_VALIDATE_CONFIG_RULES,
        {
          speed: 'light',
          phase: 'setup',
          fix: 'priority',
          md: false,
          ast: false,
          changedOnly: false,
          critical: true
        },
        fixableRules
      ),
      fixableRuleIds: fixableRules,
      id: 'validate_html_validate_config',
      name: 'HTML-Validate Configuration Integrity Validator',
      description: 'Valida baseline e integridad de .htmlvalidate.json',
      family: 'architecture',
      packageName: 'HTML',
      configKey: 'htmlValidate.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      configFiles: [HTML_VALIDATE_CONFIG_REQUIREMENT],
      icon: '🌐',
      ruleIds: HTML_VALIDATE_CONFIG_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(HTML_VALIDATE_CONFIG_RULES, 'setup'),
      ruleDescriptions: {
        'html-validate-config-missing': 'Archivo .htmlvalidate.json ausente',
        'html-validate-config-syntax': 'Error de sintaxis en configuración',
        'html-validate-config-missing-strict-rule': 'Falta regla estricta obligatoria',
        'html-validate-config-missing-plugin': 'Falta plugin html-validate-vue',
        'html-validate-config-missing-transform': 'Falta transform para archivos Vue',
        'html-validate-config-missing-doctype-style': 'Falta doctype-style lowercase'
      },
      ruleRemediations: {
        'html-validate-config-missing':
          'El archivo .htmlvalidate.json es mandatorio para estandarizar el marcado HTML5 y componentes Vue.\n' +
          '1. Ejecuta "npm run auditor:fix" o "auditor fix" para generar automáticamente la configuración canónica.\n' +
          '2. Verifica que el archivo generado incluya los plugins y transformadores para Vue 3.',
        'html-validate-config-syntax':
          'El archivo .htmlvalidate.json contiene errores de sintaxis JSON inválidos.\n' +
          '1. Abre .htmlvalidate.json y corrige las comas sobrantes o comillas mal cerradas.\n' +
          '2. Valida la sintaxis con un linter JSON o ejecuta "npm run fmt".',
        'html-validate-config-missing-strict-rule':
          'Por mandato de arquitectura estricta (Anti-Castration Mandate), las reglas esenciales de HTML5 no pueden omitirse.\n' +
          '1. Restaura las reglas obligatorias en .htmlvalidate.json (no-deprecated-attr, deprecated, element-permitted-content, element-required-attributes, attribute-allowed-values).\n' +
          '2. Ejecuta "npm run auditor:fix" para re-inyectar el baseline automáticamente.',
        'html-validate-config-missing-plugin':
          'Los proyectos con componentes Vue 3 requieren el plugin "html-validate-vue".\n' +
          '1. Asegúrate de que .htmlvalidate.json contenga "plugins": ["html-validate-vue"].\n' +
          '2. Ejecuta "npm run auditor:fix" para agregarlo automáticamente.',
        'html-validate-config-missing-transform':
          'Para que html-validate procese la sección <template> de los archivos .vue, se debe declarar la transformación.\n' +
          '1. Agrega en "transform": { "^.*\\\\.vue$": "html-validate-vue" }.\n' +
          '2. Ejecuta "npm run auditor:fix" para reparar la configuración.',
        'html-validate-config-missing-doctype-style':
          'Vite+ (oxfmt) formatea <!doctype html> en minúsculas. html-validate debe configurar doctype-style en lowercase.\n' +
          '1. Agrega en rules: "doctype-style": ["error", { "style": "lowercase" }].\n' +
          '2. Ejecuta "npm run auditor:fix" para sincronizar la regla automáticamente.'
      },
      coverage: {
        include: ['.htmlvalidate*']
      },
      projectRoot,
      fix: optionsObj?.fix
    });
  }

  public override async runAudit(): Promise<void> {
    if (this.isSuiteGatingDisabled('HTML-Validate deshabilitado en configuración')) return;

    let configFile: string | null = null;
    this.runSubAuditorSync('html-validate-config-missing', () => {
      configFile = this.resolveConfigFile(HTML_VALIDATE_CONFIG_REQUIREMENT);
    });

    if (!configFile) {
      const ensured = await this.runSubAuditor('html-validate-config-missing', () =>
        this.ensureConfigFile(HTML_VALIDATE_CONFIG_REQUIREMENT)
      );
      if (!ensured) {
        this.markRuleNotApplicable('html-validate-config-syntax', 'Archivo .htmlvalidate.json ausente');
        this.markRuleNotApplicable('html-validate-config-missing-strict-rule', 'Archivo .htmlvalidate.json ausente');
        this.markRuleNotApplicable('html-validate-config-missing-plugin', 'Archivo .htmlvalidate.json ausente');
        this.markRuleNotApplicable('html-validate-config-missing-transform', 'Archivo .htmlvalidate.json ausente');
        this.markRuleNotApplicable('html-validate-config-missing-doctype-style', 'Archivo .htmlvalidate.json ausente');
        return;
      }
      configFile = ensured.resolvedPath;
    }

    const resolvedFile = configFile;

    const relPath = toPosixRelative(this.projectRoot, resolvedFile);
    this.recordScanned(relPath);
    let rawContent: string;
    try {
      rawContent = fs.readFileSync(resolvedFile, 'utf-8');
    } catch {
      this.markRuleNotApplicable('html-validate-config-syntax', 'No se pudo leer el archivo');
      this.markRuleNotApplicable('html-validate-config-missing-strict-rule', 'No se pudo leer el archivo');
      this.markRuleNotApplicable('html-validate-config-missing-plugin', 'No se pudo leer el archivo');
      this.markRuleNotApplicable('html-validate-config-missing-transform', 'No se pudo leer el archivo');
      this.markRuleNotApplicable('html-validate-config-missing-doctype-style', 'No se pudo leer el archivo');
      return;
    }

    let parsed: Record<string, unknown> | null = null;
    this.runSubAuditorSync('html-validate-config-syntax', () => {
      try {
        parsed = JSON.parse(rawContent) as Record<string, unknown>;
      } catch (err) {
        this.addViolation({
          ruleId: 'html-validate-config-syntax',
          severity: 'error',
          file: relPath,
          line: 1,
          message: `Error de sintaxis JSON en ${path.basename(resolvedFile)}: ${(err as Error).message}`,
          context: rawContent.slice(0, 100)
        });
      }
    });

    if (!parsed) {
      this.markRuleNotApplicable('html-validate-config-missing-strict-rule', 'Sintaxis JSON inválida');
      this.markRuleNotApplicable('html-validate-config-missing-plugin', 'Sintaxis JSON inválida');
      this.markRuleNotApplicable('html-validate-config-missing-transform', 'Sintaxis JSON inválida');
      this.markRuleNotApplicable('html-validate-config-missing-doctype-style', 'Sintaxis JSON inválida');
      return;
    }

    const parsedConfig = parsed as Record<string, unknown>;
    let modified = false;
    const isVue = isVueProjectContext(this.projectRoot);

    // 1. Elements check
    this.runSubAuditorSync('html-validate-config-missing-strict-rule', () => {
      const elements = Array.isArray(parsedConfig.elements)
        ? parsedConfig.elements.filter((item): item is string => typeof item === 'string')
        : [];
      if (!elements.includes('html5')) {
        if (this.isFixActive()) {
          elements.push('html5');
          parsedConfig.elements = elements;
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'html-validate-config-missing-strict-rule',
            severity: 'error',
            file: relPath,
            line: 1,
            message: `Falta elemento 'html5' en elements de ${path.basename(resolvedFile)}. Ejecuta "auditor fix" para agregarlo.`,
            context: 'elements'
          });
        }
      }
    });

    // 2. Vue plugins and transforms
    if (isVue) {
      this.runSubAuditorSync('html-validate-config-missing-plugin', () => {
        const plugins = Array.isArray(parsedConfig.plugins)
          ? parsedConfig.plugins.filter((item): item is string => typeof item === 'string')
          : [];
        if (!plugins.includes('html-validate-vue')) {
          if (this.isFixActive()) {
            plugins.push('html-validate-vue');
            parsedConfig.plugins = plugins;
            modified = true;
          } else {
            this.addViolation({
              ruleId: 'html-validate-config-missing-plugin',
              severity: 'error',
              file: relPath,
              line: 1,
              message: `Falta plugin 'html-validate-vue' en plugins de ${path.basename(resolvedFile)}. Ejecuta "auditor fix" para agregarlo.`,
              context: 'plugins'
            });
          }
        }
      });

      this.runSubAuditorSync('html-validate-config-missing-transform', () => {
        const transform =
          typeof parsedConfig.transform === 'object' && parsedConfig.transform !== null
            ? { ...(parsedConfig.transform as Record<string, unknown>) }
            : {};
        let vueTransformKey: string | undefined;
        for (const k in transform) {
          if (k.includes('vue')) {
            vueTransformKey = k;
            break;
          }
        }

        if (!vueTransformKey || transform[vueTransformKey] !== 'html-validate-vue') {
          if (this.isFixActive()) {
            transform['^.*\\.vue$'] = 'html-validate-vue';
            parsedConfig.transform = transform;
            modified = true;
          } else {
            this.addViolation({
              ruleId: 'html-validate-config-missing-transform',
              severity: 'error',
              file: relPath,
              line: 1,
              message: `Falta transformación para archivos Vue ('^.*\\.vue$': 'html-validate-vue') en ${path.basename(resolvedFile)}. Ejecuta "auditor fix" para repararlo.`,
              context: 'transform'
            });
          }
        }
      });
    } else {
      this.markRuleNotApplicable('html-validate-config-missing-plugin', 'No es un proyecto Vue');
      this.markRuleNotApplicable('html-validate-config-missing-transform', 'No es un proyecto Vue');
    }

    // 3. Strict HTML5 baseline rules
    this.runSubAuditorSync('html-validate-config-missing-strict-rule', () => {
      const rules =
        typeof parsedConfig.rules === 'object' && parsedConfig.rules !== null
          ? { ...(parsedConfig.rules as Record<string, unknown>) }
          : {};

      for (const reqRule of MANDATORY_STRICT_HTML_RULES) {
        const ruleVal = rules[reqRule];
        const isSatisfied =
          ruleVal === 'error' ||
          (Array.isArray(ruleVal) && ruleVal[0] === 'error') ||
          ruleVal === 2;

        if (!isSatisfied) {
          if (this.isFixActive()) {
            rules[reqRule] = 'error';
            parsedConfig.rules = rules;
            modified = true;
          } else {
            this.addViolation({
              ruleId: 'html-validate-config-missing-strict-rule',
              severity: 'error',
              file: relPath,
              line: 1,
              message: `Falta la regla estricta obligatoria "${reqRule}: 'error'" en rules de ${path.basename(resolvedFile)}. Ejecuta "auditor fix" para auto-repararla.`,
              context: reqRule
            });
          }
        }
      }
    });

    // 4. Doctype style lowercase rule (Vite+ / oxfmt harmonization)
    this.runSubAuditorSync('html-validate-config-missing-doctype-style', () => {
      const rules =
        typeof parsedConfig.rules === 'object' && parsedConfig.rules !== null
          ? { ...(parsedConfig.rules as Record<string, unknown>) }
          : {};

      const doctypeVal = rules['doctype-style'];
      const isDoctypeAligned =
        (Array.isArray(doctypeVal) &&
          typeof doctypeVal[1] === 'object' &&
          doctypeVal[1] !== null &&
          (doctypeVal[1] as { style?: string }).style === 'lowercase') ||
        doctypeVal === 'off';

      if (!isDoctypeAligned) {
        if (this.isFixActive()) {
          rules['doctype-style'] = ['error', { style: 'lowercase' }];
          parsedConfig.rules = rules;
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'html-validate-config-missing-doctype-style',
            severity: 'error',
            file: relPath,
            line: 1,
            message: `La regla "doctype-style" en ${path.basename(resolvedFile)} debe configurarse como ["error", { "style": "lowercase" }] para armonizar con Vite+ (oxfmt). Ejecuta "auditor fix" para auto-repararla.`,
            context: 'doctype-style'
          });
        }
      }
    });

    // Write back changes if modified in --fix mode
    if (modified && this.isFixActive()) {
      fs.writeFileSync(resolvedFile, JSON.stringify(parsedConfig, null, 2) + '\n', 'utf-8');
    }
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateHtmlValidateConfigAuditor());
