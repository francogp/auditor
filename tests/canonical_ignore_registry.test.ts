/**
 * tests/canonical_ignore_registry.test.ts
 *
 * Unit tests for the centralized canonical ignore registry engine.
 */

import os from 'node:os';

import { describe, it, expect } from 'vite-plus/test';

import {
  ALWAYS_IGNORE_DIRS,
  CANONICAL_IGNORE_DIRS,
  getEffectiveIgnoreDirs,
  getEffectiveUnignoreDirs,
  getEffectiveIgnoreGlobs,
  getLockedSkillsIgnoreGlobs,
  registerDynamicCachePath,
  SuiteIgnoreRegistry
} from '../src/core/canonicalIgnoreRegistry.ts';

describe('canonicalIgnoreRegistry', () => {
  it('exposes immutable ALWAYS_IGNORE_DIRS containing only canonical infrastructure and scratch directories without subauditors', () => {
    expect(ALWAYS_IGNORE_DIRS.has('node_modules')).toBe(true);
    expect(ALWAYS_IGNORE_DIRS.has('scratch')).toBe(true);
    expect(ALWAYS_IGNORE_DIRS.has('.git')).toBe(true);
    expect(ALWAYS_IGNORE_DIRS.has('.vscode')).toBe(true);
    expect(ALWAYS_IGNORE_DIRS.has('.github')).toBe(true);
    expect(ALWAYS_IGNORE_DIRS.has('.gemini')).toBe(true);
    expect(ALWAYS_IGNORE_DIRS.has('.auditor')).toBe(true);
    expect(ALWAYS_IGNORE_DIRS.has('tmp')).toBe(true);
    expect(ALWAYS_IGNORE_DIRS.has('volumes')).toBe(true);

    // Tool-specific caches must be declared by their suites via cachePaths, not in ALWAYS_IGNORE_DIRS
    expect(ALWAYS_IGNORE_DIRS.has('dist')).toBe(false);
    expect(ALWAYS_IGNORE_DIRS.has('coverage')).toBe(false);
    expect(ALWAYS_IGNORE_DIRS.has('.vitest-cache')).toBe(false);
    expect(ALWAYS_IGNORE_DIRS.has('.fallow')).toBe(false);
    expect(ALWAYS_IGNORE_DIRS.has('.oxlintcache')).toBe(false);
    expect(ALWAYS_IGNORE_DIRS.has('.stylelintcache')).toBe(false);
    expect(ALWAYS_IGNORE_DIRS.has('.tsbuildinfo')).toBe(false);

    // Must NOT contain arbitrary documentation or code roots
    expect(ALWAYS_IGNORE_DIRS.has('src')).toBe(false);
    expect(ALWAYS_IGNORE_DIRS.has('scripts')).toBe(false);
    expect(ALWAYS_IGNORE_DIRS.has('tests')).toBe(false);
  });

  it('exposes CANONICAL_IGNORE_DIRS matching ALWAYS_IGNORE_DIRS without hardcoded application folders', () => {
    for (const d of ALWAYS_IGNORE_DIRS) {
      expect(CANONICAL_IGNORE_DIRS.has(d)).toBe(true);
    }
    // Application folders must NOT be hardcoded in canonical ignore constants
    expect(CANONICAL_IGNORE_DIRS.has('public')).toBe(false);
    expect(CANONICAL_IGNORE_DIRS.has('packages')).toBe(false);
    expect(CANONICAL_IGNORE_DIRS.has('docs')).toBe(false);
  });

  it('getEffectiveIgnoreDirs merges canonical ignores with project configuration', () => {
    const effective = getEffectiveIgnoreDirs(process.cwd());
    expect(effective.has('node_modules')).toBe(true);
    expect(effective.has('scratch')).toBe(true);
  });

  it('getEffectiveUnignoreDirs dynamically derives top-level unignore segments from skillsRoots or config', () => {
    // In any project root, derives .agents segment from canonical skillsRoots default
    const unignores = getEffectiveUnignoreDirs(os.tmpdir());
    expect(Array.isArray(unignores)).toBe(true);
    expect(unignores).toContain('.agents');

    // When .agents physically exists in project root (like this repository), dynamically includes .agents
    const repoUnignores = getEffectiveUnignoreDirs(process.cwd());
    expect(repoUnignores).toContain('.agents');
  });

  it('getEffectiveIgnoreGlobs produces deduplicated glob list with /** wildcard for each ignore dir', () => {
    const globs = getEffectiveIgnoreGlobs(process.cwd());
    expect(globs).toContain('node_modules/**');
    expect(globs).toContain('scratch/**');
  });

  it('getLockedSkillsIgnoreGlobs returns glob patterns for locked skills mapped to configured skills roots', () => {
    const lockedGlobs = getLockedSkillsIgnoreGlobs(process.cwd());
    expect(Array.isArray(lockedGlobs)).toBe(true);
    if (lockedGlobs.length > 0) {
      // Each glob should end with /**
      expect(lockedGlobs.every((g) => g.endsWith('/**'))).toBe(true);
    }
  });

  it('registerDynamicCachePath allows suites to register custom tool cache paths dynamically', () => {
    registerDynamicCachePath('dist');
    registerDynamicCachePath('.fallow');
    const effective = getEffectiveIgnoreDirs(process.cwd());
    expect(effective.has('dist')).toBe(true);
    expect(effective.has('.fallow')).toBe(true);

    const globs = getEffectiveIgnoreGlobs(process.cwd());
    expect(globs).toContain('dist/**');
    expect(globs).toContain('.fallow/**');
  });

  it('SuiteIgnoreRegistry registers and stores ignore requirements from suites', () => {
    SuiteIgnoreRegistry.reset();
    SuiteIgnoreRegistry.register({
      suiteId: 'test_suite',
      ignoredDirs: ['custom-cache'],
      ignoreGlobs: ['custom-cache/**', '*.tmp']
    });

    expect(SuiteIgnoreRegistry.getAll().length).toBe(1);
    expect(SuiteIgnoreRegistry.getAll()[0]?.suiteId).toBe('test_suite');

    SuiteIgnoreRegistry.reset();
    expect(SuiteIgnoreRegistry.getAll().length).toBe(0);
  });
});
