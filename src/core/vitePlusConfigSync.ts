/**
 * packages/auditor/src/core/vitePlusConfigSync.ts
 *
 * CANONICAL VITE+ (vp) CONFIGURATION BUILDER & SYNCHRONIZER (Node.js 26+ Native)
 * Generates and synchronizes vite.config.ts from .auditor/audit.config.ts (SSoT).
 * Eradicates standalone ESLint, Vitest, and tsdown configs in favor of unified Vite+.
 */

import fs from 'node:fs';
import path from 'node:path';
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
        if (m[1]) globs.push(m[1]);
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

  const projectIgnores = config.paths?.ignoreGlobs ?? [];
  const dirIgnores = (config.paths?.ignoredDirs ?? []).map((d) =>
    d.endsWith('/**') ? d : `${d}/**`
  );
  const patternIgnores = config.paths?.ignoredPatterns ?? [];

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
      ...testIgnores,
      ...legacyIgnores,
      ...specificTargetIgnores
    ])
  );
}

export function buildCanonicalVitePlusConfig(
  auditConfig: AuditConfig,
  projectRoot?: string
): string {
  const isLibrary = auditConfig.packageDistribution?.enabled !== false;
  const coverageThreshold = auditConfig.testCoverage?.threshold ?? 80;

  const packSection = isLibrary
    ? `  pack: {
    entry: ['src/index.ts', 'src/cli/*.ts', 'src/suites/**/*.ts'],
    unbundle: true,
    dts: true,
    publint: true,
    attw: { profile: 'esm-only' },
    outExtensions: () => ({ js: '.js', dts: '.d.ts' })
  },\n`
    : '';

  const fmtCfg = auditConfig.vitePlusConfig?.fmt;
  const singleQuote = fmtCfg?.singleQuote ?? true;
  const semi = fmtCfg?.semi ?? true;
  const trailingComma = fmtCfg?.trailingComma ?? 'none';
  const printWidth = fmtCfg?.printWidth ?? 100;
  const sortPackageJson = fmtCfg?.sortPackageJson ?? true;
  const tabWidthLine = fmtCfg?.tabWidth !== undefined ? `\n    tabWidth: ${fmtCfg.tabWidth},` : '';
  const useTabsLine = fmtCfg?.useTabs !== undefined ? `\n    useTabs: ${fmtCfg.useTabs},` : '';

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

  const mergedLintIgnores = resolveAuditConfigIgnoreGlobs(auditConfig, 'lint', projectRoot);
  const lintIgnoreStr = JSON.stringify(mergedLintIgnores, null, 6).replace(/\n/g, '\n    ');

  const mergedFmtIgnores = resolveAuditConfigIgnoreGlobs(auditConfig, 'fmt', projectRoot);
  const fmtIgnoreStr = JSON.stringify(mergedFmtIgnores, null, 6).replace(/\n/g, '\n    ');

  return `import { defineConfig } from 'vite-plus';

export default defineConfig({
${packSection}  lint: {
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
      '@francogp/domain-type/no-double-cast-unknown': 'error',
      '@francogp/domain-type/no-legacy-date': 'error'
    },
    ignorePatterns: ${lintIgnoreStr}${overridesSection}
  },
  fmt: {
    singleQuote: ${singleQuote},
    semi: ${semi},
    trailingComma: '${trailingComma}',
    printWidth: ${printWidth},
    sortPackageJson: ${sortPackageJson},
    ignorePatterns: ${fmtIgnoreStr}${tabWidthLine}${useTabsLine}
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
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
  },
  staged: ${stagedRules}
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
  const match = regex.exec(fileContent);
  if (!match) return null;

  const prefixLen = match[1]?.length ?? 0;
  const propStartIndex = match.index + prefixLen;
  const braceIndex = fileContent.indexOf('{', propStartIndex);
  if (braceIndex === -1) return null;

  const closingIndex = findClosingBraceIndex(fileContent, braceIndex);
  return closingIndex !== -1 ? fileContent.slice(propStartIndex, closingIndex + 1) : null;
}

function injectBlockBeforeConfigEnd(content: string, block: string): string {
  const match = /defineConfig\s*\(\s*\{/m.exec(content);
  if (match) {
    const braceIndex = content.indexOf('{', match.index);
    if (braceIndex !== -1) {
      const closingIndex = findClosingBraceIndex(content, braceIndex);
      if (closingIndex !== -1) {
        const before = content.slice(0, closingIndex).trimEnd();
        const separator = before.endsWith(',') ? '\n' : ',\n';
        const after = content.slice(closingIndex);
        return `${before}${separator}  ${block}\n${after}`;
      }
    }
  }

  const lastClose = Math.max(content.lastIndexOf('});'), content.lastIndexOf('})'));
  if (lastClose !== -1) {
    const before = content.slice(0, lastClose).trimEnd();
    const separator = before.endsWith(',') ? '\n' : ',\n';
    return `${before}${separator}  ${block}\n${content.slice(lastClose)}`;
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
  if (/(^|\s)test\s*:\s*\{/m.test(content)) return { content, modified: false };

  if (legacyTestBlock) {
    return { content: injectBlockBeforeConfigEnd(content, legacyTestBlock), modified: true };
  }

  const coverageThreshold = config.testCoverage?.threshold ?? 80;
  const defaultTestBlock = `test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
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

export const STRICT_RULE_CHECKS = [
  '@typescript-eslint/no-explicit-any',
  '@typescript-eslint/ban-ts-comment',
  '@typescript-eslint/consistent-type-assertions',
  '@francogp/domain-type/no-double-cast-unknown',
  '@francogp/domain-type/no-legacy-date'
] as const;

function applyStrictRule(content: string, rule: string): { content: string; modified: boolean } {
  const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existingRuleRegex = new RegExp(
    `['"]${escaped}['"]\\s*:\\s*(['"][^'"]+['"]|\\[[^\\]]+\\])`,
    'm'
  );
  const match = existingRuleRegex.exec(content);
  const isTypeAssertion = rule === '@typescript-eslint/consistent-type-assertions';
  const canonicalValue = isTypeAssertion
    ? "['error', { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' }]"
    : "'error'";

  if (!match) {
    if (content.includes('rules: {')) {
      return {
        content: content.replace(/rules:\s*\{/, `rules: {\n      '${rule}': ${canonicalValue},`),
        modified: true
      };
    }
    return { content, modified: false };
  }

  if (/['"](?:off|warn|0|1)['"]/.test(match[1] ?? '')) {
    return {
      content: content.replace(existingRuleRegex, `'${rule}': ${canonicalValue}`),
      modified: true
    };
  }

  return { content, modified: false };
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

  if (!updated.includes('@francogp/auditor/domain-type-plugin')) {
    if (updated.includes('jsPlugins: [')) {
      updated = updated.replace(
        /jsPlugins:\s*\[/,
        "jsPlugins: ['@francogp/auditor/domain-type-plugin', "
      );
      modified = true;
    } else if (updated.includes('lint: {')) {
      updated = updated.replace(
        /lint:\s*\{/,
        "lint: {\n    jsPlugins: ['@francogp/auditor/domain-type-plugin'],"
      );
      modified = true;
    }
  }

  for (const rule of STRICT_RULE_CHECKS) {
    const res = applyStrictRule(updated, rule);
    if (res.modified) {
      updated = res.content;
      modified = true;
    }
  }

  const ignoreStep = ensureIgnorePatterns(updated, 'lint', config, projectRoot);
  if (ignoreStep.modified) {
    updated = ignoreStep.content;
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
  const removed: string[] = []; // no-domain: Non-domain utility collection for deleted file paths
  for (const legacy of LEGACY_CONFIG_FILES) {
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

function updateVitePlusScripts(scripts: Record<string, string>): boolean {
  let modified = false;
  for (const [sName, sCmd] of Object.entries(scripts)) {
    if (typeof sCmd === 'string' && /\beslint\b/.test(sCmd)) {
      if (sName === 'lint') {
        scripts[sName] = 'vp check';
        modified = true;
      } else if (sName === 'lint:fix') {
        scripts[sName] = 'vp check --fix';
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
