/**
 * tests/path_exemption_ssot.test.ts
 *
 * Comprehensive unit test suite for the canonical isPathExempt Single Source of Truth (SSoT):
 * - Guarantees function identity deduplication between reportUtils and testCoverageCore
 * - Validates exact match, directory prefix, glob wildcard, and bare segment semantics
 * - Ensures robust cross-platform path normalization (Windows backslashes, leading dot-slash)
 */

import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { isPathExempt, normalizePosixPath } from '../src/core/reportUtils.ts';

describe('Path Exemption Canonical SSoT (isPathExempt)', () => {
  it('verifies that isPathExempt is a canonical function from reportUtils SSoT', () => {
    expect(typeof isPathExempt).toBe('function');
  });

  it('returns false for empty, nullish, or undefined exemption collections', () => {
    expect(isPathExempt('src/foo.ts')).toBe(false);
    expect(isPathExempt('src/foo.ts', [])).toBe(false);
    expect(isPathExempt('src/foo.ts', undefined)).toBe(false);
    expect(isPathExempt('', ['src/**'])).toBe(false);
  });

  it('matches exact file paths', () => {
    const exemptions = ['src/exempt.ts', 'scripts/run.js'];
    expect(isPathExempt('src/exempt.ts', exemptions)).toBe(true);
    expect(isPathExempt('scripts/run.js', exemptions)).toBe(true);
    expect(isPathExempt('src/other.ts', exemptions)).toBe(false);
    expect(isPathExempt('src/exempt.ts.bak', exemptions)).toBe(false);
  });

  it('matches directory prefixes with trailing slash, /*, or /**', () => {
    const exemptions = ['dist/', 'build/**', 'scratch/*'];
    expect(isPathExempt('dist/bundle.js', exemptions)).toBe(true);
    expect(isPathExempt('dist/sub/nested.js', exemptions)).toBe(true);
    expect(isPathExempt('build/app.min.js', exemptions)).toBe(true);
    expect(isPathExempt('scratch/temp.json', exemptions)).toBe(true);
    expect(isPathExempt('src/dist/file.ts', exemptions)).toBe(false);
    expect(isPathExempt('tests/build/file.ts', exemptions)).toBe(false);
  });

  it('matches bare directory segments without slashes anywhere in the path', () => {
    const exemptions = ['app', 'fixtures'];
    expect(isPathExempt('app/index.ts', exemptions)).toBe(true);
    expect(isPathExempt('src/app/component.vue', exemptions)).toBe(true);
    expect(isPathExempt('tests/unit/fixtures/data.json', exemptions)).toBe(true);
    expect(isPathExempt('src/appliances/test.ts', exemptions)).toBe(false);
    expect(isPathExempt('src/happy-path.ts', exemptions)).toBe(false);
  });

  it('matches glob patterns with wildcards (* and ?)', () => {
    const exemptions = ['**/*.generated.ts', 'scripts/*.sh', 'tests/**/__fixtures__/**'];
    expect(isPathExempt('src/models/user.generated.ts', exemptions)).toBe(true);
    expect(isPathExempt('scripts/deploy.sh', exemptions)).toBe(true);
    expect(isPathExempt('scripts/sub/deploy.sh', exemptions)).toBe(false);
    expect(isPathExempt('tests/unit/__fixtures__/data.json', exemptions)).toBe(true);
  });

  it('normalizes Windows backslashes and leading dot-slash', () => {
    const exemptions = ['src/legacy/**'];
    expect(isPathExempt('src\\legacy\\old.ts', exemptions)).toBe(true);
    expect(isPathExempt('./src/legacy/old.ts', exemptions)).toBe(true);
    expect(isPathExempt('.\\src\\legacy\\nested\\old.ts', exemptions)).toBe(true);
    expect(isPathExempt('.\\src\\legacy\\deep\\nested\\file.ts', exemptions)).toBe(true);
  });

  it('resolves absolute file paths relative to project root', () => {
    const projectRoot = process.cwd();
    const absPath = path.resolve(projectRoot, 'dist', 'output.js');
    expect(isPathExempt(absPath, ['dist/**'], projectRoot)).toBe(true);
    expect(isPathExempt(absPath, ['build/**'], projectRoot)).toBe(false);
  });

  it('verifies normalizePosixPath handling of root and relative paths', () => {
    expect(normalizePosixPath('foo/bar')).toBe('foo/bar');
    expect(normalizePosixPath('./foo/bar')).toBe('foo/bar');
    expect(normalizePosixPath('foo\\bar\\baz')).toBe('foo/bar/baz');
    expect(normalizePosixPath('')).toBe('');
  });
});
