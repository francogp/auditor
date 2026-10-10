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
import { BaseAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { toPosixRelative } from '../../core/safePath.ts';
import type { AuditorConfigFileRequirement } from '../../core/auditContract.ts';

enableCompileCache();

export type StylelintConfigRuleId =
  | 'stylelint-config-missing'
  | 'stylelint-config-missing-plugin'
  | 'stylelint-config-missing-strict-value';

export const STYLELINT_CONFIG_RULES: readonly StylelintConfigRuleId[] = [
  'stylelint-config-missing',
  'stylelint-config-missing-plugin',
  'stylelint-config-missing-strict-value'
] as const;

export const REQUIRED_STYLELINT_PLUGIN = 'stylelint-declaration-strict-value';
export const REQUIRED_STRICT_VALUE_RULE = 'scale-unlimited/declaration-strict-value';

// no-domain: Non-domain Stylelint property names configuration
export const REQUIRED_STRICT_PROPERTIES = [
  '/color$/',
  'font-size',
  'z-index'
] as const;

const REQUIRED_STRICT_PROPERTIES_SET: ReadonlySet<string> = new Set<string>(REQUIRED_STRICT_PROPERTIES);

export const RECOMMENDED_EXPANDED_PROPERTIES = [
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
  'gap': ['0', 'normal'],
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

export function getMergedStrictProperties(config?: ReturnType<typeof getAuditConfig>): readonly string[] {
  const custom = config?.stylelint?.strictValues?.properties ?? config?.styles?.stylelint?.strictValues?.properties;
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

export function getMergedIgnoreValues(config?: ReturnType<typeof getAuditConfig>): Record<string, readonly string[]> {
  const custom = config?.stylelint?.strictValues?.ignoreValues ?? config?.styles?.stylelint?.strictValues?.ignoreValues ?? {};
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

export function getMergedIgnoreAtRules(config?: ReturnType<typeof getAuditConfig>): readonly string[] {
  const custom = config?.stylelint?.strictValues?.ignoreAtRules ?? config?.styles?.stylelint?.strictValues?.ignoreAtRules ?? [];
  const merged = new Set<string>([...CANONICAL_IGNORE_AT_RULES, ...custom]);
  return Array.from(merged);
}

export function buildProjectStrictValueConfig(config?: ReturnType<typeof getAuditConfig>): unknown[] {
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

export const CANONICAL_STYLELINT_CONFIG_CONTENT = JSON.stringify(
  {
    $schema: 'https://json.schemastore.org/stylelintrc',
    extends: ['stylelint-config-standard'],
    plugins: ['stylelint-order', REQUIRED_STYLELINT_PLUGIN],
    overrides: [
      {
        files: ['**/*.scss'],
        extends: ['stylelint-config-standard-scss']
      },
      {
        files: ['**/*.vue'],
        extends: ['stylelint-config-standard-scss', 'stylelint-config-standard-vue/scss']
      }
    ],
    rules: {
      [REQUIRED_STRICT_VALUE_RULE]: CANONICAL_STRICT_VALUE_CONFIG,
      'no-duplicate-selectors': true,
      'declaration-block-no-duplicate-properties': true,
      'block-no-empty': true,
      'no-empty-source': true
    }
  },
  null,
  2
) + '\n';

export const STYLELINT_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<StylelintConfigRuleId> = {
  id: 'stylelint-config',
  file: '.stylelintrc.json',
  candidateFiles: ['.stylelintrc.json', '.stylelintrc.js', '.stylelintrc.cjs', 'stylelint.config.js'],
  description: 'Configuración canónica de Stylelint en .stylelintrc.json',
  ruleId: 'stylelint-config-missing',
  generateDefaultContent: () => CANONICAL_STYLELINT_CONFIG_CONTENT,
  customMissingMessage: (_ctx, file) =>
    `No se encontró el archivo de configuración de Stylelint '${file}'. Ejecuta "auditor fix" para crearlo automáticamente.`
};

export function extendsAuditorConfig(parsedConfig: Record<string, unknown>): boolean {
  const rawExtends = parsedConfig.extends;
  const list = Array.isArray(rawExtends) ? rawExtends : (rawExtends ? [rawExtends] : []);
  return list.some(item => typeof item === 'string' && item.includes('auditor'));
}

export class ValidateStylelintConfigAuditor extends BaseAuditor<StylelintConfigRuleId> {
  constructor(rootsOrOptions?: readonly string[] | { projectRoot?: string; fix?: boolean }, maybeProjectRoot?: string) {
    const optionsObj = rootsOrOptions && !Array.isArray(rootsOrOptions)
      ? (rootsOrOptions as { projectRoot?: string; fix?: boolean })
      : undefined;
    const projectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();

    super({
      capabilities: {
        fix: true,
        fixPriority: true,
        lint: true,
        md: false,
        ast: false,
        changedSince: false,
        heavy: false,
        requiresBuild: false,
        postRun: false
      },
      fixableRuleIds: [...STYLELINT_CONFIG_RULES],
      configFiles: [STYLELINT_CONFIG_REQUIREMENT],
      id: 'validate_stylelint_config',
      name: 'Stylelint Configuration Validator',
      description: 'Valida plugins y reglas estrictas en .stylelintrc.json',
      family: 'architecture',
      packageName: 'Stylelint',
      configKey: 'stylelint.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {
        rationale: 'Exigir variables SCSS ($var) o CSS (var(--var)) en color, font-size y z-index es un estándar inmutable para erradicar números mágicos en estilos.',
        requiredMinimums: {
          'strictValues.properties': [...REQUIRED_STRICT_PROPERTIES]
        }
      },
      icon: '🎨',
      ruleIds: STYLELINT_CONFIG_RULES,
      ruleDescriptions: {
        'stylelint-config-missing': 'Falta .stylelintrc.json',
        'stylelint-config-missing-plugin': 'Falta plugin strict-value',
        'stylelint-config-missing-strict-value': 'Falta regla strict-value'
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
    if (plugins.includes(REQUIRED_STYLELINT_PLUGIN) || extendsAuditorConfig(parsedConfig)) {
      return false;
    }

    if (this.isFixActive()) {
      plugins.push(REQUIRED_STYLELINT_PLUGIN);
      parsedConfig.plugins = plugins;
      return true;
    }

    this.addViolation({
      ruleId: 'stylelint-config-missing-plugin',
      severity: 'error',
      file: toPosixRelative(this.projectRoot, targetFile),
      line: 1,
      message: `Falta el plugin requerido "${REQUIRED_STYLELINT_PLUGIN}" en plugins de ${path.basename(targetFile)}. Ejecuta "auditor fix" para agregarlo.`,
      context: REQUIRED_STYLELINT_PLUGIN
    });
    return false;
  }

  private auditStrictRule(
    parsedConfig: Record<string, unknown>,
    targetFile: string,
    config: ReturnType<typeof getAuditConfig>
  ): boolean {
    const rules = (typeof parsedConfig.rules === 'object' && parsedConfig.rules !== null)
      ? { ...(parsedConfig.rules as Record<string, unknown>) }
      : {};

    const strictRule = rules[REQUIRED_STRICT_VALUE_RULE];
    const requiredProps = getMergedStrictProperties(config);
    const hasCustomExtraProps = requiredProps.some(p => !REQUIRED_STRICT_PROPERTIES_SET.has(p));

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
      missingProperties = requiredProps.filter(p => !configuredProps.has(p));
    }

    if (isStrictRuleConfigured && missingProperties.length === 0) {
      return false;
    }

    if (this.isFixActive()) {
      rules[REQUIRED_STRICT_VALUE_RULE] = buildProjectStrictValueConfig(config);
      parsedConfig.rules = rules;
      return true;
    }

    const detailMsg = missingProperties.length > 0
      ? `La regla "${REQUIRED_STRICT_VALUE_RULE}" en ${path.basename(targetFile)} no cubre todas las propiedades canónicas (faltan: ${missingProperties.join(', ')}). Ejecuta "auditor fix" para sincronizarla.`
      : `Falta la regla requerida "${REQUIRED_STRICT_VALUE_RULE}" en rules de ${path.basename(targetFile)}. Ejecuta "auditor fix" para inyectarla.`;

    this.addViolation({
      ruleId: 'stylelint-config-missing-strict-value',
      severity: 'error',
      file: toPosixRelative(this.projectRoot, targetFile),
      line: 1,
      message: detailMsg,
      context: missingProperties.length > 0 ? missingProperties.join(', ') : REQUIRED_STRICT_VALUE_RULE
    });
    return false;
  }

  public override async runAudit(): Promise<void> {
    for (const r of STYLELINT_CONFIG_RULES) {
      this.markRuleEvaluated(r);
    }

    const config = getAuditConfig(this.projectRoot);
    if (config.stylelint?.enabled === false && config.styles?.stylelint?.enabled === false) {
      for (const r of STYLELINT_CONFIG_RULES) {
        this.markRuleNotApplicable(r, 'Stylelint deshabilitado en audit.config.ts');
      }
      return;
    }

    const configFile = this.resolveConfigFile(STYLELINT_CONFIG_REQUIREMENT);
    if (!configFile) {
      const ensured = await this.ensureConfigFile(STYLELINT_CONFIG_REQUIREMENT);
      if (!ensured) return;
    }

    const targetFile = configFile ?? path.resolve(this.projectRoot, '.stylelintrc.json');
    this.recordScanned(toPosixRelative(this.projectRoot, targetFile));

    let parsedConfig: Record<string, unknown>;
    try {
      const content = fs.readFileSync(targetFile, 'utf-8');
      parsedConfig = JSON.parse(content);
    } catch {
      return;
    }

    const pluginModified = this.auditPlugin(parsedConfig, targetFile);
    const strictModified = this.auditStrictRule(parsedConfig, targetFile, config);

    if ((pluginModified || strictModified) && this.isFixActive()) {
      fs.writeFileSync(targetFile, JSON.stringify(parsedConfig, null, 2) + '\n', 'utf-8');
    }
  }
}

export { ValidateStylelintConfigAuditor as StylelintConfigAuditor };

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateStylelintConfigAuditor());
