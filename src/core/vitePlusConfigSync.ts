/**
 * packages/auditor/src/core/vitePlusConfigSync.ts
 *
 * CANONICAL VITE+ (vp) CONFIGURATION BUILDER & SYNCHRONIZER (Node.js 26+ Native)
 * Generates and synchronizes vite.config.ts from .auditor/audit.config.ts (SSoT)
 * using TypeScript Compiler AST (viteConfigAst.ts) and native JSON DTOs.
 */

import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { getAuditConfig, type AuditConfig } from './auditConfig.ts';
import {
  getAuditorCanonicalOverrides,
  getAuditorMinimumVersions,
  normalizeToCaretRange
} from './auditorMinimums.ts';
import { toPosixRelative } from './safePath.ts';
import { getPackageJson, writePackageJson } from './packageJson.ts';
import {
  buildCanonicalVitePlusAstSource,
  CANONICAL_LINT_RULES_MAP,
  extractAstPropertyBlock,
  extractEslintIgnoresFromAst,
  extractParsedConfigSummary,
  parseLegacyTestPropertyNode,
  rewriteModuleSpecifiersToVitePlusAst,
  synchronizeViteConfigAst
} from './viteConfigAst.ts';

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

export const STRICT_RULE_CHECKS = Object.keys(CANONICAL_LINT_RULES_MAP);

/**
 * Scans for legacy ESLint configuration files and extracts globalIgnores entries
 * using native JSON parsing (.eslintrc.json) and TypeScript Compiler AST (.js/.mjs/.ts).
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
      let extracted: string[] = []; // no-domain: Dynamic legacy ESLint ignore glob list
      if (candidate.endsWith('.json')) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const rawList = Array.isArray(parsed.ignorePatterns)
          ? parsed.ignorePatterns
          : Array.isArray(parsed.ignores)
            ? parsed.ignores
            : [];
        extracted = rawList.filter((item): item is string => typeof item === 'string');
      } else {
        extracted = extractEslintIgnoresFromAst(raw);
      }
      const globs = extracted.filter(
        (candidateGlob) => !LEGACY_CONFIG_FILES.some((f) => f === candidateGlob)
      );
      if (globs.length > 0) return globs;
    } catch {
      // catch-ok: fallback when reading legacy config fails
    }
  }
  return [];
}

/**
 * Resolves all canonical ignore globs derived from audit.config.ts (SSoT).
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

  const testIgnores: string[] = []; // no-domain: Dynamic test ignore glob accumulator
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

  const dataDemoIgnores: string[] = []; // no-domain: Dynamic data/demo ignore glob accumulator
  if (target === 'lint') {
    const dataRoots = (config.paths?.dataRoots ?? []).map((d) =>
      d.endsWith('/**') ? d : `${d}/**`
    );
    const demoRoots = (config.paths?.demoRoots ?? []).map((d) =>
      d.endsWith('/**') ? d : `${d}/**`
    );
    dataDemoIgnores.push(...dataRoots, ...demoRoots);
  }

  const legacyIgnores: string[] = projectRoot ? findLegacyEslintIgnores(projectRoot) : []; // no-domain: Dynamic legacy ignore glob list

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

/**
 * Generates the canonical Vite+ unified configuration (vite.config.ts)
 * using the TypeScript Compiler AST printer.
 */
export function buildCanonicalVitePlusConfig(
  auditConfig: AuditConfig,
  projectRoot?: string
): string {
  const lintIgnores = resolveAuditConfigIgnoreGlobs(auditConfig, 'lint', projectRoot);
  const fmtIgnores = resolveAuditConfigIgnoreGlobs(auditConfig, 'fmt', projectRoot);
  return buildCanonicalVitePlusAstSource(auditConfig, lintIgnores, fmtIgnores);
}

export { extractAstPropertyBlock as extractObjectPropertyBlock };

function findLegacyTestBlock(projectRoot: string): string | null {
  const candidates = ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mjs'] as const;
  for (const vitestCandidate of candidates) {
    const candidatePath = path.resolve(projectRoot, vitestCandidate);
    if (fs.existsSync(candidatePath)) {
      try {
        const vitestRaw = fs.readFileSync(candidatePath, 'utf-8');
        const extracted = extractAstPropertyBlock(vitestRaw, 'test');
        if (extracted) return extracted;
      } catch {
        // catch-ok
      }
    }
  }

  try {
    const gitHeadRaw = childProcess.execSync('git show HEAD:vitest.config.ts', {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8'
    });
    const extracted = extractAstPropertyBlock(gitHeadRaw, 'test');
    if (extracted) return extracted;
  } catch {
    // catch-ok
  }

  return null;
}

export function syncViteConfigWithAuditConfig(
  projectRoot: string,
  auditConfig?: AuditConfig
): { modified: boolean; content: string } {
  const config = auditConfig ?? getAuditConfig(projectRoot);
  const viteConfigPath = path.resolve(projectRoot, 'vite.config.ts');
  const legacyTestBlock = findLegacyTestBlock(projectRoot);
  const legacyTestProp = legacyTestBlock ? parseLegacyTestPropertyNode(legacyTestBlock) : null;

  const lintIgnores = resolveAuditConfigIgnoreGlobs(config, 'lint', projectRoot);
  const fmtIgnores = resolveAuditConfigIgnoreGlobs(config, 'fmt', projectRoot);

  if (!fs.existsSync(viteConfigPath)) {
    const content = buildCanonicalVitePlusAstSource(
      config,
      lintIgnores,
      fmtIgnores,
      legacyTestProp
    );
    fs.writeFileSync(viteConfigPath, content, 'utf-8');
    return { modified: true, content };
  }

  const rawContent = fs.readFileSync(viteConfigPath, 'utf-8');
  const synced = synchronizeViteConfigAst(
    rawContent,
    config,
    lintIgnores,
    fmtIgnores,
    legacyTestProp
  );

  if (synced.modified) {
    fs.writeFileSync(viteConfigPath, synced.content, 'utf-8');
  }

  return synced;
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

  const summary = extractParsedConfigSummary(viteContent);
  const hasTest = summary.hasSection('test');
  const hasLint = summary.hasSection('lint');
  const hasPack = summary.hasSection('pack');

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

export const BANNED_COMPRESSION_MODULES = [
  'vite-plugin-compression',
  'vite-plugin-compression2'
] as const;

/**
 * Searches for homebrew compression scripts in scripts/ or other project directories.
 */
export function findHomebrewCompressionFiles(projectRoot: string): string[] {
  const detected: string[] = []; // no-domain: Non-domain dynamic path list
  const candidateDirs = ['scripts'];

  for (const d of candidateDirs) {
    const fullDir = path.resolve(projectRoot, d);
    if (!fs.existsSync(fullDir)) continue;

    function walk(cur: string): void {
      const entries = fs.readdirSync(cur, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(cur, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
            walk(entryPath);
          }
        } else if (entry.isFile()) {
          const lower = entry.name.toLowerCase();
          if (
            (lower.includes('precompress') || lower.includes('vite-plugin-compress')) &&
            (lower.endsWith('.ts') || lower.endsWith('.js') || lower.endsWith('.mjs'))
          ) {
            detected.push(toPosixRelative(projectRoot, entryPath));
          }
        }
      }
    }

    walk(fullDir);
  }

  return detected;
}

/**
 * Detects homebrew or third-party compression plugin imports in vite.config.ts.
 */
export function detectHomebrewCompressionImports(viteConfigContent: string): string[] {
  const detected: string[] = []; // no-domain: Non-domain dynamic import list
  const lines = viteConfigContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('import ') && !trimmed.startsWith('import{')) continue;

    for (const banned of BANNED_COMPRESSION_MODULES) {
      if (line.includes(`'${banned}'`) || line.includes(`"${banned}"`)) {
        detected.push(banned);
      }
    }

    const localMatch =
      line.match(/from\s+['"](\.[^'"]*precompress[^'"]*)['"]/i) ||
      line.match(/from\s+['"](\.[^'"]*vite-plugin-compress[^'"]*)['"]/i);
    if (localMatch && localMatch[1]) {
      detected.push(localMatch[1]);
    }
  }

  return Array.from(new Set(detected));
}

/**
 * Automatically migrates homebrew compression imports and calls in vite.config.ts
 * to canonical vitePrecompressPlugin from @francogp/auditor.
 */
export function migrateHomebrewCompressionInViteConfig(viteConfigContent: string): {
  content: string;
  modified: boolean;
} {
  let content = viteConfigContent;
  let modified = false;

  const importRegex =
    /import\s+\{\s*([a-zA-Z0-9_$]+)\s*\}\s+from\s+['"](\.[^'"]*precompress[^'"]*|vite-plugin-compression2?)['"];?/g;

  const matches = [...content.matchAll(importRegex)];
  for (const m of matches) {
    const fnName = m[1];
    const fullImport = m[0];

    content = content.replace(
      fullImport,
      `import { vitePrecompressPlugin } from '@francogp/auditor';`
    );
    if (fnName && fnName !== 'vitePrecompressPlugin') {
      const callRegex = new RegExp(`\\b${fnName}\\s*\\(`, 'g');
      content = content.replace(callRegex, 'vitePrecompressPlugin(');
    }
    modified = true;
  }

  return { content, modified };
}

/**
 * Removes homebrew compression scripts found on disk.
 */
export function cleanHomebrewCompressionFiles(projectRoot: string): string[] {
  const files = findHomebrewCompressionFiles(projectRoot);
  const removed: string[] = []; // no-domain: Non-domain dynamic path list
  for (const rel of files) {
    const fullPath = path.resolve(projectRoot, rel);
    if (fs.existsSync(fullPath)) {
      try {
        fs.rmSync(fullPath, { force: true });
        removed.push(rel);
      } catch {
        // catch-ok
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
        (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))
      ) {
        try {
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const updated = rewriteModuleSpecifiersToVitePlusAst(raw, fullPath);
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
    const pkg = getPackageJson(projectRoot, true);
    const nodeEngine = pkg?.engines?.node;
    if (typeof nodeEngine === 'string') {
      const m = nodeEngine.match(/\d+\.\d+\.\d+/);
      if (m) {
        fs.writeFileSync(nodeVersionPath, `${m[0]}\n`, 'utf-8');
        migrated = true;
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
  'vue-eslint-parser'
] as const;

function removeLegacyDependencies(
  deps?: Record<string, string>,
  devDeps?: Record<string, string>
): boolean {
  let modified = false;
  for (const dep of LEGACY_DEPS_TO_REMOVE) {
    if (devDeps && dep in devDeps) {
      delete devDeps[dep];
      modified = true;
    }
    if (deps && dep in deps) {
      delete deps[dep];
      modified = true;
    }
  }
  return modified;
}

const REQUIRED_VITE_PLUS_SCRIPTS: Record<string, string> = {
  check: 'vp check',
  'check:fix': 'vp check --fix',
  fmt: 'vp fmt',
  'fmt:check': 'vp fmt --check',
  test: 'vp test',
  'test:coverage': 'vp test --coverage'
};

export function migrateViteCommandsToVp(cmd: string): string {
  let updated = cmd;
  updated = updated.replace(/(^|\s|&&|;|\|)vite\s+build\b/g, '$1vp build');
  updated = updated.replace(/(^|\s|&&|;|\|)vite\s+preview\b/g, '$1vp preview');
  updated = updated.replace(/(^|\s|&&|;|\|)vite\s+--/g, '$1vp dev --');
  updated = updated.replace(/(^|\s|&&|;|\|)vite\s+dev\b/g, '$1vp dev');
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
  const pkg = getPackageJson(projectRoot, true);
  if (!pkg) return false;

  let modified = false;
  const nextDeps = pkg.dependencies ? { ...pkg.dependencies } : undefined;
  const nextDevDeps: Record<string, string> = { ...(pkg.devDependencies ?? {}) };
  const nextScripts: Record<string, string> = { ...(pkg.scripts ?? {}) };
  const nextOverrides: Record<string, string> = { ...(pkg.overrides ?? {}) };

  const minVersions = getAuditorMinimumVersions();
  const canonicalOverrides = getAuditorCanonicalOverrides();

  // 1. Add vite-plus if not present using canonical normalized caret range
  if (!nextDeps?.['vite-plus'] && !nextDevDeps['vite-plus']) {
    const vitePlusFloor = minVersions['vite-plus'] ?? '^1.3.0';
    nextDevDeps['vite-plus'] = normalizeToCaretRange(vitePlusFloor);
    modified = true;
  }

  // 2. Remove legacy ESLint packages
  if (removeLegacyDependencies(nextDeps, nextDevDeps)) {
    modified = true;
  }

  // 3. Synchronize canonical Vite+ overrides (vite -> @voidzero-dev/vite-plus-core, vitest -> bundled version)
  for (const [ovKey, ovVal] of Object.entries(canonicalOverrides)) {
    if (nextOverrides[ovKey] !== ovVal) {
      nextOverrides[ovKey] = ovVal;
      modified = true;
    }
  }

  // 4. Update npm scripts if they reference obsolete eslint and ensure canonical Vite+ scripts
  if (updateVitePlusScripts(nextScripts)) {
    modified = true;
  }

  // 5. Per official Vite+ rules ("When Vitest Is Directly Required"), if @vitest/coverage-v8,
  // @vue/test-utils, vitest, or test:coverage is present, keep vitest and @vitest/coverage-v8 pinned.
  const pinnedVitestVersion = canonicalOverrides.vitest;
  if (pinnedVitestVersion) {
    if (nextScripts['test:coverage'] && !nextDevDeps['@vitest/coverage-v8']) {
      nextDevDeps['@vitest/coverage-v8'] = pinnedVitestVersion;
      modified = true;
    }
    const hasVitestPeerConsumer =
      'vitest' in nextDevDeps ||
      '@vitest/coverage-v8' in nextDevDeps ||
      '@vue/test-utils' in nextDevDeps;
    if (hasVitestPeerConsumer && nextDevDeps.vitest !== pinnedVitestVersion) {
      nextDevDeps.vitest = pinnedVitestVersion;
      modified = true;
    }
    if (
      '@vitest/coverage-v8' in nextDevDeps &&
      nextDevDeps['@vitest/coverage-v8'] !== pinnedVitestVersion
    ) {
      nextDevDeps['@vitest/coverage-v8'] = pinnedVitestVersion;
      modified = true;
    }
  }

  if (modified) {
    writePackageJson(projectRoot, {
      ...pkg,
      ...(nextDeps ? { dependencies: nextDeps } : {}),
      devDependencies: nextDevDeps,
      scripts: nextScripts,
      ...(Object.keys(nextOverrides).length > 0 ? { overrides: nextOverrides } : {})
    });
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
  const viteConfigSync = syncViteConfigWithAuditConfig(projectRoot, config);
  const rewrittenFiles = rewriteImportsToVitePlus(projectRoot);
  const nodeVersionMigrated = migrateNodeVersion(projectRoot);
  const packageJsonUpdated = syncPackageJsonForVitePlus(projectRoot);
  const vscodeSync = syncVSCodeSettings(projectRoot, config);
  const removedConfigs = cleanLegacyConfigFiles(projectRoot);
  const viteConfigPath = path.resolve(projectRoot, 'vite.config.ts');
  if (fs.existsSync(viteConfigPath)) {
    try {
      const raw = fs.readFileSync(viteConfigPath, 'utf-8');
      const { content, modified } = migrateHomebrewCompressionInViteConfig(raw);
      if (modified) {
        fs.writeFileSync(viteConfigPath, content, 'utf-8');
      }
    } catch {
      // catch-ok
    }
  }
  const removedHomebrew = cleanHomebrewCompressionFiles(projectRoot);

  return {
    removedConfigs: [...removedConfigs, ...removedHomebrew],
    rewrittenFiles,
    viteConfigSync,
    nodeVersionMigrated,
    packageJsonUpdated,
    vscodeSync
  };
}
