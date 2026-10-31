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
import { enableCompileCache } from 'node:module';
import path from 'node:path';

import { getAuditConfig } from '../../core/auditConfig.ts';
import type { AuditorConfigFileRequirement } from '../../core/auditContract.ts';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  createRuleCapabilities,
  collectRepositoryFiles
} from '../../core/auditorBase.ts';
import { getPackageJson } from '../../core/packageJson.ts';
import { toPosixRelative } from '../../core/safePath.ts';
import { tryOrNull } from '../../core/safeUtils.ts';

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
    description: 'Canonical configuration for HTML5 and Vue with html-validate',
    ruleId: 'html-validate-config-missing',
    generateDefaultContent: () => CANONICAL_HTML_VALIDATE_CONFIG_CONTENT,
    customMissingMessage: (_ctx, file) =>
      `Missing HTML-Validate configuration file '${file}'. Run "npm run auditor:fix" or "auditor fix" to create it automatically.`
  };

export function isVueProjectContext(projectRoot: string): boolean {
  const pkg = tryOrNull(() => getPackageJson(projectRoot));
  if (pkg) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.vue || deps['@vitejs/plugin-vue']) return true;
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
      const vueFiles = tryOrNull(() =>
        collectRepositoryFiles(fullDir, projectRoot, [], new Set(['.vue']))
      );
      if (vueFiles && vueFiles.length > 0) {
        return true;
      }
    }
  }

  return false;
}

export interface HtmlValidateConfigAuditorOptions {
  readonly projectRoot?: string;
  readonly configFile?: string;
}

export class ValidateHtmlValidateConfigAuditor extends BaseAuditor<HtmlValidateConfigRuleId> {
  public constructor(options: HtmlValidateConfigAuditorOptions = {}) {
    const projectRoot = options.projectRoot ?? process.cwd();

    super({
      ruleFixers: {},
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(HTML_VALIDATE_CONFIG_RULES, {
        speed: 'light',
        phase: 'setup',
        md: false,
        ast: false,
        changedOnly: false,
        critical: true
      }),
      id: 'validate_html_validate_config',
      name: 'HTML-Validate Configuration Integrity Validator',
      description: 'Validates .htmlvalidate.json baseline and integrity',
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
        'html-validate-config-missing': 'Missing .htmlvalidate.json file',
        'html-validate-config-syntax': 'Configuration syntax error',
        'html-validate-config-missing-strict-rule': 'Missing mandatory strict rule',
        'html-validate-config-missing-plugin': 'Missing html-validate-vue plugin',
        'html-validate-config-missing-transform': 'Missing transform for Vue files',
        'html-validate-config-missing-doctype-style': 'Missing lowercase doctype-style'
      },
      ruleRemediations: {
        'html-validate-config-missing':
          '📖 REMEDIATION GUIDE: html-validate-config-missing\n' +
          '1. Root Cause: The `.htmlvalidate.json` configuration file is missing from the project root.\n' +
          '2. Diagnosis: Check whether `.htmlvalidate.json` exists in project root.\n' +
          '3. Canonical Solution: Run `npm run auditor:fix` or `auditor fix` to automatically scaffold the canonical HTML-Validate configuration with Vue plugins and transforms.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`',
        'html-validate-config-syntax':
          '📖 REMEDIATION GUIDE: html-validate-config-syntax\n' +
          '1. Root Cause: The `.htmlvalidate.json` file contains invalid JSON syntax.\n' +
          '2. Diagnosis: Inspect `.htmlvalidate.json` for trailing commas, unbalanced brackets, or unquoted keys.\n' +
          '3. Canonical Solution: Fix the invalid JSON syntax or format with `npm run fmt`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   Validate syntax with JSON parser or `npm run fmt`.',
        'html-validate-config-missing-strict-rule':
          '📖 REMEDIATION GUIDE: html-validate-config-missing-strict-rule\n' +
          '1. Root Cause: Under framework Anti-Castration Mandates, mandatory HTML5 validation rules cannot be omitted or silenced.\n' +
          '2. Diagnosis: Check which required rule is missing from `.htmlvalidate.json` (e.g. `no-deprecated-attr`, `deprecated`, `element-permitted-content`, `element-required-attributes`, `attribute-allowed-values`).\n' +
          '3. Canonical Solution: Run `npm run auditor:fix` to automatically re-inject the mandatory strict rule baseline.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`',
        'html-validate-config-missing-plugin':
          '📖 REMEDIATION GUIDE: html-validate-config-missing-plugin\n' +
          '1. Root Cause: Vue projects require the `html-validate-vue` plugin in `.htmlvalidate.json`.\n' +
          '2. Diagnosis: Inspect the `plugins` array in `.htmlvalidate.json`.\n' +
          '3. Canonical Solution: Run `npm run auditor:fix` to automatically append `html-validate-vue` to plugins.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`',
        'html-validate-config-missing-transform':
          '📖 REMEDIATION GUIDE: html-validate-config-missing-transform\n' +
          '1. Root Cause: To extract and validate `<template>` markup in `.vue` SFC files, the corresponding file transform must be declared.\n' +
          '2. Diagnosis: Check `transform` mappings in `.htmlvalidate.json`.\n' +
          '3. Canonical Solution: Add `"transform": { "^.*\\\\.vue$": "html-validate-vue" }` or run `npm run auditor:fix`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`',
        'html-validate-config-missing-doctype-style':
          '📖 REMEDIATION GUIDE: html-validate-config-missing-doctype-style\n' +
          '1. Root Cause: Vite+ and modern code formatters enforce lowercase `<!doctype html>`. HTML-Validate must configure `doctype-style` to lowercase.\n' +
          '2. Diagnosis: Check rule `"doctype-style"` in `.htmlvalidate.json`.\n' +
          '3. Canonical Solution: Configure `"doctype-style": ["error", { "style": "lowercase" }]` or run `npm run auditor:fix`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`'
      },
      coverage: {
        include: ['.htmlvalidate*']
      },
      projectRoot
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
        this.markRuleNotApplicable(
          'html-validate-config-syntax',
          'Missing .htmlvalidate.json file'
        );
        this.markRuleNotApplicable(
          'html-validate-config-missing-strict-rule',
          'Missing .htmlvalidate.json file'
        );
        this.markRuleNotApplicable(
          'html-validate-config-missing-plugin',
          'Missing .htmlvalidate.json file'
        );
        this.markRuleNotApplicable(
          'html-validate-config-missing-transform',
          'Missing .htmlvalidate.json file'
        );
        this.markRuleNotApplicable(
          'html-validate-config-missing-doctype-style',
          'Missing .htmlvalidate.json file'
        );
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
      this.markRuleNotApplicable(
        'html-validate-config-missing-strict-rule',
        'No se pudo leer el archivo'
      );
      this.markRuleNotApplicable(
        'html-validate-config-missing-plugin',
        'No se pudo leer el archivo'
      );
      this.markRuleNotApplicable(
        'html-validate-config-missing-transform',
        'No se pudo leer el archivo'
      );
      this.markRuleNotApplicable(
        'html-validate-config-missing-doctype-style',
        'No se pudo leer el archivo'
      );
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
          message: `JSON syntax error in ${path.basename(resolvedFile)}: ${(err as Error).message}`,
          context: rawContent.slice(0, 100)
        });
      }
    });

    if (!parsed) {
      this.markRuleNotApplicable('html-validate-config-missing-strict-rule', 'Invalid JSON syntax');
      this.markRuleNotApplicable('html-validate-config-missing-plugin', 'Invalid JSON syntax');
      this.markRuleNotApplicable('html-validate-config-missing-transform', 'Invalid JSON syntax');
      this.markRuleNotApplicable(
        'html-validate-config-missing-doctype-style',
        'Invalid JSON syntax'
      );
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
            message: `Missing 'html5' element in elements of ${path.basename(resolvedFile)}. Run "npm run auditor:fix" or "auditor fix" to add it.`,
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
              message: `Missing plugin 'html-validate-vue' in plugins of ${path.basename(resolvedFile)}. Run "npm run auditor:fix" or "auditor fix" to add it.`,
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
              message: `Missing transform for Vue files ('^.*\\.vue$': 'html-validate-vue') in ${path.basename(resolvedFile)}. Run "npm run auditor:fix" or "auditor fix" to fix it.`,
              context: 'transform'
            });
          }
        }
      });
    } else {
      this.markRuleNotApplicable('html-validate-config-missing-plugin', 'Not a Vue project');
      this.markRuleNotApplicable('html-validate-config-missing-transform', 'Not a Vue project');
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
              message: `Missing mandatory strict rule "${reqRule}: 'error'" in rules of ${path.basename(resolvedFile)}. Run "npm run auditor:fix" or "auditor fix" to auto-fix it.`,
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
            message: `The "doctype-style" rule in ${path.basename(resolvedFile)} must be configured as ["error", { "style": "lowercase" }] to harmonize with Vite+ (oxfmt). Run "npm run auditor:fix" or "auditor fix" to auto-fix it.`,
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
