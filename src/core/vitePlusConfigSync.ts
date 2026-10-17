/**
 * packages/auditor/src/core/vitePlusConfigSync.ts
 *
 * CANONICAL VITE+ (vp) CONFIGURATION BUILDER & SYNCHRONIZER (Node.js 26+ Native)
 * Generates and synchronizes vite.config.ts from .auditor/audit.config.ts (SSoT).
 * Eradicates standalone ESLint, Vitest, and tsdown configs in favor of unified Vite+.
 */

import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import { getAuditConfig, type AuditConfig } from './auditConfig.ts';

export const LEGACY_CONFIG_FILES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.ts',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yaml',
  '.eslintrc.yml',
  'vitest.config.ts',
  'vitest.config.js',
  'vitest.config.mjs',
  'tsdown.config.ts',
  'tsdown.config.js',
  'tsconfig.build.json',
  '.oxlintrc.json',
  '.oxfmtrc.json'
] as const;

export type VitePlusSyncTarget = 'lint' | 'fmt';

/**
 * Scans for legacy ESLint configuration files and extracts globalIgnores entries.
 */
export function findLegacyEslintIgnores(projectRoot: string): string[] {
  const candidates = [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.ts',
    '.eslintrc.json'
  ];
  for (const candidate of candidates) {
    const candidatePath = path.resolve(projectRoot, candidate);
    if (!fs.existsSync(candidatePath)) continue;

    try {
      const raw = fs.readFileSync(candidatePath, 'utf-8');
      const match =
        /(?:globalIgnores\s*\(\s*\[([\s\S]*?)\]\s*\)|ignores\s*:\s*\[([\s\S]*?)\])/m.exec(raw);
      const capturedArray = match ? match[1] || match[2] : null;
      if (!capturedArray) continue;

      const globs: string[] = [];
      const stringRegex = /['"]([^'"]+)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = stringRegex.exec(capturedArray)) !== null) {
        const candidateGlob = m[1];
        if (candidateGlob && !LEGACY_CONFIG_FILES.some((f) => f === candidateGlob)) {
          globs.push(candidateGlob);
        }
      }
      if (globs.length > 0) return globs;
    } catch {
      // catch-ok: fallback when reading legacy config fails
    }
  }
  return [];
}

/**
 * Resolves all canonical ignore globs derived from audit.config.ts (SSoT).
 * Evaluates paths.ignoreGlobs, paths.ignoredDirs, paths.ignoredPatterns,
 * test roots (when paths.includeTestsInCodeAudit === false), legacy ESLint
 * globalIgnores, and target-specific exclusions (lint or fmt).
 */
export function resolveAuditConfigIgnoreGlobs(
  config: AuditConfig,
  target: VitePlusSyncTarget = 'lint',
  projectRoot?: string
): string[] {
  const baseIgnores = [
    'dist/**',
    'dev-dist/**',
    'node_modules/**',
    'scratch/**',
    'tmp/**',
    '.agents/**',
    'coverage/**',
    '**/*.d.ts'
  ];
  if (target === 'fmt') {
    baseIgnores.push('package-lock.json');
  }

  const projectIgnores = config.paths?.ignoreGlobs ?? [];
  const dirIgnores = (config.paths?.ignoredDirs ?? []).map((d) =>
    d.endsWith('/**') ? d : `${d}/**`
  );
  const patternIgnores = config.paths?.ignoredPatterns ?? [];
  const exemptFiles = config.paths?.exemptFiles ?? [];

  const testIgnores: string[] = [];
  if (target === 'lint' && config.paths?.includeTestsInCodeAudit === false) {
    const testRoots = config.paths.testRoots ?? ['tests'];
    const e2eRoots = config.paths.e2eRoots ?? [];
    const integrationRoots = config.paths.integrationRoots ?? [];
    for (const r of [...testRoots, ...e2eRoots, ...integrationRoots]) {
      const glob = r.endsWith('/**') ? r : `${r}/**`;
      testIgnores.push(glob);
    }
    testIgnores.push('**/*.spec.ts', '**/*.test.ts', '**/*.simulation.ts');
  }

  const degradationIgnores = (config.coverage?.acknowledgedDegradations ?? []).map((d) => d.glob);
  const coverageExemptIgnores = (config.coverage?.exemptGlobs ?? []).map((e) => e.glob);
  const testCoverageExemptIgnores = config.testCoverage?.exemptGlobs ?? [];

  const dataDemoIgnores: string[] = [];
  if (target === 'lint') {
    const dataRoots = (config.paths?.dataRoots ?? []).map((d) =>
      d.endsWith('/**') ? d : `${d}/**`
    );
    const demoRoots = (config.paths?.demoRoots ?? []).map((d) =>
      d.endsWith('/**') ? d : `${d}/**`
    );
    dataDemoIgnores.push(...dataRoots, ...demoRoots);
  }

  const legacyIgnores: string[] = projectRoot ? findLegacyEslintIgnores(projectRoot) : [];

  const specificTargetIgnores =
    target === 'lint'
      ? (config.vitePlusConfig?.lint?.ignorePatterns ?? [])
      : (config.vitePlusConfig?.fmt?.ignorePatterns ?? []);

  return Array.from(
    new Set([
      ...baseIgnores,
      ...projectIgnores,
      ...dirIgnores,
      ...patternIgnores,
      ...exemptFiles,
      ...degradationIgnores,
      ...coverageExemptIgnores,
      ...testCoverageExemptIgnores,
      ...dataDemoIgnores,
      ...testIgnores,
      ...legacyIgnores,
      ...specificTargetIgnores
    ])
  );
}

function buildPackSection(auditConfig: AuditConfig): string {
  const isLibrary = auditConfig.packageDistribution?.enabled !== false;
  return isLibrary
    ? `  pack: {
    entry: ['src/index.ts', 'src/cli/*.ts', 'src/suites/**/*.ts'],
    unbundle: true,
    dts: true,
    publint: true,
    attw: { profile: 'esm-only' },
    outExtensions: () => ({ js: '.js', dts: '.d.ts' })
  },\n`
    : '';
}

function buildFmtSection(auditConfig: AuditConfig, projectRoot?: string): string {
  const fmtCfg = auditConfig.vitePlusConfig?.fmt;
  const singleQuote = fmtCfg?.singleQuote ?? true;
  const semi = fmtCfg?.semi ?? true;
  const trailingComma = fmtCfg?.trailingComma ?? 'none';
  const printWidth = fmtCfg?.printWidth ?? 100;
  const sortPackageJson = fmtCfg?.sortPackageJson ?? true;
  const sortImports = fmtCfg?.sortImports ?? true;
  const tabWidthLine = fmtCfg?.tabWidth !== undefined ? `\n    tabWidth: ${fmtCfg.tabWidth},` : '';
  const useTabsLine = fmtCfg?.useTabs !== undefined ? `\n    useTabs: ${fmtCfg.useTabs},` : '';
  const mergedFmtIgnores = resolveAuditConfigIgnoreGlobs(auditConfig, 'fmt', projectRoot);
  const fmtIgnoreStr = JSON.stringify(mergedFmtIgnores, null, 6).replace(/\n/g, '\n    ');

  return `  fmt: {
    singleQuote: ${singleQuote},
    semi: ${semi},
    trailingComma: '${trailingComma}',
    printWidth: ${printWidth},
    sortPackageJson: ${sortPackageJson},
    sortImports: ${sortImports},
    ignorePatterns: ${fmtIgnoreStr}${tabWidthLine}${useTabsLine}
  }`;
}

function buildTestSection(auditConfig: AuditConfig): string {
  const coverageThreshold = auditConfig.testCoverage?.threshold ?? 80;
  const testRoots = auditConfig.paths?.testRoots ?? ['tests'];
  const testIncludeStr = JSON.stringify(
    testRoots.map((r) => `${r}/**/*.{test,spec}.ts`),
    null,
    6
  ).replace(/\n/g, '\n    ');

  const srcRoots = auditConfig.paths?.srcRoots ?? ['src'];
  const srcIncludeStr = JSON.stringify(
    srcRoots.map((r) => `${r}/**/*.ts`),
    null,
    8
  ).replace(/\n/g, '\n      ');

  const cliRoots = auditConfig.paths?.cliRoots ?? ['src/cli'];
  const excludeStr = JSON.stringify(
    [...cliRoots.map((r) => `${r}/**`), ...testRoots.map((r) => `${r}/**`)],
    null,
    8
  ).replace(/\n/g, '\n      ');

  return `  test: {
    environment: 'node',
    include: ${testIncludeStr},
    coverage: {
      provider: 'v8',
      reportsDirectory: 'scratch/coverage',
      include: ${srcIncludeStr},
      exclude: ${excludeStr},
      thresholds: {
        lines: ${coverageThreshold},
        functions: ${coverageThreshold},
        branches: ${coverageThreshold},
        statements: ${coverageThreshold}
      }
    }
  }`;
}

function buildStagedSection(auditConfig: AuditConfig): string {
  const stagedCfg = auditConfig.vitePlusConfig?.staged;
  let stagedRules = "{ '*': 'vp check --fix' }";
  if (stagedCfg) {
    const rulesObj =
      'rules' in stagedCfg && stagedCfg.rules
        ? stagedCfg.rules
        : (stagedCfg as Record<string, string>);
    if (Object.keys(rulesObj).length > 0) {
      stagedRules = JSON.stringify(rulesObj, null, 4).replace(/\n/g, '\n  ');
    }
  }
  return `  staged: ${stagedRules}`;
}

function buildLintSection(auditConfig: AuditConfig, projectRoot?: string): string {
  const lintCfg = auditConfig.vitePlusConfig?.lint;
  const typeAware = lintCfg?.typeAware ?? true;
  const typeCheck = lintCfg?.typeCheck ?? true;

  let categoriesSection = '';
  if (lintCfg?.categories && Object.keys(lintCfg.categories).length > 0) {
    const catEntries = Object.entries(lintCfg.categories)
      .map(([k, v]) => `      '${k}': '${v}'`)
      .join(',\n');
    categoriesSection = `\n    categories: {\n${catEntries}\n    },`;
  }

  let overridesSection = '';
  if (lintCfg?.overrides && lintCfg.overrides.length > 0) {
    const ovBlocks = lintCfg.overrides.map((ov) => {
      const filesStr = JSON.stringify(ov.files);
      const rulesStr = Object.entries(ov.rules)
        .map(([k, v]) => `        '${k}': ${JSON.stringify(v)}`)
        .join(',\n');
      return `      {\n        files: ${filesStr},\n        rules: {\n${rulesStr}\n        }\n      }`;
    });
    overridesSection = `,\n    overrides: [\n${ovBlocks.join(',\n')}\n    ]`;
  }

  const mergedLintIgnores = resolveAuditConfigIgnoreGlobs(auditConfig, 'lint', projectRoot);
  const lintIgnoreStr = JSON.stringify(mergedLintIgnores, null, 6).replace(/\n/g, '\n    ');

  const customRules: string[] = [];
  if (auditConfig.vitePlusConfig?.extraLintRules) {
    for (const [k, v] of Object.entries(auditConfig.vitePlusConfig.extraLintRules)) {
      customRules.push(`      '${k}': '${v}'`);
    }
  }
  if (auditConfig.vitePlusConfig?.lint?.rules) {
    for (const [k, v] of Object.entries(auditConfig.vitePlusConfig.lint.rules)) {
      const valStr = typeof v === 'string' ? `'${v}'` : JSON.stringify(v);
      customRules.push(`      '${k}': ${valStr}`);
    }
  }
  let extraRulesStr = '';
  if (customRules.length > 0) {
    extraRulesStr = ',\n' + customRules.join(',\n');
  }

  return `  lint: {
    options: {
      typeAware: ${typeAware},
      typeCheck: ${typeCheck}
    },${categoriesSection}
    jsPlugins: ['@francogp/auditor/domain-type-plugin'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'never'
        }
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@francogp/domain-type/no-double-cast-unknown': 'error',
      '@francogp/domain-type/no-legacy-date': 'error',
      'unicorn/prefer-node-protocol': 'error',
      'no-debugger': 'error',
      'no-else-return': 'error',
      'no-empty': [
        'error',
        {
          allowEmptyCatch: false
        }
      ],
      'max-depth': ['error', 4],
      'import/no-duplicates': 'error',
      'eqeqeq': ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-self-compare': 'error',
      'no-eval': 'error',
      'vue/no-async-in-computed-properties': 'error',
      'vue/no-side-effects-in-computed-properties': 'error',
      'vue/no-export-in-script-setup': 'error',
      'vue/no-lifecycle-after-await': 'error',
      'vue/no-watch-after-await': 'error',
      'vue/prefer-import-from-vue': 'error',
      'vitest/no-identical-title': 'error',
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'error',
      'vitest/prefer-to-have-length': 'error',
      'vitest/valid-title': 'error',
      'import/no-self-import': 'error',
      'import/no-empty-named-blocks': 'error',
      'no-useless-catch': 'error',
      'no-useless-rename': 'error',
      'no-sparse-arrays': 'error',
      'no-shadow-restricted-names': 'error',
      'unicorn/prefer-string-starts-ends-with': 'error',
      'unicorn/throw-new-error': 'error',
      'unicorn/no-useless-spread': 'error',
      // TypeScript & Type Safety (Java-Like Strictness)
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/consistent-indexed-object-style': 'error',
      '@typescript-eslint/no-empty-object-type': 'error',
      '@typescript-eslint/no-unnecessary-template-expression': 'error',
      '@typescript-eslint/no-unnecessary-type-arguments': 'error',
      '@typescript-eslint/no-unnecessary-type-constraint': 'error',
      '@typescript-eslint/prefer-function-type': 'error',
      '@typescript-eslint/prefer-return-this-type': 'error',
      '@typescript-eslint/ban-tslint-comment': 'error',
      // Immutability & Anti-Dynamic Modification
      'import/no-mutable-exports': 'error',
      'no-extend-native': 'error',
      'no-proto': 'error',
      'no-iterator': 'error',
      'prefer-object-has-own': 'error',
      'no-useless-computed-key': 'error',
      'node/no-exports-assign': 'error',
      'import/no-webpack-loader-syntax': 'error',
      'import/no-dynamic-require': 'error',
      'import/no-amd': 'error',
      'import/no-named-default': 'error',
      'no-new-wrappers': 'error',
      'no-array-constructor': 'error',
      'no-caller': 'error',
      'unicorn/no-new-buffer': 'error',
      // Execution Safety & Strict Control Flow
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'default-case-last': 'error',
      'radix': 'error',
      'no-return-assign': 'error',
      'no-multi-assign': 'error',
      'no-sequences': 'error',
      'no-labels': 'error',
      'no-void': 'error',
      'no-useless-call': 'error',
      'yoda': 'error',
      'no-unneeded-ternary': 'error',
      'promise/no-new-statics': 'error',
      'promise/valid-params': 'error',
      'promise/no-return-in-finally': 'error',
      'node/no-new-require': 'error',
      'node/no-path-concat': 'error',
      // Modern JS & Performance
      'unicorn/no-unnecessary-array-flat-depth': 'error',
      'unicorn/no-unnecessary-array-splice-count': 'error',
      'unicorn/no-unreadable-iife': 'error',
      'unicorn/no-useless-switch-case': 'error',
      'unicorn/no-useless-promise-resolve-reject': 'error',
      'unicorn/prefer-array-some': 'error',
      'unicorn/no-unnecessary-slice-end': 'error',
      'unicorn/explicit-timer-delay': 'error',
      'unicorn/prefer-date-now': 'error',
      'unicorn/prefer-math-min-max': 'error',
      'unicorn/prefer-math-trunc': 'error',
      'unicorn/prefer-prototype-methods': 'error',
      'unicorn/prefer-regexp-test': 'error',
      'unicorn/prefer-default-parameters': 'error',
      'unicorn/prefer-global-this': 'error',
      'unicorn/prefer-optional-catch-binding': 'error',
      'unicorn/prefer-string-trim-start-end': 'error',
      'prefer-exponentiation-operator': 'error',
      'prefer-numeric-literals': 'error',
      'prefer-rest-params': 'error',
      // Vitest Determinism & Hygiene
      'vitest/no-duplicate-hooks': 'error',
      'vitest/no-test-prefixes': 'error',
      'vitest/no-test-return-statement': 'error',
      'vitest/prefer-to-contain': 'error',
      'vitest/prefer-to-be': 'error',
      'vitest/prefer-comparison-matcher': 'error',
      'vitest/no-import-node-test': 'error',
      'vitest/no-interpolation-in-snapshots': 'error',
      'vitest/prefer-expect-resolves': 'error',
      'vitest/prefer-mock-promise-shorthand': 'error',
      'vitest/prefer-mock-return-shorthand': 'error',
      'vitest/prefer-strict-equal': 'error',
      'vitest/prefer-to-be-truthy': 'error',
      'vitest/prefer-to-be-falsy': 'error',
      'vitest/prefer-to-be-object': 'error',
      'vitest/prefer-todo': 'error',
      // Vue 3 SFC & Reactivity Standards
      'vue/no-expose-after-await': 'error',
      'vue/return-in-computed-property': 'error',
      'vue/no-import-compiler-macros': 'error',
      'vue/valid-next-tick': 'error',
      'vue/no-deprecated-destroyed-lifecycle': 'error',
      'vue/component-definition-name-casing': 'error',
      'vue/define-emits-declaration': 'error',
      'vue/define-props-declaration': 'error',
      'vue/next-tick-style': 'error',
      'vue/prop-name-casing': 'error',
      'vue/require-direct-export': 'error',
      'vue/require-typed-ref': 'error',
      // Java-Like Strictness (Level B)
      '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'explicit' }],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true
        }
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      'vue/no-required-prop-with-default': 'error',
      'vue/no-deprecated-model-definition': 'error',
      'no-useless-assignment': 'error'${extraRulesStr}
    },
    ignorePatterns: ${lintIgnoreStr}${overridesSection}
  }`;
}

export function buildCanonicalVitePlusConfig(
  auditConfig: AuditConfig,
  projectRoot?: string
): string {
  const packSection = buildPackSection(auditConfig);
  const lintSection = buildLintSection(auditConfig, projectRoot);
  const fmtSection = buildFmtSection(auditConfig, projectRoot);
  const testSection = buildTestSection(auditConfig);
  const stagedSection = buildStagedSection(auditConfig);

  return `import { defineConfig } from 'vite-plus';

export default defineConfig({
${packSection}${lintSection},
${fmtSection},
${testSection},
${stagedSection}
});
`;
}

function skipQuote(content: string, index: number, quote: string): number {
  let i = index + 1;
  while (i < content.length && content[i] !== quote) {
    if (content[i] === '\\') i++;
    i++;
  }
  return i;
}

function skipLineComment(content: string, index: number): number {
  const nextNewline = content.indexOf('\n', index);
  return nextNewline === -1 ? content.length : nextNewline;
}

function skipBlockComment(content: string, index: number): number {
  const nextClose = content.indexOf('*/', index);
  return nextClose === -1 ? content.length : nextClose + 1;
}

function findClosingBraceIndex(content: string, startBraceIndex: number): number {
  let depth = 0;
  for (let i = startBraceIndex; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (ch === '/' && next === '/') {
      i = skipLineComment(content, i + 2);
      continue;
    }
    if (ch === '/' && next === '*') {
      i = skipBlockComment(content, i + 2);
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipQuote(content, i, ch);
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function extractObjectPropertyBlock(fileContent: string, propName: string): string | null {
  const regex = new RegExp(`(^|\\s)${propName}\\s*:\\s*\\{`, 'm');
  const exportMatch = /export\s+default\s+defineConfig/m.exec(fileContent);
  const searchStart = exportMatch ? exportMatch.index : 0;
  const scopedContent = fileContent.slice(searchStart);

  let match = regex.exec(scopedContent);
  let effectiveOffset = searchStart;
  if (!match) {
    match = regex.exec(fileContent);
    effectiveOffset = 0;
  }
  if (!match) return null;

  const prefixLen = match[1]?.length ?? 0;
  const propStartIndex = effectiveOffset + match.index + prefixLen;
  const braceIndex = fileContent.indexOf('{', propStartIndex);
  if (braceIndex === -1) return null;

  const closingIndex = findClosingBraceIndex(fileContent, braceIndex);
  return closingIndex !== -1 ? fileContent.slice(propStartIndex, closingIndex + 1) : null;
}

function injectBeforeClosingBrace(
  content: string,
  startBraceIndex: number,
  block: string
): string | null {
  const closingIndex = findClosingBraceIndex(content, startBraceIndex);
  if (closingIndex === -1) return null;
  const before = content.slice(0, closingIndex).trimEnd();
  const separator = before.endsWith(',') ? '\n' : ',\n';
  const after = content.slice(closingIndex);
  return `${before}${separator}  ${block}\n${after}`;
}

function findTargetObjectStart(content: string): number {
  const exportMatch = /export\s+default\s+defineConfig/m.exec(content);
  const searchStart = exportMatch ? exportMatch.index : 0;
  const configContent = content.slice(searchStart);

  const directMatch = /defineConfig\s*\(\s*\{/m.exec(configContent);
  if (directMatch) return searchStart + configContent.indexOf('{', directMatch.index);

  const arrowMatch = /=>\s*\(\s*\{/m.exec(configContent);
  if (arrowMatch) return searchStart + configContent.indexOf('{', arrowMatch.index);

  const returnMatch = /return\s*\{/m.exec(configContent);
  if (returnMatch) return searchStart + configContent.indexOf('{', returnMatch.index);

  return -1;
}

function injectBlockBeforeConfigEnd(content: string, block: string): string {
  const startBraceIndex = findTargetObjectStart(content);
  if (startBraceIndex !== -1) {
    const injected = injectBeforeClosingBrace(content, startBraceIndex, block);
    if (injected) return injected;
  }

  // Fallback before final closing });
  const lastClose = Math.max(content.lastIndexOf('});'), content.lastIndexOf('})'));
  if (lastClose !== -1) {
    let before = content.slice(0, lastClose).trimEnd();
    let postBlock = '';
    if (before.endsWith('};')) {
      before = before.slice(0, -2).trimEnd();
      postBlock = '\n};';
    } else if (before.endsWith('}')) {
      before = before.slice(0, -1).trimEnd();
      postBlock = '\n}';
    }
    const separator = before.endsWith(',') ? '\n' : ',\n';
    return `${before}${separator}  ${block}${postBlock}\n${content.slice(lastClose)}`;
  }
  return content;
}

function findLegacyTestBlock(projectRoot: string): string | null {
  const candidates = ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mjs'] as const;
  for (const vitestCandidate of candidates) {
    const candidatePath = path.resolve(projectRoot, vitestCandidate);
    if (fs.existsSync(candidatePath)) {
      try {
        const vitestRaw = fs.readFileSync(candidatePath, 'utf-8');
        const extracted = extractObjectPropertyBlock(vitestRaw, 'test');
        if (extracted) return extracted;
      } catch {
        // catch-ok
      }
    }
  }

  // Fallback to git HEAD if vitest.config.ts was recently deleted before migration
  try {
    const gitHeadRaw = childProcess.execSync('git show HEAD:vitest.config.ts', {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8'
    });
    const extracted = extractObjectPropertyBlock(gitHeadRaw, 'test');
    if (extracted) return extracted;
  } catch {
    // catch-ok
  }

  return null;
}

function scaffoldInitialViteConfig(
  viteConfigPath: string,
  config: AuditConfig,
  legacyTestBlock: string | null,
  projectRoot?: string
): { modified: boolean; content: string } {
  const canonicalContent = buildCanonicalVitePlusConfig(config, projectRoot);
  let finalContent = canonicalContent;
  if (legacyTestBlock) {
    const defaultTestBlock = extractObjectPropertyBlock(canonicalContent, 'test');
    if (defaultTestBlock) {
      finalContent = canonicalContent.replace(defaultTestBlock, legacyTestBlock);
    }
  }
  fs.writeFileSync(viteConfigPath, finalContent, 'utf-8');
  return { modified: true, content: finalContent };
}

function ensureTestBlock(
  content: string,
  legacyTestBlock: string | null,
  config: AuditConfig
): { content: string; modified: boolean } {
  if (!/(^|\s)test\s*:\s*\{/m.test(content)) {
    if (legacyTestBlock) {
      return { content: injectBlockBeforeConfigEnd(content, legacyTestBlock), modified: true };
    }

    const testRoots = config.paths?.testRoots ?? ['tests'];
    const testIncludeStr = JSON.stringify(
      testRoots.map((r) => `${r}/**/*.{test,spec}.ts`),
      null,
      4
    ).replace(/\n/g, '\n    ');

    const coverageThreshold = config.testCoverage?.threshold ?? 80;
    const defaultTestBlock = `test: {
    environment: 'node',
    include: ${testIncludeStr},
    coverage: {
      provider: 'v8',
      reportsDirectory: 'scratch/coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/cli/**', 'tests/**'],
      thresholds: {
        lines: ${coverageThreshold},
        functions: ${coverageThreshold},
        branches: ${coverageThreshold},
        statements: ${coverageThreshold}
      }
    }
  }`;
    return { content: injectBlockBeforeConfigEnd(content, defaultTestBlock), modified: true };
  }

  const testBlock = extractObjectPropertyBlock(content, 'test');
  if (!testBlock) return { content, modified: false };

  const testRoots = config.paths?.testRoots ?? ['tests'];
  const missingRoots: string[] = [];
  for (const root of testRoots) {
    const pattern = `${root}/**/*.{test,spec}.ts`;
    const simple = `${root}/**/*.test.ts`;
    if (
      !testBlock.includes(`'${pattern}'`) &&
      !testBlock.includes(`"${pattern}"`) &&
      !testBlock.includes(`'${simple}'`) &&
      !testBlock.includes(`"${simple}"`) &&
      !testBlock.includes(`'${root}/**`) &&
      !testBlock.includes(`"${root}/**`)
    ) {
      missingRoots.push(pattern);
    }
  }

  if (missingRoots.length === 0) return { content, modified: false };

  let updatedBlock = testBlock;
  if (testBlock.includes('include: [')) {
    const formatted = missingRoots.map((r) => `      '${r}'`).join(',\n');
    updatedBlock = testBlock.replace(/include:\s*\[/, `include: [\n${formatted},`);
  } else {
    const formatted = missingRoots.map((r) => `'${r}'`).join(', ');
    const braceIndex = testBlock.indexOf('{');
    if (braceIndex !== -1) {
      updatedBlock =
        testBlock.slice(0, braceIndex + 1) +
        `\n    include: [${formatted}],` +
        testBlock.slice(braceIndex + 1);
    }
  }

  if (updatedBlock !== testBlock) {
    return { content: content.replace(testBlock, updatedBlock), modified: true };
  }
  return { content, modified: false };
}

export const STRICT_RULE_CHECKS = [
  '@typescript-eslint/no-explicit-any',
  '@typescript-eslint/ban-ts-comment',
  '@typescript-eslint/consistent-type-assertions',
  '@typescript-eslint/no-floating-promises',
  '@francogp/domain-type/no-double-cast-unknown',
  '@francogp/domain-type/no-legacy-date',
  'unicorn/prefer-node-protocol',
  'no-debugger',
  'no-else-return',
  'no-empty',
  'max-depth',
  'import/no-duplicates',
  'eqeqeq',
  'prefer-const',
  'no-var',
  'no-self-compare',
  'no-eval',
  'vue/no-async-in-computed-properties',
  'vue/no-side-effects-in-computed-properties',
  'vue/no-export-in-script-setup',
  'vue/no-lifecycle-after-await',
  'vue/no-watch-after-await',
  'vue/prefer-import-from-vue',
  'vitest/no-identical-title',
  'vitest/no-focused-tests',
  'vitest/no-disabled-tests',
  'vitest/prefer-to-have-length',
  'vitest/valid-title',
  'import/no-self-import',
  'import/no-empty-named-blocks',
  'no-useless-catch',
  'no-useless-rename',
  'no-sparse-arrays',
  'no-shadow-restricted-names',
  'unicorn/prefer-string-starts-ends-with',
  'unicorn/throw-new-error',
  'unicorn/no-useless-spread',
  // TypeScript & Type Safety (Java-Like Strictness)
  '@typescript-eslint/no-unnecessary-type-assertion',
  '@typescript-eslint/consistent-indexed-object-style',
  '@typescript-eslint/no-empty-object-type',
  '@typescript-eslint/no-unnecessary-template-expression',
  '@typescript-eslint/no-unnecessary-type-arguments',
  '@typescript-eslint/no-unnecessary-type-constraint',
  '@typescript-eslint/prefer-function-type',
  '@typescript-eslint/prefer-return-this-type',
  '@typescript-eslint/ban-tslint-comment',
  // Immutability & Anti-Dynamic Modification
  'import/no-mutable-exports',
  'no-extend-native',
  'no-proto',
  'no-iterator',
  'prefer-object-has-own',
  'no-useless-computed-key',
  'node/no-exports-assign',
  'import/no-webpack-loader-syntax',
  'import/no-dynamic-require',
  'import/no-amd',
  'import/no-named-default',
  'no-new-wrappers',
  'no-array-constructor',
  'no-caller',
  'unicorn/no-new-buffer',
  // Execution Safety & Strict Control Flow
  'no-implied-eval',
  'no-new-func',
  'no-script-url',
  'default-case-last',
  'radix',
  'no-return-assign',
  'no-multi-assign',
  'no-sequences',
  'no-labels',
  'no-void',
  'no-useless-call',
  'yoda',
  'no-unneeded-ternary',
  'promise/no-new-statics',
  'promise/valid-params',
  'promise/no-return-in-finally',
  'node/no-new-require',
  'node/no-path-concat',
  // Modern JS & Performance
  'unicorn/no-unnecessary-array-flat-depth',
  'unicorn/no-unnecessary-array-splice-count',
  'unicorn/no-unreadable-iife',
  'unicorn/no-useless-switch-case',
  'unicorn/no-useless-promise-resolve-reject',
  'unicorn/prefer-array-some',
  'unicorn/no-unnecessary-slice-end',
  'unicorn/explicit-timer-delay',
  'unicorn/prefer-date-now',
  'unicorn/prefer-math-min-max',
  'unicorn/prefer-math-trunc',
  'unicorn/prefer-prototype-methods',
  'unicorn/prefer-regexp-test',
  'unicorn/prefer-default-parameters',
  'unicorn/prefer-global-this',
  'unicorn/prefer-optional-catch-binding',
  'unicorn/prefer-string-trim-start-end',
  'prefer-exponentiation-operator',
  'prefer-numeric-literals',
  'prefer-rest-params',
  // Vitest Determinism & Hygiene
  'vitest/no-duplicate-hooks',
  'vitest/no-test-prefixes',
  'vitest/no-test-return-statement',
  'vitest/prefer-to-contain',
  'vitest/prefer-to-be',
  'vitest/prefer-comparison-matcher',
  'vitest/no-import-node-test',
  'vitest/no-interpolation-in-snapshots',
  'vitest/prefer-expect-resolves',
  'vitest/prefer-mock-promise-shorthand',
  'vitest/prefer-mock-return-shorthand',
  'vitest/prefer-strict-equal',
  'vitest/prefer-to-be-truthy',
  'vitest/prefer-to-be-falsy',
  'vitest/prefer-to-be-object',
  'vitest/prefer-todo',
  // Vue 3 SFC & Reactivity Standards
  'vue/no-expose-after-await',
  'vue/return-in-computed-property',
  'vue/no-import-compiler-macros',
  'vue/valid-next-tick',
  'vue/no-deprecated-destroyed-lifecycle',
  'vue/component-definition-name-casing',
  'vue/define-emits-declaration',
  'vue/define-props-declaration',
  'vue/next-tick-style',
  'vue/prop-name-casing',
  'vue/require-direct-export',
  'vue/require-typed-ref',
  // Java-Like Strictness (Level B)
  '@typescript-eslint/explicit-member-accessibility',
  '@typescript-eslint/explicit-function-return-type',
  '@typescript-eslint/no-unused-vars',
  'vue/no-required-prop-with-default',
  'vue/no-deprecated-model-definition',
  'no-useless-assignment'
] as const;

const CANONICAL_SPECIAL_RULES: Readonly<Record<string, string>> = {
  '@typescript-eslint/consistent-type-assertions':
    "['error', { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' }]",
  'no-empty': "['error', { allowEmptyCatch: false }]",
  'max-depth': "['error', 4]",
  eqeqeq: "['error', 'always']",
  '@typescript-eslint/explicit-member-accessibility': "['error', { accessibility: 'explicit' }]",
  '@typescript-eslint/explicit-function-return-type':
    "['error', { allowExpressions: true, allowTypedFunctionExpressions: true, allowHigherOrderFunctions: true, allowDirectConstAssertionInArrowFunctions: true }]",
  '@typescript-eslint/no-unused-vars':
    "['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]"
};

function getCanonicalRuleValue(rule: string, override?: string): string {
  if (override) return override;
  return CANONICAL_SPECIAL_RULES[rule] ?? "'error'";
}

function findClosingBracketWithNesting(content: string, startIndex: number): number {
  let depth = 0;
  let inQuote: string | null = null;
  for (let i = startIndex; i < content.length; i++) {
    const ch = content[i];
    if (inQuote) {
      if (ch === '\\') {
        i++;
      } else if (ch === inQuote) {
        inQuote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      inQuote = ch;
      continue;
    }
    if (ch === '[' || ch === '{') {
      depth++;
      continue;
    }
    if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return content.length;
}

function extractRuleValue(
  content: string,
  ruleName: string
): { fullMatch: string; value: string; startIndex: number; endIndex: number } | null {
  const escaped = ruleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keyRegex = new RegExp(`['"]${escaped}['"]\\s*:`, 'm');
  const match = keyRegex.exec(content);
  if (!match) return null;

  const colonIndex = match.index + match[0].length;
  let valStart = colonIndex;
  while (valStart < content.length && /\s/.test(content[valStart]!)) {
    valStart++;
  }
  if (valStart >= content.length) return null;

  const firstChar = content[valStart];
  let valEnd = valStart;

  if (firstChar === "'" || firstChar === '"') {
    valEnd = skipQuote(content, valStart, firstChar) + 1;
  } else if (firstChar === '[') {
    valEnd = findClosingBracketWithNesting(content, valStart);
  } else {
    const commaOrBrace = content.slice(valStart).search(/[,}\n]/);
    valEnd = commaOrBrace !== -1 ? valStart + commaOrBrace : content.length;
  }

  const value = content.slice(valStart, valEnd).trim();
  const fullMatch = content.slice(match.index, valEnd);
  return { fullMatch, value, startIndex: match.index, endIndex: valEnd };
}

function applyStrictRule(
  content: string,
  rule: string,
  canonicalOverride?: string
): { content: string; modified: boolean } {
  const canonicalValue = getCanonicalRuleValue(rule, canonicalOverride);
  const extracted = extractRuleValue(content, rule);
  if (!extracted) {
    if (content.includes('rules: {')) {
      return {
        content: content.replace(/rules:\s*\{/, `rules: {\n      '${rule}': ${canonicalValue},`),
        modified: true
      };
    }
    return { content, modified: false };
  }

  const existingVal = extracted.value;
  const isNoEmpty = rule === 'no-empty';
  const isEqeqeq = rule === 'eqeqeq';

  const shouldReplace =
    /['"](?:off|warn|0|1)['"]/.test(existingVal) ||
    (isNoEmpty && !existingVal.includes('allowEmptyCatch: false')) ||
    (isEqeqeq && !existingVal.includes('always'));

  if (shouldReplace) {
    const updated =
      content.slice(0, extracted.startIndex) +
      `'${rule}': ${canonicalValue}` +
      content.slice(extracted.endIndex);
    return { content: updated, modified: true };
  }

  return { content, modified: false };
}

function ensureLintOptions(
  content: string,
  config: AuditConfig
): { content: string; modified: boolean } {
  const typeAware = config.vitePlusConfig?.lint?.typeAware ?? true;
  const typeCheck = config.vitePlusConfig?.lint?.typeCheck ?? true;
  const lintBlock = extractObjectPropertyBlock(content, 'lint');
  if (lintBlock && !lintBlock.includes('options:')) {
    const braceIndex = lintBlock.indexOf('{');
    if (braceIndex !== -1) {
      const updatedLintBlock =
        lintBlock.slice(0, braceIndex + 1) +
        `\n    options: {\n      typeAware: ${typeAware},\n      typeCheck: ${typeCheck}\n    },` +
        lintBlock.slice(braceIndex + 1);
      return { content: content.replace(lintBlock, updatedLintBlock), modified: true };
    }
  }
  return { content, modified: false };
}

function ensureLintPlugins(content: string): { content: string; modified: boolean } {
  if (content.includes('@francogp/auditor/domain-type-plugin')) {
    return { content, modified: false };
  }
  if (content.includes('jsPlugins: [')) {
    return {
      content: content.replace(
        /jsPlugins:\s*\[/,
        "jsPlugins: ['@francogp/auditor/domain-type-plugin', "
      ),
      modified: true
    };
  }
  if (content.includes('lint: {')) {
    return {
      content: content.replace(
        /lint:\s*\{/,
        "lint: {\n    jsPlugins: ['@francogp/auditor/domain-type-plugin'],"
      ),
      modified: true
    };
  }
  return { content, modified: false };
}

function applyConfiguredRule(
  content: string,
  rule: string,
  targetValue: string
): { content: string; modified: boolean } {
  const extracted = extractRuleValue(content, rule);
  if (!extracted) {
    if (content.includes('rules: {')) {
      return {
        content: content.replace(/rules:\s*\{/, `rules: {\n      '${rule}': ${targetValue},`),
        modified: true
      };
    }
    return { content, modified: false };
  }

  const currentValue = extracted.value.trim();
  const normalizedTarget = targetValue.trim();
  if (currentValue !== normalizedTarget) {
    const updated =
      content.slice(0, extracted.startIndex) +
      `'${rule}': ${targetValue}` +
      content.slice(extracted.endIndex);
    return { content: updated, modified: true };
  }

  return { content, modified: false };
}

interface LintOverrideEntry {
  readonly files: readonly string[];
  readonly rules?: Record<string, unknown>;
}

function serializeLintOverrides(overrides: readonly LintOverrideEntry[]): string {
  const ovBlocks = overrides.map((ov) => {
    const filesStr = JSON.stringify(ov.files);
    const rulesStr = Object.entries(ov.rules ?? {})
      .map(([k, v]) => `        '${k}': ${typeof v === 'string' ? `'${v}'` : JSON.stringify(v)}`)
      .join(',\n');
    return `      {\n        files: ${filesStr},\n        rules: {\n${rulesStr}\n        }\n      }`;
  });
  return `[\n${ovBlocks.join(',\n')}\n    ]`;
}

function ensureLintOverrides(
  content: string,
  config: AuditConfig
): { content: string; modified: boolean } {
  const overrides = config.vitePlusConfig?.lint?.overrides;
  if (!overrides || overrides.length === 0) {
    return { content, modified: false };
  }

  const lintBlock = extractObjectPropertyBlock(content, 'lint');
  if (!lintBlock) return { content, modified: false };

  const serialized = serializeLintOverrides(overrides);

  if (lintBlock.includes('overrides: [')) {
    const existingOverridesMatch = /(^|\s)overrides:\s*\[[\s\S]*?\n\s*\]/m.exec(lintBlock);
    if (existingOverridesMatch) {
      const targetOverridesStr = `overrides: ${serialized}`;
      if (existingOverridesMatch[0].trim() !== targetOverridesStr.trim()) {
        const updatedBlock = lintBlock.replace(existingOverridesMatch[0], `\n    ${targetOverridesStr}`);
        return { content: content.replace(lintBlock, updatedBlock), modified: true };
      }
    }
    return { content, modified: false };
  }

  const closingBraceIndex = lintBlock.lastIndexOf('}');
  if (closingBraceIndex === -1) return { content, modified: false };

  const beforeClose = lintBlock.slice(0, closingBraceIndex).trimEnd();
  const sep = beforeClose.endsWith(',') ? '\n' : ',\n';
  const updatedBlock = `${beforeClose}${sep}    overrides: ${serialized}\n  ${lintBlock.slice(closingBraceIndex)}`;

  return { content: content.replace(lintBlock, updatedBlock), modified: true };
}

function ensureLintRules(
  content: string,
  config: AuditConfig
): { content: string; modified: boolean } {
  let updated = content;
  let modified = false;

  for (const rule of STRICT_RULE_CHECKS) {
    const res = applyStrictRule(updated, rule);
    if (res.modified) {
      updated = res.content;
      modified = true;
    }
  }

  if (config.vitePlusConfig?.extraLintRules) {
    for (const [ruleName, ruleLevel] of Object.entries(config.vitePlusConfig.extraLintRules)) {
      const res = applyStrictRule(updated, ruleName, `'${ruleLevel}'`);
      if (res.modified) {
        updated = res.content;
        modified = true;
      }
    }
  }

  if (config.vitePlusConfig?.lint?.rules) {
    for (const [ruleName, ruleLevel] of Object.entries(config.vitePlusConfig.lint.rules)) {
      const valStr = typeof ruleLevel === 'string' ? `'${ruleLevel}'` : JSON.stringify(ruleLevel);
      const res = applyConfiguredRule(updated, ruleName, valStr);
      if (res.modified) {
        updated = res.content;
        modified = true;
      }
    }
  }

  return { content: updated, modified };
}

function ensureLintBlock(
  content: string,
  auditConfig?: AuditConfig,
  projectRoot?: string
): { content: string; modified: boolean } {
  const config = auditConfig ?? getAuditConfig(projectRoot);
  if (!/(^|\s)lint\s*:\s*\{/m.test(content)) {
    const canonicalFull = buildCanonicalVitePlusConfig(config, projectRoot);
    const extractedLint = extractObjectPropertyBlock(canonicalFull, 'lint');
    if (extractedLint) {
      return { content: injectBlockBeforeConfigEnd(content, extractedLint), modified: true };
    }
  }

  let updated = content;
  let modified = false;

  const optStep = ensureLintOptions(updated, config);
  if (optStep.modified) {
    updated = optStep.content;
    modified = true;
  }

  const pluginStep = ensureLintPlugins(updated);
  if (pluginStep.modified) {
    updated = pluginStep.content;
    modified = true;
  }

  const rulesStep = ensureLintRules(updated, config);
  if (rulesStep.modified) {
    updated = rulesStep.content;
    modified = true;
  }

  const ignoreStep = ensureIgnorePatterns(updated, 'lint', config, projectRoot);
  if (ignoreStep.modified) {
    updated = ignoreStep.content;
    modified = true;
  }

  const overridesStep = ensureLintOverrides(updated, config);
  if (overridesStep.modified) {
    updated = overridesStep.content;
    modified = true;
  }

  return { content: updated, modified };
}

function ensureIgnorePatterns(
  content: string,
  blockName: VitePlusSyncTarget,
  config: AuditConfig,
  projectRoot?: string
): { content: string; modified: boolean } {
  const globsToEnsure = resolveAuditConfigIgnoreGlobs(config, blockName, projectRoot);

  const block = extractObjectPropertyBlock(content, blockName);
  if (!block) return { content, modified: false };

  const missingGlobs = globsToEnsure.filter(
    (g) => !block.includes(`'${g}'`) && !block.includes(`"${g}"`)
  );
  if (missingGlobs.length === 0) return { content, modified: false };

  let updatedBlock = block;
  if (block.includes('ignorePatterns: [')) {
    const formatted = missingGlobs.map((g) => `      '${g}'`).join(',\n');
    updatedBlock = block.replace(/ignorePatterns:\s*\[/, `ignorePatterns: [\n${formatted},`);
  } else {
    const formatted = missingGlobs.map((g) => `      '${g}'`).join(',\n');
    const braceIndex = block.indexOf('{');
    if (braceIndex !== -1) {
      updatedBlock =
        block.slice(0, braceIndex + 1) +
        `\n    ignorePatterns: [\n${formatted}\n    ],` +
        block.slice(braceIndex + 1);
    }
  }

  if (updatedBlock !== block) {
    return { content: content.replace(block, updatedBlock), modified: true };
  }
  return { content, modified: false };
}

function ensureFmtSorting(
  content: string,
  config: AuditConfig
): { content: string; modified: boolean } {
  const fmtBlock = extractObjectPropertyBlock(content, 'fmt');
  if (!fmtBlock) return { content, modified: false };

  let updatedBlock = fmtBlock;
  const sortPackageJson = config.vitePlusConfig?.fmt?.sortPackageJson ?? true;
  const sortImports = config.vitePlusConfig?.fmt?.sortImports ?? true;

  if (sortPackageJson && !/sortPackageJson\s*:\s*true/.test(updatedBlock)) {
    if (/sortPackageJson\s*:\s*false/.test(updatedBlock)) {
      updatedBlock = updatedBlock.replace(/sortPackageJson\s*:\s*false/, 'sortPackageJson: true');
    } else {
      const braceIndex = updatedBlock.indexOf('{');
      if (braceIndex !== -1) {
        updatedBlock =
          updatedBlock.slice(0, braceIndex + 1) +
          '\n    sortPackageJson: true,' +
          updatedBlock.slice(braceIndex + 1);
      }
    }
  }

  if (sortImports && !/sortImports\s*:\s*true/.test(updatedBlock)) {
    if (/sortImports\s*:\s*false/.test(updatedBlock)) {
      updatedBlock = updatedBlock.replace(/sortImports\s*:\s*false/, 'sortImports: true');
    } else {
      const braceIndex = updatedBlock.indexOf('{');
      if (braceIndex !== -1) {
        updatedBlock =
          updatedBlock.slice(0, braceIndex + 1) +
          '\n    sortImports: true,' +
          updatedBlock.slice(braceIndex + 1);
      }
    }
  }

  if (updatedBlock !== fmtBlock) {
    return { content: content.replace(fmtBlock, updatedBlock), modified: true };
  }
  return { content, modified: false };
}

function ensureFmtAndStagedBlocks(
  content: string,
  auditConfig?: AuditConfig,
  projectRoot?: string
): { content: string; modified: boolean } {
  const config = auditConfig ?? getAuditConfig(projectRoot);
  let updated = content;
  let modified = false;

  if (!/(^|\s)fmt\s*:\s*\{/m.test(updated)) {
    const canonicalFull = buildCanonicalVitePlusConfig(config, projectRoot);
    const extractedFmt = extractObjectPropertyBlock(canonicalFull, 'fmt');
    if (extractedFmt) {
      updated = injectBlockBeforeConfigEnd(updated, extractedFmt);
      modified = true;
    }
  }

  const fmtSortingStep = ensureFmtSorting(updated, config);
  if (fmtSortingStep.modified) {
    updated = fmtSortingStep.content;
    modified = true;
  }

  const fmtIgnoreStep = ensureIgnorePatterns(updated, 'fmt', config, projectRoot);
  if (fmtIgnoreStep.modified) {
    updated = fmtIgnoreStep.content;
    modified = true;
  }

  if (!updated.includes('staged:')) {
    const canonicalFull = buildCanonicalVitePlusConfig(config, projectRoot);
    const extractedStaged = extractObjectPropertyBlock(canonicalFull, 'staged');
    if (extractedStaged) {
      updated = injectBlockBeforeConfigEnd(updated, extractedStaged);
      modified = true;
    }
  }

  return { content: updated, modified };
}

export function syncViteConfigWithAuditConfig(
  projectRoot: string,
  auditConfig?: AuditConfig
): { modified: boolean; content: string } {
  const config = auditConfig ?? getAuditConfig(projectRoot);
  const viteConfigPath = path.resolve(projectRoot, 'vite.config.ts');
  const legacyTestBlock = findLegacyTestBlock(projectRoot);

  if (!fs.existsSync(viteConfigPath)) {
    return scaffoldInitialViteConfig(viteConfigPath, config, legacyTestBlock, projectRoot);
  }

  let content = fs.readFileSync(viteConfigPath, 'utf-8');
  let modified = false;

  if (!content.includes("from 'vite-plus'")) {
    content = content.replace(/from\s+['"]vite['"]/g, "from 'vite-plus'");
    modified = true;
  }

  const testStep = ensureTestBlock(content, legacyTestBlock, config);
  content = testStep.content;
  if (testStep.modified) modified = true;

  const lintStep = ensureLintBlock(content, config, projectRoot);
  content = lintStep.content;
  if (lintStep.modified) modified = true;

  const fmtStagedStep = ensureFmtAndStagedBlocks(content, config, projectRoot);
  content = fmtStagedStep.content;
  if (fmtStagedStep.modified) modified = true;

  if (modified) {
    fs.writeFileSync(viteConfigPath, content, 'utf-8');
  }

  return { modified, content };
}

export function cleanLegacyConfigFiles(projectRoot: string): readonly string[] {
  const viteConfigPath = path.resolve(projectRoot, 'vite.config.ts');
  if (!fs.existsSync(viteConfigPath)) {
    return [];
  }

  let viteContent = '';
  try {
    viteContent = fs.readFileSync(viteConfigPath, 'utf-8');
  } catch {
    return [];
  }

  const hasTest = /(^|\s)test\s*:\s*\{/m.test(viteContent);
  const hasLint = /(^|\s)lint\s*:\s*\{/m.test(viteContent);
  const hasPack = /(^|\s)pack\s*:\s*\{/m.test(viteContent);

  const removed: string[] = []; // no-domain: Non-domain utility collection for deleted file paths
  for (const legacy of LEGACY_CONFIG_FILES) {
    if (legacy.startsWith('vitest') && !hasTest) {
      continue;
    }
    if ((legacy.startsWith('eslint') || legacy.startsWith('.eslintrc')) && !hasLint) {
      continue;
    }
    if (legacy.startsWith('tsdown') && !hasPack) {
      continue;
    }

    const fullPath = path.resolve(projectRoot, legacy);
    if (fs.existsSync(fullPath)) {
      try {
        fs.rmSync(fullPath, { force: true });
        removed.push(legacy);
      } catch {
        // catch-ok: error deleting legacy config file
      }
    }
  }
  return removed;
}

export function rewriteImportsToVitePlus(
  projectRoot: string,
  dirs: readonly string[] = ['src', 'scripts', 'tests']
): number {
  let rewrittenCount = 0;

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== 'dev-dist') {
          walk(fullPath);
        }
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.ts') || entry.name.endsWith('.vue') || entry.name.endsWith('.js'))
      ) {
        try {
          const raw = fs.readFileSync(fullPath, 'utf-8');
          let updated = raw;

          // Rewrite vitest imports
          if (updated.includes('from ' + "'vitest'")) {
            updated = updated.replace(/from\s+['"]vitest['"]/g, "from 'vite-plus/test'");
          }
          if (updated.includes('import(' + "'vitest')")) {
            updated = updated.replace(/import\(['"]vitest['"]\)/g, "import('vite-plus/test')");
          }
          if (updated.includes('from ' + "'vite'")) {
            updated = updated.replace(/from\s+['"]vite['"]/g, "from 'vite-plus'");
          }

          if (updated !== raw) {
            fs.writeFileSync(fullPath, updated, 'utf-8');
            rewrittenCount++;
          }
        } catch {
          // catch-ok: file read/write error
        }
      }
    }
  }

  for (const dirName of dirs) {
    walk(path.resolve(projectRoot, dirName));
  }

  return rewrittenCount;
}

export function migrateNodeVersion(projectRoot: string): boolean {
  const legacyNvmrc = path.resolve(projectRoot, '.nvmrc');
  const nodeVersionPath = path.resolve(projectRoot, '.node-version');
  let migrated = false;

  if (fs.existsSync(legacyNvmrc)) {
    const nvmrcContent = fs.readFileSync(legacyNvmrc, 'utf-8').trim();
    if (nvmrcContent) {
      fs.writeFileSync(nodeVersionPath, `${nvmrcContent}\n`, 'utf-8');
      migrated = true;
    }
    try {
      fs.rmSync(legacyNvmrc, { force: true });
    } catch {
      // catch-ok: error deleting legacy .nvmrc
    }
  } else if (!fs.existsSync(nodeVersionPath)) {
    const pkgPath = path.resolve(projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const nodeEngine = pkg.engines?.node;
        if (typeof nodeEngine === 'string') {
          const m = nodeEngine.match(/\d+\.\d+\.\d+/);
          if (m) {
            fs.writeFileSync(nodeVersionPath, `${m[0]}\n`, 'utf-8');
            migrated = true;
          }
        }
      } catch {
        // catch-ok
      }
    }
  }
  return migrated;
}

export function getVitePlusDefaultExcludeGlobs(projectRoot: string): string[] {
  const config = getAuditConfig(projectRoot);
  return resolveAuditConfigIgnoreGlobs(config, 'lint', projectRoot);
}

const LEGACY_DEPS_TO_REMOVE = [
  'eslint',
  '@eslint/js',
  'typescript-eslint',
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/parser',
  'eslint-formatter-codeframe',
  'eslint-plugin-unused-imports',
  'eslint-plugin-vue',
  'eslint-plugin-regexp',
  'globals',
  'vue-eslint-parser',
  'vitest'
] as const;

interface SyncablePackageJson {
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

function removeLegacyDependencies(pkg: SyncablePackageJson): boolean {
  let modified = false;
  for (const dep of LEGACY_DEPS_TO_REMOVE) {
    if (pkg.devDependencies && dep in pkg.devDependencies) {
      delete pkg.devDependencies[dep];
      modified = true;
    }
    if (pkg.dependencies && dep in pkg.dependencies) {
      delete pkg.dependencies[dep];
      modified = true;
    }
  }
  return modified;
}

const REQUIRED_VITE_PLUS_SCRIPTS: Record<string, string> = {
  check: 'vp check',
  'check:fix': 'vp check --fix',
  fmt: 'vp fmt',
  'fmt:check': 'vp fmt --check'
};

export function migrateViteCommandsToVp(cmd: string): string {
  let updated = cmd;

  // 1. vite build -> vp build
  updated = updated.replace(/(^|\s|&&|;|\|)vite\s+build\b/g, '$1vp build');

  // 2. vite preview -> vp preview
  updated = updated.replace(/(^|\s|&&|;|\|)vite\s+preview\b/g, '$1vp preview');

  // 3. vite --flag -> vp dev --flag
  updated = updated.replace(/(^|\s|&&|;|\|)vite\s+--/g, '$1vp dev --');

  // 4. vite dev -> vp dev
  updated = updated.replace(/(^|\s|&&|;|\|)vite\s+dev\b/g, '$1vp dev');

  // 5. standalone vite -> vp dev
  updated = updated.replace(/(^|\s|&&|;|\|)vite(?=$|\s*(&&|;|\|))/g, '$1vp dev');

  return updated;
}

function updateVitePlusScripts(scripts: Record<string, string>): boolean {
  let modified = false;
  for (const [sName, sCmd] of Object.entries(scripts)) {
    if (typeof sCmd === 'string') {
      if (/\beslint\b/.test(sCmd)) {
        if (sName === 'lint') {
          scripts[sName] = 'vp check';
          modified = true;
          continue;
        } else if (sName === 'lint:fix') {
          scripts[sName] = 'vp check --fix';
          modified = true;
          continue;
        }
      }

      const migrated = migrateViteCommandsToVp(sCmd);
      if (migrated !== sCmd) {
        scripts[sName] = migrated;
        modified = true;
      }
    }
  }

  for (const [key, cmd] of Object.entries(REQUIRED_VITE_PLUS_SCRIPTS)) {
    if (!scripts[key]) {
      scripts[key] = cmd;
      modified = true;
    }
  }

  return modified;
}

export function syncPackageJsonForVitePlus(projectRoot: string): boolean {
  const pkgPath = path.resolve(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;

  let pkg: SyncablePackageJson;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch {
    return false;
  }

  let modified = false;
  pkg.devDependencies = pkg.devDependencies ?? {};

  // 1. Add vite-plus if not present
  if (!pkg.dependencies?.['vite-plus'] && !pkg.devDependencies['vite-plus']) {
    pkg.devDependencies['vite-plus'] = '^1.2.0';
    modified = true;
  }

  // 2. Remove legacy ESLint and standalone Vitest packages
  if (removeLegacyDependencies(pkg)) {
    modified = true;
  }

  // 3. Update npm scripts if they reference obsolete eslint and ensure canonical Vite+ scripts
  pkg.scripts = pkg.scripts ?? {};
  if (updateVitePlusScripts(pkg.scripts)) {
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  }

  return modified;
}

export function syncVSCodeSettings(projectRoot: string, auditConfig?: AuditConfig): boolean {
  const config = auditConfig ?? getAuditConfig(projectRoot);
  const vscConfig = config.vitePlusConfig?.vscode;
  if (vscConfig?.enabled === false) return false;

  const vscodeDir = path.resolve(projectRoot, '.vscode');
  fs.mkdirSync(vscodeDir, { recursive: true });

  let modified = false;

  // 1. extensions.json
  const extPath = path.resolve(vscodeDir, 'extensions.json');
  let extJson: { recommendations?: string[]; unwantedRecommendations?: string[] } = {};
  if (fs.existsSync(extPath)) {
    try {
      extJson = JSON.parse(fs.readFileSync(extPath, 'utf-8'));
    } catch {
      extJson = {};
    }
  }
  const recommendations = [...(extJson.recommendations ?? [])];
  const unwantedRecommendations = [...(extJson.unwantedRecommendations ?? [])];

  if (!recommendations.includes('oxc.oxc-vscode')) {
    recommendations.push('oxc.oxc-vscode');
    modified = true;
  }
  const unwanted = vscConfig?.unwantedRecommendations ?? [
    'dbaeumer.vscode-eslint',
    'esbenp.prettier-vscode'
  ];
  for (const unw of unwanted) {
    if (!unwantedRecommendations.includes(unw)) {
      unwantedRecommendations.push(unw);
      modified = true;
    }
  }
  if (modified || !fs.existsSync(extPath)) {
    extJson.recommendations = recommendations;
    extJson.unwantedRecommendations = unwantedRecommendations;
    fs.writeFileSync(extPath, JSON.stringify(extJson, null, 2) + '\n', 'utf-8');
  }

  // 2. settings.json
  const settingsPath = path.resolve(vscodeDir, 'settings.json');
  let settingsJson: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settingsJson = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      settingsJson = {};
    }
  }

  const defFormatter = vscConfig?.defaultFormatter ?? 'oxc.oxc-vscode';
  if (settingsJson['editor.defaultFormatter'] !== defFormatter) {
    settingsJson['editor.defaultFormatter'] = defFormatter;
    modified = true;
  }
  if (vscConfig?.formatOnSave !== false && settingsJson['editor.formatOnSave'] !== true) {
    settingsJson['editor.formatOnSave'] = true;
    modified = true;
  }
  if (modified || !fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, JSON.stringify(settingsJson, null, 2) + '\n', 'utf-8');
  }

  return modified;
}

export function repairVitePlusProject(projectRoot: string): {
  removedConfigs: readonly string[];
  rewrittenFiles: number;
  viteConfigSync: { modified: boolean; content: string };
  nodeVersionMigrated: boolean;
  packageJsonUpdated: boolean;
  vscodeSync: boolean;
} {
  const config = getAuditConfig(projectRoot);
  // 1. FIRST: Extract vitest/eslint configurations and merge/sync vite.config.ts safely
  const viteConfigSync = syncViteConfigWithAuditConfig(projectRoot, config);

  // 2. SECOND: Rewrite testing imports towards 'vite-plus/test'
  const rewrittenFiles = rewriteImportsToVitePlus(projectRoot);

  // 3. THIRD: Migrate .nvmrc -> .node-version
  const nodeVersionMigrated = migrateNodeVersion(projectRoot);

  // 4. FOURTH: Synchronize package.json with vite-plus and clean obsolete dependencies
  const packageJsonUpdated = syncPackageJsonForVitePlus(projectRoot);

  // 5. FIFTH: Synchronize VS Code workspace (.vscode/)
  const vscodeSync = syncVSCodeSettings(projectRoot, config);

  // 6. SIXTH: Clean legacy configs ONLY after successful migration completion
  const removedConfigs = cleanLegacyConfigFiles(projectRoot);

  return {
    removedConfigs,
    rewrittenFiles,
    viteConfigSync,
    nodeVersionMigrated,
    packageJsonUpdated,
    vscodeSync
  };
}
