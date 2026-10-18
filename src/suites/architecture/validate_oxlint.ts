/**
 * src/suites/architecture/validate_oxlint.ts
 *
 * OXLINT & VITE+ CODE HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Runs Vite+ Oxlint (`vp lint`) across the repository with JSON formatter,
 * maps errors and warnings to StandardAuditResult findings with severity 'error'
 * (enforcing the strict Zero-Warning Policy), and persists structured reports.
 * Supports auto-fix when `fix` is passed (`vp lint --fix`).
 *
 * Usage:
 *   node src/suites/architecture/validate_oxlint.ts
 *   vp check
 */

import path from 'node:path';
import { executeNodeCli, resolvePackageBin } from '../../cli/cliUtils.ts';
import { enableCompileCache } from 'node:module';
import { BaseAuditor,
  createUniformRemediationPhases, createRuleCapabilities } from '../../core/auditorBase.ts';
import { getVitePlusDefaultExcludeGlobs } from '../../core/vitePlusConfigSync.ts';
import type { AuditFinding, GitIgnoreRequirement } from '../../core/auditContract.ts';
import {
  parseLintResultsToFindings,
  normalizePosixPath,
  parseJsonObjectOutput,
  type RawLintMessage,
  type RawLintFileReport
} from '../../core/reportUtils.ts';

enableCompileCache();

export const OXLINT_RULES = ['oxlint-violation'] as const;

export type OxlintRuleId = (typeof OXLINT_RULES)[number];

const MAX_BUFFER_BYTES = 52428800 as const;
const EXECUTION_TIMEOUT_MS = 0 as const;

export type RawOxlintMessage = RawLintMessage;
export type RawOxlintFileReport = RawLintFileReport;

export interface OxlintDiagnostic {
  message: string;
  code?: string;
  severity?: string;
  filename?: string;
  labels?: Array<{
    span?: {
      line?: number;
      column?: number;
      offset?: number;
      length?: number;
    };
  }>;
}

export interface OxlintJsonReport {
  diagnostics?: OxlintDiagnostic[];
  number_of_files?: number;
  number_of_rules?: number;
}

export const OXLINT_FIXABLE_RULES_LIST = [
  // ESLint Core (Safe auto-fix only, excluding dangerous fixes like eqeqeq and no-unneeded-ternary)
  'arrow-body-style',
  'capitalized-comments',
  'curly',
  'func-names',
  'no-array-constructor',
  'no-compare-neg-zero',
  'no-div-regex',
  'no-else-return',
  'no-extra-boolean-cast',
  'no-extra-label',
  'no-implicit-coercion',
  'no-negated-condition',
  'no-new-wrappers',
  'no-regex-spaces',
  'no-unsafe-negation',
  'no-unused-labels',
  'no-useless-computed-key',
  'no-useless-escape',
  'no-useless-rename',
  'no-var',
  'object-shorthand',
  'one-var',
  'prefer-arrow-callback',
  'prefer-const',
  'prefer-destructuring',
  'prefer-exponentiation-operator',
  'prefer-numeric-literals',
  'prefer-object-has-own',
  'prefer-object-spread',
  'prefer-spread',
  'prefer-template',
  'preserve-caught-error',
  'sort-imports',
  'sort-keys',
  'sort-vars',
  'unicode-bom',
  'use-isnan',
  'valid-typeof',
  'yoda',
  // TypeScript
  'array-type',
  'ban-ts-comment',
  'ban-tslint-comment',
  'consistent-generic-constructors',
  'consistent-indexed-object-style',
  'consistent-type-assertions',
  'consistent-type-exports',
  'consistent-type-imports',
  'dot-notation',
  'explicit-member-accessibility',
  'no-confusing-void-expression',
  'no-duplicate-type-constituents',
  'no-explicit-any',
  'no-extra-non-null-assertion',
  'no-import-type-side-effects',
  'no-meaningless-void-operator',
  'no-restricted-types',
  'no-unnecessary-boolean-literal-compare',
  'no-unnecessary-template-expression',
  'no-unnecessary-type-arguments',
  'no-unnecessary-type-assertion',
  'no-useless-empty-export',
  'no-wrapper-object-types',
  'prefer-as-const',
  'prefer-function-type',
  'prefer-includes',
  'prefer-namespace-keyword',
  'prefer-nullish-coalescing',
  'prefer-readonly',
  'prefer-reduce-type-parameter',
  'prefer-return-this-type',
  'prefer-string-starts-ends-with',
  'prefer-ts-expect-error',
  'promise-function-async',
  'return-await',
  '@typescript-eslint/array-type',
  '@typescript-eslint/ban-ts-comment',
  '@typescript-eslint/ban-tslint-comment',
  '@typescript-eslint/consistent-generic-constructors',
  '@typescript-eslint/consistent-indexed-object-style',
  '@typescript-eslint/consistent-type-assertions',
  '@typescript-eslint/consistent-type-exports',
  '@typescript-eslint/consistent-type-imports',
  '@typescript-eslint/dot-notation',
  '@typescript-eslint/explicit-member-accessibility',
  '@typescript-eslint/no-confusing-void-expression',
  '@typescript-eslint/no-duplicate-type-constituents',
  '@typescript-eslint/no-explicit-any',
  '@typescript-eslint/no-extra-non-null-assertion',
  '@typescript-eslint/no-import-type-side-effects',
  '@typescript-eslint/no-meaningless-void-operator',
  '@typescript-eslint/no-restricted-types',
  '@typescript-eslint/no-unnecessary-boolean-literal-compare',
  '@typescript-eslint/no-unnecessary-template-expression',
  '@typescript-eslint/no-unnecessary-type-arguments',
  '@typescript-eslint/no-unnecessary-type-assertion',
  '@typescript-eslint/no-useless-empty-export',
  '@typescript-eslint/no-wrapper-object-types',
  '@typescript-eslint/prefer-as-const',
  '@typescript-eslint/prefer-function-type',
  '@typescript-eslint/prefer-includes',
  '@typescript-eslint/prefer-namespace-keyword',
  '@typescript-eslint/prefer-nullish-coalescing',
  '@typescript-eslint/prefer-readonly',
  '@typescript-eslint/prefer-reduce-type-parameter',
  '@typescript-eslint/prefer-return-this-type',
  '@typescript-eslint/prefer-string-starts-ends-with',
  '@typescript-eslint/prefer-ts-expect-error',
  '@typescript-eslint/promise-function-async',
  '@typescript-eslint/return-await',
  // Unicorn
  'unicorn/catch-error-name',
  'unicorn/consistent-assert',
  'unicorn/consistent-date-clone',
  'unicorn/consistent-existence-index-check',
  'unicorn/consistent-template-literal-escape',
  'unicorn/empty-brace-spaces',
  'unicorn/escape-case',
  'unicorn/explicit-length-check',
  'unicorn/explicit-timer-delay',
  'unicorn/no-console-spaces',
  'unicorn/no-hex-escape',
  'unicorn/no-instanceof-array',
  'unicorn/no-length-as-slice-end',
  'unicorn/no-negated-condition',
  'unicorn/no-nested-ternary',
  'unicorn/no-single-promise-in-promise-methods',
  'unicorn/no-typeof-undefined',
  'unicorn/no-unnecessary-array-splice-count',
  'unicorn/no-unnecessary-await',
  'unicorn/no-unnecessary-slice-end',
  'unicorn/no-useless-fallback-in-spread',
  'unicorn/no-useless-iterator-to-array',
  'unicorn/no-useless-promise-resolve-reject',
  'unicorn/no-useless-undefined',
  'unicorn/no-zero-fractions',
  'unicorn/number-literal-case',
  'unicorn/numeric-separators-style',
  'unicorn/prefer-array-flat-map',
  'unicorn/prefer-bigint-literals',
  'unicorn/prefer-class-fields',
  'unicorn/prefer-classlist-toggle',
  'unicorn/prefer-date-now',
  'unicorn/prefer-dom-node-append',
  'unicorn/prefer-dom-node-dataset',
  'unicorn/prefer-dom-node-text-content',
  'unicorn/prefer-import-meta-properties',
  'unicorn/prefer-keyboard-event-key',
  'unicorn/prefer-negative-index',
  'unicorn/prefer-node-protocol',
  'unicorn/prefer-optional-catch-binding',
  'unicorn/prefer-prototype-methods',
  'unicorn/prefer-query-selector',
  'unicorn/prefer-regexp-test',
  'unicorn/prefer-set-size',
  'unicorn/prefer-single-call',
  'unicorn/prefer-spread',
  'unicorn/prefer-string-raw',
  'unicorn/prefer-string-replace-all',
  'unicorn/prefer-string-slice',
  'unicorn/prefer-string-starts-ends-with',
  'unicorn/prefer-string-trim-start-end',
  'unicorn/prefer-type-error',
  'unicorn/relative-url-style',
  'unicorn/require-array-join-separator',
  'unicorn/require-module-specifiers',
  'unicorn/require-number-to-fixed-digits-argument',
  'unicorn/switch-case-braces',
  'unicorn/text-encoding-identifier-case',
  'unicorn/throw-new-error',
  // Vitest
  'vitest/consistent-test-it',
  'vitest/consistent-vitest-vi',
  'vitest/no-alias-methods',
  'vitest/no-importing-vitest-globals',
  'vitest/no-test-prefixes',
  'vitest/no-unneeded-async-expect-function',
  'vitest/padding-around-after-all-blocks',
  'vitest/padding-around-test-blocks',
  'vitest/prefer-called-once',
  'vitest/prefer-called-times',
  'vitest/prefer-called-with',
  'vitest/prefer-comparison-matcher',
  'vitest/prefer-describe-function-title',
  'vitest/prefer-expect-resolves',
  'vitest/prefer-expect-type-of',
  'vitest/prefer-import-in-mock',
  'vitest/prefer-importing-vitest-globals',
  'vitest/prefer-lowercase-title',
  'vitest/prefer-mock-promise-shorthand',
  'vitest/prefer-mock-return-shorthand',
  'vitest/prefer-strict-boolean-matchers',
  'vitest/prefer-to-be',
  'vitest/prefer-to-be-object',
  'vitest/prefer-to-contain',
  'vitest/prefer-to-have-been-called-times',
  'vitest/prefer-to-have-length',
  'vitest/prefer-todo',
  'vitest/valid-title',
  // Vue
  'vue/component-definition-name-casing',
  'vue/next-tick-style',
  'vue/no-deprecated-destroyed-lifecycle',
  'vue/prefer-import-from-vue',
  'vue/require-prop-type-constructor',
  'vue/valid-next-tick',
  // Import
  'import/consistent-type-specifier-style',
  'import/newline-after-import',
  'import/no-duplicates',
  'import/no-empty-named-blocks',
  // React & JSX A11y
  'jsx_a11y/aria-props',
  'jsx_a11y/aria-unsupported-elements',
  'jsx_a11y/no-aria-hidden-on-focusable',
  'jsx_a11y/no-redundant-roles',
  'jsx_a11y/scope',
  'react/jsx-boolean-value',
  'react/jsx-curly-brace-presence',
  'react/jsx-fragments',
  'react/jsx-props-no-spread-multi',
  'react/self-closing-comp',
  // Node & Promise
  'node/no-exports-assign',
  'promise/no-new-statics',
  // OXC unique
  'oxc/no-const-enum'
] as const;

export type OxlintFixableRule = (typeof OXLINT_FIXABLE_RULES_LIST)[number];

export const OXLINT_FIXABLE_RULES: ReadonlySet<string> = new Set<string>(OXLINT_FIXABLE_RULES_LIST);

/**
 * Checks whether an Oxlint rule or diagnostic code has automated fix capability.
 */
export function isOxlintRuleFixable(ruleName: string): boolean {
  if (!ruleName) return false;
  const normalized = ruleName
    .replace(/\(([^)]+)\)/, '/$1')
    .replace(/^eslint\//, '');
  if (OXLINT_FIXABLE_RULES.has(normalized)) return true;
  const bareName = normalized.includes('/') ? normalized.split('/')[1] : normalized;
  if (bareName && OXLINT_FIXABLE_RULES.has(bareName)) return true;
  return false;
}

/**
 * Parses raw JSON output from Vite+ (Oxlint) into canonical AuditFindings.
 * Elevates all diagnostics to severity: 'error' (Zero-Warning Policy).
 */
export function parseOxlintResults(
  input: string | object | object[],
  cwd: string = process.cwd()
): AuditFinding[] {
  if (typeof input === 'string') {
    const oxlintObj = parseJsonObjectOutput<OxlintJsonReport>(input);
    if (oxlintObj && Array.isArray(oxlintObj.diagnostics)) {
      const findings: AuditFinding[] = [];
      for (const diag of oxlintObj.diagnostics) {
        const cleanFile = normalizePosixPath(diag.filename || '', cwd);
        const line = diag.labels?.[0]?.span?.line ?? 1;
        const col = diag.labels?.[0]?.span?.column ?? 1;
        const rule = diag.code || 'oxlint-violation';
        findings.push({
          suiteId: 'validate_oxlint',
          suiteName: 'Oxlint & Vite+ Code Hygiene Validator',
          ruleId: 'oxlint-violation',
          ruleDescription: 'Error de sintaxis o regla de linter',
          severity: 'error',
          file: cleanFile,
          line,
          col,
          context: rule,
          message: `[${rule}] ${diag.message}`,
          fixable: isOxlintRuleFixable(rule)
        });
      }
      return findings;
    }
  }

  return parseLintResultsToFindings(input as string | object[], {
    cwd,
    suiteId: 'validate_oxlint',
    suiteName: 'Oxlint & Vite+ Code Hygiene Validator',
    ruleId: 'oxlint-violation',
    ruleDescription: 'Error de sintaxis o regla de linter',
    defaultRuleName: 'oxlint',
    defaultMessage: 'Linter violation'
  });
}

export class OxlintAuditor extends BaseAuditor<OxlintRuleId> {
  public static readonly gitIgnoreEntries: readonly GitIgnoreRequirement[] = [
    {
      id: '.oxlintcache',
      pattern: '.oxlintcache',
      samplePath: '.oxlintcache',
      reason: 'Archivo de caché incremental generado por Oxlint',
      isApplicable: (config) => config._rawConfig?.oxlint?.enabled !== false
    }
  ];

  constructor(projectRoot?: string) {
    const effectiveRoot = projectRoot || process.cwd();
    super({
      usesThirdPartyTool: true,
      thirdPartyToolPolicy: {
        toolName: 'Vite+ Oxlint',
        fallbackBehavior: 'violation',
        fallbackRuleId: 'oxlint-violation'
      },
      ruleCapabilities: createRuleCapabilities(
        OXLINT_RULES,
        {
          speed: ['light', 'full'],
          phase: 'normal',
          fix: 'normal',
          md: false,
          ast: false,
          changedOnly: false,
          critical: true
        },
        ['oxlint-violation']
      ),
      fixableRuleIds: ['oxlint-violation'],
      gitIgnoreEntries: OxlintAuditor.gitIgnoreEntries,
      id: 'validate_oxlint',
      name: 'Oxlint & Vite+ Code Hygiene Validator',
      description: 'Reglas de estilo y sintaxis con Oxlint',
      family: 'architecture',
      packageName: 'Oxlint',
      configKey: 'oxlint.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '📜',
      ruleIds: OXLINT_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(OXLINT_RULES, 'hygiene'),
      ruleDescriptions: {
        'oxlint-violation': 'Error de sintaxis o regla'
      },
      ruleRemediations: {
        'oxlint-violation':
          'Guía de diagnóstico y remediación para oxlint-violation. Revisa la incidencia reportada por Vite+ (Oxlint) y ajusta el código correspondiente.'
      },
      coverage: {
        include: ['**/*.{js,ts,mjs,cjs,vue}'],
        exclude: getVitePlusDefaultExcludeGlobs(effectiveRoot),
        source: 'declared-only'
      },
      projectRoot: effectiveRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const excludeGlobs = getVitePlusDefaultExcludeGlobs(this.projectRoot);
    this.redeclareCoverage({
      include: ['**/*.{js,ts,mjs,cjs,vue}'],
      exclude: excludeGlobs,
      source: 'declared-only'
    });

    const isFixMode = this.isFixModeRequested();
    const tier = this.getExecutionTier();

    const vpBin =
      resolvePackageBin('vite-plus', {
        projectRoot: this.projectRoot,
        fallbackRelativeBin: 'bin/vp'
      }) ?? path.resolve(this.projectRoot, 'node_modules/vite-plus/bin/vp');

    const args: string[] = ['lint', '-f', 'json'];
    if (tier === 'full') {
      args.push('--type-aware', '--type-check', '--report-unused-disable-directives');
    }
    if (isFixMode) {
      args.push('--fix');
    }

    const combinedOutput = executeNodeCli(vpBin, args, {
      cwd: this.projectRoot,
      maxBuffer: MAX_BUFFER_BYTES,
      timeout: EXECUTION_TIMEOUT_MS
    });

    const findings = parseOxlintResults(combinedOutput, this.projectRoot);

    this.markRuleEvaluated('oxlint-violation');
    this.recordExternalScanCount(1);

    for (const finding of findings) {
      this.addViolation({
        ruleId: (finding.ruleId as OxlintRuleId) ?? 'oxlint-violation',
        severity: finding.severity,
        file: finding.file,
        line: finding.line,
        col: finding.col,
        context: finding.context,
        message: finding.message,
        fixable: isFixMode ? false : Boolean(finding.fixable)
      });
    }

    this.context.setMetric('oxlint_violations', findings.length);
    this.context.setMetric('mode', isFixMode ? 'fix' : 'check');
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new OxlintAuditor());
