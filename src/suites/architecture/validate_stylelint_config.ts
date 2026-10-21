/**
 * src/suites/architecture/validate_stylelint_config.ts
 *
 * STYLELINT CONFIGURATION INTEGRITY VALIDATOR (Node.js 26+ Native)
 *
 * Validates that .stylelintrc.json:
 *   1. Physically exists in the project root.
 *   2. Configures the required 'stylelint-declaration-strict-value' plugin.
 *   3. Enforces the canonical 'scale-unlimited/declaration-strict-value' rule for
 *      z-index, font-size, and color to eliminate raw magic values in SCSS/CSS.
 *   4. Supports auto-repair in --fix mode.
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import 'stylelint-declaration-strict-value';
import { BaseAuditor,
  createUniformRemediationPhases, createRuleCapabilities } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { toPosixRelative } from '../../core/safePath.ts';
import type { AuditorConfigFileRequirement } from '../../core/auditContract.ts';

enableCompileCache();

export type StylelintConfigRuleId =
  | 'stylelint-config-missing'
  | 'stylelint-config-missing-plugin'
  | 'stylelint-config-missing-strict-value'
  | 'stylelint-config-missing-order';

export const STYLELINT_CONFIG_RULES: readonly StylelintConfigRuleId[] = [
  'stylelint-config-missing',
  'stylelint-config-missing-plugin',
  'stylelint-config-missing-strict-value',
  'stylelint-config-missing-order'
] as const;

export const REQUIRED_STYLELINT_PLUGIN = 'stylelint-declaration-strict-value';
export const REQUIRED_ORDER_PLUGIN = 'stylelint-order';
export const REQUIRED_STRICT_VALUE_RULE = 'scale-unlimited/declaration-strict-value';
export const REQUIRED_ORDER_RULE = 'order/order';

export const CANONICAL_ORDER_CONFIG: readonly unknown[] = [
  'dollar-variables',
  'custom-properties',
  {
    type: 'at-rule',
    name: 'include',
    hasBlock: false
  },
  'declarations',
  {
    type: 'at-rule',
    name: 'include',
    hasBlock: true
  },
  {
    type: 'rule',
    selector: '^&:\\w'
  },
  'rules'
] as const;

function findIncludeMixinIndex(order: readonly unknown[], hasBlock: boolean): number {
  return order.findIndex(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      (item as { type?: string; name?: string; hasBlock?: boolean }).type === 'at-rule' &&
      (item as { type?: string; name?: string; hasBlock?: boolean }).name === 'include' &&
      (item as { type?: string; name?: string; hasBlock?: boolean }).hasBlock === hasBlock
  );
}

export function validateOrderHasBlockPartitioning(order: unknown): {
  valid: boolean;
  reason?: string;
} {
  if (!Array.isArray(order)) {
    return { valid: false, reason: 'order/order is not configured as an array' };
  }

  const declIndex = order.indexOf('declarations');
  if (declIndex === -1) {
    return { valid: false, reason: 'Missing "declarations" in order/order' };
  }

  const blocklessIncludeIndex = findIncludeMixinIndex(order, false);
  const blockIncludeIndex = findIncludeMixinIndex(order, true);

  if (blocklessIncludeIndex === -1) {
    return {
      valid: false,
      reason:
        'Missing at-rule @include with hasBlock: false (mixins without block before declarations)'
    };
  }

  if (blockIncludeIndex === -1) {
    return {
      valid: false,
      reason:
        'Missing at-rule @include with hasBlock: true (mixins with block after declarations)'
    };
  }

  if (blocklessIncludeIndex > declIndex) {
    return {
      valid: false,
      reason: 'at-rule @include with hasBlock: false must be placed BEFORE "declarations"'
    };
  }

  if (blockIncludeIndex < declIndex) {
    return {
      valid: false,
      reason: 'at-rule @include with hasBlock: true must be placed AFTER "declarations"'
    };
  }

  return { valid: true };
}

// no-domain: Non-domain Stylelint property names configuration
export const REQUIRED_STRICT_PROPERTIES = [
  '/color$/',
  'font-size',
  'z-index',
  'box-shadow',
  'border-radius',
  'font-family',
  'transition-duration',
  'animation-duration',
  'gap',
  'row-gap',
  'column-gap',
  'font-weight',
  'transition-timing-function'
] as const;

const REQUIRED_STRICT_PROPERTIES_SET: ReadonlySet<string> = new Set<string>(
  REQUIRED_STRICT_PROPERTIES
);

export const CANONICAL_IGNORE_AT_RULES = ['@font-face'] as const; // no-domain: CSS at-rules for Stylelint strict-value

export const CANONICAL_IGNORE_VALUES: Readonly<Record<string, readonly string[]>> = {
  '': ['inherit', 'initial', 'unset'],
  '/color$/': ['transparent', 'currentColor', 'none'],
  'z-index': ['auto', '0', '-1'],
  'font-size': ['inherit', 'initial'],
  'box-shadow': ['none'],
  'border-radius': ['0', '50%', '100%', '9999px'],
  'font-family': [
    'inherit',
    'initial',
    'unset',
    'sans-serif',
    'serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-sans-serif',
    'ui-serif',
    'ui-monospace',
    ',',
    '/^var\\(.*\\),?$/',
    '/^\\$.*,?$/'
  ],
  'transition-duration': ['0', '0s', '0ms'],
  'animation-duration': ['0', '0s', '0ms'],
  gap: ['0', 'normal'],
  'row-gap': ['0', 'normal'],
  'column-gap': ['0', 'normal'],
  'font-weight': ['normal', 'bold', 'bolder', 'lighter'],
  'transition-timing-function': [
    'linear',
    'ease',
    'ease-in',
    'ease-out',
    'ease-in-out',
    'step-start',
    'step-end'
  ]
} as const;

export function getMergedStrictProperties(
  config?: ReturnType<typeof getAuditConfig>
): readonly string[] {
  const custom =
    config?.stylelint?.strictValues?.properties ??
    config?.styles?.stylelint?.strictValues?.properties;
  const merged = new Set<string>(REQUIRED_STRICT_PROPERTIES);
  if (custom && Array.isArray(custom)) {
    for (const prop of custom) {
      if (typeof prop === 'string' && prop.trim().length > 0) {
        merged.add(prop.trim());
      }
    }
  }
  return Array.from(merged);
}

export function getMergedIgnoreValues(
  config?: ReturnType<typeof getAuditConfig>
): Record<string, readonly string[]> {
  const custom =
    config?.stylelint?.strictValues?.ignoreValues ??
    config?.styles?.stylelint?.strictValues?.ignoreValues ??
    {};
  const result: Record<string, readonly string[]> = {};

  for (const [prop, values] of Object.entries(CANONICAL_IGNORE_VALUES)) {
    result[prop] = [...values];
  }

  for (const [prop, values] of Object.entries(custom)) {
    if (result[prop]) {
      const set = new Set([...result[prop], ...values]);
      result[prop] = Array.from(set);
    } else {
      result[prop] = [...values];
    }
  }

  return result;
}

export function getMergedIgnoreAtRules(
  config?: ReturnType<typeof getAuditConfig>
): readonly string[] {
  const custom =
    config?.stylelint?.strictValues?.ignoreAtRules ??
    config?.styles?.stylelint?.strictValues?.ignoreAtRules ??
    [];
  const merged = new Set<string>([...CANONICAL_IGNORE_AT_RULES, ...custom]);
  return Array.from(merged);
}

export function buildProjectStrictValueConfig(
  config?: ReturnType<typeof getAuditConfig>
): unknown[] {
  const properties = getMergedStrictProperties(config);
  const ignoreValues = getMergedIgnoreValues(config);
  const ignoreAtRules = getMergedIgnoreAtRules(config);

  return [
    properties,
    {
      ignoreAtRules,
      ignoreValues,
      message:
        'Enforce using SCSS variables ($variable) or CSS variables (var(--variable)) instead of literal values (no magic values/numbers in styles)'
    }
  ];
}

export const CANONICAL_STRICT_VALUE_CONFIG = buildProjectStrictValueConfig();

export const AUDITOR_STYLELINT_EXTENDS_PATH = './node_modules/@francogp/auditor/.stylelintrc.json';

export const CANONICAL_STYLELINT_CONFIG_CONTENT =
  JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/stylelintrc',
      extends: [AUDITOR_STYLELINT_EXTENDS_PATH]
    },
    null,
    2
  ) + '\n';

export const STYLELINT_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<StylelintConfigRuleId> = {
  id: 'stylelint-config',
  file: '.stylelintrc.json',
  candidateFiles: [
    '.stylelintrc.json',
    '.stylelintrc.js',
    '.stylelintrc.cjs',
    'stylelint.config.js'
  ],
  description: 'Canonical Stylelint configuration in .stylelintrc.json',
  ruleId: 'stylelint-config-missing',
  generateDefaultContent: () => CANONICAL_STYLELINT_CONFIG_CONTENT,
  customMissingMessage: (_ctx, file) =>
    `Stylelint configuration file '${file}' not found. Run "auditor fix" to create it automatically.`
};

export function extendsAuditorConfig(parsedConfig: Record<string, unknown>): boolean {
  const rawExtends = parsedConfig.extends;
  const list = Array.isArray(rawExtends) ? rawExtends : rawExtends ? [rawExtends] : [];
  return list.some((item) => typeof item === 'string' && item.includes('auditor'));
}

export class ValidateStylelintConfigAuditor extends BaseAuditor<StylelintConfigRuleId> {
  constructor(
    rootsOrOptions?: readonly string[] | { projectRoot?: string; fix?: boolean },
    maybeProjectRoot?: string
  ) {
    const optionsObj =
      rootsOrOptions && !Array.isArray(rootsOrOptions)
        ? (rootsOrOptions as { projectRoot?: string; fix?: boolean })
        : undefined;
    const projectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();

    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(
        STYLELINT_CONFIG_RULES,
        {
          speed: 'light',
          phase: 'setup',
          fix: 'priority',
          md: false,
          ast: false,
          changedOnly: false,
          critical: false
        },
        [...STYLELINT_CONFIG_RULES]
      ),
      fixableRuleIds: [...STYLELINT_CONFIG_RULES],
      configFiles: [STYLELINT_CONFIG_REQUIREMENT],
      id: 'validate_stylelint_config',
      name: 'Stylelint Configuration Validator',
      description: 'Validates plugins and strict rules in .stylelintrc.json',
      family: 'architecture',
      packageName: 'Stylelint',
      configKey: 'stylelint.enabled',
      defaultConfig: {
        enabled: true,
        order: {
          enabled: true,
          enforceHasBlockPartitioning: true
        }
      },
      criticalConfig: {
        rationale:
          'Requiring SCSS ($var) or CSS (var(--var)) variables for design properties (color, font-size, z-index, box-shadow, border-radius, font-family, transition-duration, animation-duration, gap, row-gap, column-gap, font-weight, transition-timing-function) is an immutable standard to eradicate magic numbers in styles.',
        requiredMinimums: {
          'strictValues.properties': [...REQUIRED_STRICT_PROPERTIES]
        }
      },
      icon: '🎨',
      ruleIds: STYLELINT_CONFIG_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(STYLELINT_CONFIG_RULES, 'setup'),
      ruleDescriptions: {
        'stylelint-config-missing': 'Missing .stylelintrc.json',
        'stylelint-config-missing-plugin': 'Missing stylelint plugin',
        'stylelint-config-missing-strict-value': 'Missing strict-value rule',
        'stylelint-config-missing-order': 'Missing order/order rule'
      },
      ruleRemediations: {
        'stylelint-config-missing':
          '1. Root Cause:\n' +
          'The canonical .stylelintrc.json configuration file was not found in the project root.\n' +
          'Without this configuration, Stylelint cannot verify architectural stylesheet rules or enforce zero magic values.\n\n' +
          '2. Diagnosis:\n' +
          'Check for legacy files like stylelint.config.js or .stylelintrc.js. The unified framework requires .stylelintrc.json extending the base configuration from @francogp/auditor.\n\n' +
          '3. Canonical Solution:\n' +
          '1. Run "npm run auditor:fix" or "auditor fix". The auditor will automatically generate .stylelintrc.json extending "./node_modules/@francogp/auditor/.stylelintrc.json".\n' +
          '2. Or manually create .stylelintrc.json with:\n' +
          '   {\n' +
          '     "$schema": "https://json.schemastore.org/stylelintrc",\n' +
          '     "extends": ["./node_modules/@francogp/auditor/.stylelintrc.json"]\n' +
          '   }\n\n' +
          '4. Example / Auto-fix command:\n' +
          'npm run auditor:fix',
        'stylelint-config-missing-plugin':
          '1. Root Cause:\n' +
          'The local .stylelintrc.json file does not extend the auditor configuration and omits essential plugins like "stylelint-declaration-strict-value" or "stylelint-order".\n\n' +
          '2. Diagnosis:\n' +
          'Inspect the "plugins" array in .stylelintrc.json. Mandatory plugins for design variable governance and mixin/selector ordering are missing.\n\n' +
          '3. Canonical Solution:\n' +
          '1. Run "npm run auditor:fix" to automatically inject the missing plugins.\n' +
          '2. The recommended approach is extending "./node_modules/@francogp/auditor/.stylelintrc.json" in "extends", which inherits all canonical plugins.\n\n' +
          '4. Example / Auto-fix command:\n' +
          'npm run auditor:fix',
        'stylelint-config-missing-strict-value':
          '1. Root Cause:\n' +
          'The "scale-unlimited/declaration-strict-value" rule is missing or fails to cover all mandatory design properties of the strict baseline (Anti-Castration Mandate).\n' +
          'Required properties: color, font-size, z-index, box-shadow, border-radius, font-family, transition-duration, animation-duration, gap, row-gap, column-gap, font-weight, transition-timing-function.\n\n' +
          '2. Diagnosis:\n' +
          'Verify whether declaration-strict-value in .stylelintrc.json was disabled, degraded, or omitted required design tokens.\n\n' +
          '3. Canonical Solution:\n' +
          '1. Run "npm run auditor:fix". The auditor will regenerate the full rule with all required properties and safe exempted values (none, transparent, inherit, etc.).\n' +
          '2. Do not disable properties in this rule; instead, use SCSS ($my-color) or CSS (var(--my-color)) variables in stylesheets.\n\n' +
          '4. Example / Auto-fix command:\n' +
          'npm run auditor:fix',
        'stylelint-config-missing-order':
          '1. Root Cause:\n' +
          'The "order/order" rule is missing or does not define block partitioning (hasBlock: true/false) for SCSS mixins and at-rules.\n' +
          'Partitioning guarantees that blockless mixins (@include theme) are declared before CSS properties, and block mixins (@include respond-to) are declared at the end alongside nested selectors.\n\n' +
          '2. Diagnosis:\n' +
          'Inspect "order/order" in .stylelintrc.json rules. The auditor enforces a deterministic structure to prevent specificity leaks in compiled CSS.\n\n' +
          '3. Canonical Solution:\n' +
          '1. Run "npm run auditor:fix" to repair the configuration automatically.\n' +
          '2. Alternatively, extend "./node_modules/@francogp/auditor/.stylelintrc.json" to inherit canonical mixin ordering.\n\n' +
          '4. Example / Auto-fix command:\n' +
          'npm run auditor:fix'
      },
      coverage: {
        include: ['.stylelintrc*']
      },
      projectRoot,
      fix: optionsObj?.fix
    });
  }

  private auditPlugin(parsedConfig: Record<string, unknown>, targetFile: string): boolean {
    const plugins = Array.isArray(parsedConfig.plugins) ? [...parsedConfig.plugins] : [];
    if (extendsAuditorConfig(parsedConfig)) {
      return false;
    }

    const requiredPlugins = [REQUIRED_STYLELINT_PLUGIN, REQUIRED_ORDER_PLUGIN] as const;
    const missingPlugins = requiredPlugins.filter((p) => !plugins.includes(p));

    if (missingPlugins.length === 0) {
      return false;
    }

    if (this.isFixActive()) {
      for (const p of missingPlugins) {
        plugins.push(p);
      }
      parsedConfig.plugins = plugins;
      return true;
    }

    this.addViolation({
      ruleId: 'stylelint-config-missing-plugin',
      severity: 'error',
      file: toPosixRelative(this.projectRoot, targetFile),
      line: 1,
      message: `Missing required plugins (${missingPlugins.join(', ')}) in plugins of ${path.basename(targetFile)}. Run "auditor fix" to add them.`,
      context: missingPlugins.join(', ')
    });
    return false;
  }

  private auditOrderRule(parsedConfig: Record<string, unknown>, targetFile: string): boolean {
    if (extendsAuditorConfig(parsedConfig)) {
      return false;
    }

    const rules =
      typeof parsedConfig.rules === 'object' && parsedConfig.rules !== null
        ? { ...(parsedConfig.rules as Record<string, unknown>) }
        : {};

    const orderRule = rules[REQUIRED_ORDER_RULE];
    const validation = validateOrderHasBlockPartitioning(orderRule);

    if (validation.valid) {
      return false;
    }

    if (this.isFixActive()) {
      rules[REQUIRED_ORDER_RULE] = CANONICAL_ORDER_CONFIG;
      parsedConfig.rules = rules;
      return true;
    }

    this.addViolation({
      ruleId: 'stylelint-config-missing-order',
      severity: 'error',
      file: toPosixRelative(this.projectRoot, targetFile),
      line: 1,
      message: `Rule "${REQUIRED_ORDER_RULE}" in ${path.basename(targetFile)} is invalid or missing (${validation.reason}). Run "auditor fix" to auto-repair it.`,
      context: REQUIRED_ORDER_RULE
    });
    return false;
  }

  private auditStrictRule(
    parsedConfig: Record<string, unknown>,
    targetFile: string,
    config: ReturnType<typeof getAuditConfig>
  ): boolean {
    const rules =
      typeof parsedConfig.rules === 'object' && parsedConfig.rules !== null
        ? { ...(parsedConfig.rules as Record<string, unknown>) }
        : {};

    const strictRule = rules[REQUIRED_STRICT_VALUE_RULE];
    const requiredProps = getMergedStrictProperties(config);
    const hasCustomExtraProps = requiredProps.some((p) => !REQUIRED_STRICT_PROPERTIES_SET.has(p));

    if (strictRule === undefined && extendsAuditorConfig(parsedConfig)) {
      if (!hasCustomExtraProps) {
        return false;
      }
    }

    const isStrictRuleConfigured = Array.isArray(strictRule) && strictRule.length >= 1;
    let missingProperties: readonly string[] = []; // no-domain: Non-domain Stylelint property names

    if (isStrictRuleConfigured && Array.isArray(strictRule[0])) {
      const configuredProps = new Set(
        strictRule[0].filter((item): item is string => typeof item === 'string')
      );
      missingProperties = requiredProps.filter((p) => !configuredProps.has(p));
    }

    if (isStrictRuleConfigured && missingProperties.length === 0) {
      return false;
    }

    if (this.isFixActive()) {
      rules[REQUIRED_STRICT_VALUE_RULE] = buildProjectStrictValueConfig(config);
      parsedConfig.rules = rules;
      return true;
    }

    const detailMsg =
      missingProperties.length > 0
        ? `Rule "${REQUIRED_STRICT_VALUE_RULE}" in ${path.basename(targetFile)} does not cover all canonical properties (missing: ${missingProperties.join(', ')}). Run "auditor fix" to synchronize.`
        : `Missing required rule "${REQUIRED_STRICT_VALUE_RULE}" in rules of ${path.basename(targetFile)}. Run "auditor fix" to inject it.`;

    this.addViolation({
      ruleId: 'stylelint-config-missing-strict-value',
      severity: 'error',
      file: toPosixRelative(this.projectRoot, targetFile),
      line: 1,
      message: detailMsg,
      context:
        missingProperties.length > 0 ? missingProperties.join(', ') : REQUIRED_STRICT_VALUE_RULE
    });
    return false;
  }

  public override async runAudit(): Promise<void> {
    const config = getAuditConfig(this.projectRoot);
    if (config.stylelint?.enabled === false && config.styles?.stylelint?.enabled === false) {
      for (const r of STYLELINT_CONFIG_RULES) {
        this.runSubAuditorSync(r, () => {
          this.markRuleNotApplicable(r, 'Stylelint disabled in audit.config.ts');
        });
      }
      return;
    }

    let configFile: string | null = null;
    this.runSubAuditorSync('stylelint-config-missing', () => {
      configFile = this.resolveConfigFile(STYLELINT_CONFIG_REQUIREMENT);
    });

    if (!configFile) {
      let ensured: { resolvedPath: string; created: boolean } | null = null;
      await this.runSubAuditor('stylelint-config-missing', async () => {
        ensured = await this.ensureConfigFile(STYLELINT_CONFIG_REQUIREMENT);
      });
      if (!ensured) {
        for (const r of [
          'stylelint-config-missing-plugin',
          'stylelint-config-missing-strict-value',
          'stylelint-config-missing-order'
        ] as const) {
          this.runSubAuditorSync(r, () => {
            this.markRuleNotApplicable(r, 'Stylelint configuration missing');
          });
        }
        return;
      }
    }

    const targetFile = configFile ?? path.resolve(this.projectRoot, '.stylelintrc.json');
    this.recordScanned(toPosixRelative(this.projectRoot, targetFile));

    let parsedConfig: Record<string, unknown>;
    try {
      const content = fs.readFileSync(targetFile, 'utf-8');
      parsedConfig = JSON.parse(content);
    } catch {
      for (const r of [
        'stylelint-config-missing-plugin',
        'stylelint-config-missing-strict-value',
        'stylelint-config-missing-order'
      ] as const) {
        this.runSubAuditorSync(r, () => {
          this.markRuleNotApplicable(r, 'Archivo .stylelintrc.json inválido o corrupto');
        });
      }
      return;
    }

    let pluginModified = false;
    this.runSubAuditorSync('stylelint-config-missing-plugin', () => {
      pluginModified = this.auditPlugin(parsedConfig, targetFile);
    });

    let strictModified = false;
    this.runSubAuditorSync('stylelint-config-missing-strict-value', () => {
      strictModified = this.auditStrictRule(parsedConfig, targetFile, config);
    });

    const orderEnabled =
      config.stylelint?.order?.enforceHasBlockPartitioning ??
      config.styles?.stylelint?.order?.enforceHasBlockPartitioning ??
      true;
    let orderModified = false;
    if (orderEnabled !== false) {
      this.runSubAuditorSync('stylelint-config-missing-order', () => {
        orderModified = this.auditOrderRule(parsedConfig, targetFile);
      });
    } else {
      this.runSubAuditorSync('stylelint-config-missing-order', () => {
        this.markRuleNotApplicable(
          'stylelint-config-missing-order',
          'Orden de mixins desactivado en configuración'
        );
      });
    }

    if ((pluginModified || strictModified || orderModified) && this.isFixActive()) {
      fs.writeFileSync(targetFile, JSON.stringify(parsedConfig, null, 2) + '\n', 'utf-8');
    }
  }
}

export { ValidateStylelintConfigAuditor as StylelintConfigAuditor };

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateStylelintConfigAuditor());
