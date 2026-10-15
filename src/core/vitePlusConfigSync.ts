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

export function buildCanonicalVitePlusConfig(auditConfig: AuditConfig): string {
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
  },
`
    : '';

  return `import { defineConfig } from 'vite-plus';

export default defineConfig({
${packSection}  lint: {
    options: {
      typeAware: true,
      typeCheck: true
    },
    jsPlugins: ['@francogp/auditor/domain-type-plugin'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@francogp/domain-type/no-naked-string-union': 'error',
      '@francogp/domain-type/no-record-string-key': 'error',
      '@francogp/domain-type/no-untyped-string-set-map': 'error',
      '@francogp/domain-type/no-broad-string-array': 'error'
    },
    ignorePatterns: [
      'dist/**',
      'dev-dist/**',
      'node_modules/**',
      'scratch/**',
      'tmp/**',
      '.agents/**',
      'coverage/**',
      '**/*.d.ts'
    ]
  },
  fmt: {
    singleQuote: true,
    semi: true,
    trailingComma: 'none',
    printWidth: 100
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
  staged: {
    '*': 'vp check --fix'
  }
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
  legacyTestBlock: string | null
): { modified: boolean; content: string } {
  const canonicalContent = buildCanonicalVitePlusConfig(config);
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

const STRICT_RULE_CHECKS = [
  '@typescript-eslint/no-explicit-any',
  '@typescript-eslint/ban-ts-comment',
  '@francogp/domain-type/no-naked-string-union',
  '@francogp/domain-type/no-record-string-key',
  '@francogp/domain-type/no-untyped-string-set-map',
  '@francogp/domain-type/no-broad-string-array'
] as const;

function ensureLintBlock(content: string): { content: string; modified: boolean } {
  if (!/(^|\s)lint\s*:\s*\{/m.test(content)) {
    const canonicalLintBlock = `lint: {
    options: {
      typeAware: true,
      typeCheck: true
    },
    jsPlugins: ['@francogp/auditor/domain-type-plugin'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@francogp/domain-type/no-naked-string-union': 'error',
      '@francogp/domain-type/no-record-string-key': 'error',
      '@francogp/domain-type/no-untyped-string-set-map': 'error',
      '@francogp/domain-type/no-broad-string-array': 'error'
    },
    ignorePatterns: [
      'dist/**',
      'dev-dist/**',
      'node_modules/**',
      'scratch/**',
      'tmp/**',
      '.agents/**',
      'coverage/**',
      '**/*.d.ts'
    ]
  }`;
    return { content: injectBlockBeforeConfigEnd(content, canonicalLintBlock), modified: true };
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
    if (!updated.includes(`'${rule}'`) && !updated.includes(`"${rule}"`)) {
      if (updated.includes('rules: {')) {
        updated = updated.replace(/rules:\s*\{/, `rules: {\n      '${rule}': 'error',`);
        modified = true;
      }
    }
  }

  return { content: updated, modified };
}

function ensureFmtAndStagedBlocks(content: string): { content: string; modified: boolean } {
  let updated = content;
  let modified = false;

  if (!/(^|\s)fmt\s*:\s*\{/m.test(updated)) {
    const canonicalFmtBlock = `fmt: {
    singleQuote: true,
    semi: true,
    trailingComma: 'none',
    printWidth: 100
  }`;
    updated = injectBlockBeforeConfigEnd(updated, canonicalFmtBlock);
    modified = true;
  }

  if (!updated.includes('staged:')) {
    updated = injectBlockBeforeConfigEnd(updated, `staged: {\n    '*': 'vp check --fix'\n  }`);
    modified = true;
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
    return scaffoldInitialViteConfig(viteConfigPath, config, legacyTestBlock);
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

  const lintStep = ensureLintBlock(content);
  content = lintStep.content;
  if (lintStep.modified) modified = true;

  const fmtStagedStep = ensureFmtAndStagedBlocks(content);
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

export function syncPackageJsonForVitePlus(projectRoot: string): boolean {
  const pkgPath = path.resolve(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;

  let pkg: {
    devDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
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
  const legacyDepsToRemove = [
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

  for (const dep of legacyDepsToRemove) {
    if (pkg.devDependencies && dep in pkg.devDependencies) {
      delete pkg.devDependencies[dep];
      modified = true;
    }
    if (pkg.dependencies && dep in pkg.dependencies) {
      delete pkg.dependencies[dep];
      modified = true;
    }
  }

  // 3. Update npm scripts if they reference obsolete eslint
  if (pkg.scripts) {
    for (const [sName, sCmd] of Object.entries(pkg.scripts)) {
      if (typeof sCmd === 'string' && /\beslint\b/.test(sCmd)) {
        if (sName === 'lint') {
          pkg.scripts[sName] = 'vp check';
          modified = true;
        } else if (sName === 'lint:fix') {
          pkg.scripts[sName] = 'vp check --fix';
          modified = true;
        }
      }
    }
  }

  if (modified) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  }

  return modified;
}

export function repairVitePlusProject(projectRoot: string): {
  removedConfigs: readonly string[];
  rewrittenFiles: number;
  viteConfigSync: { modified: boolean; content: string };
  nodeVersionMigrated: boolean;
  packageJsonUpdated: boolean;
} {
  // 1. PRIMERO: Extraer configuraciones de vitest/eslint y fusionar/sincronizar vite.config.ts sin destruir el proyecto
  const viteConfigSync = syncViteConfigWithAuditConfig(projectRoot);

  // 2. SEGUNDO: Reescribir imports de testing hacia 'vite-plus/test'
  const rewrittenFiles = rewriteImportsToVitePlus(projectRoot);

  // 3. TERCERO: Migrar .nvmrc -> .node-version
  const nodeVersionMigrated = migrateNodeVersion(projectRoot);

  // 4. CUARTO: Sincronizar package.json con vite-plus y limpiar dependencias obsoletas
  const packageJsonUpdated = syncPackageJsonForVitePlus(projectRoot);

  // 5. QUINTO: Limpiar configs legacy SOLO después de haber completado la migración con éxito
  const removedConfigs = cleanLegacyConfigFiles(projectRoot);

  return {
    removedConfigs,
    rewrittenFiles,
    viteConfigSync,
    nodeVersionMigrated,
    packageJsonUpdated
  };
}
