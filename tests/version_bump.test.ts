/**
 * tests/version_bump.test.ts
 *
 * Unit tests for versionAnalyzer and bump_version CLI utilities.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  parseBaseSemver,
  calculateNextBaseVersion,
  generateBuildId,
  analyzeVersionBump,
  collectGitDiffMetrics
} from '../src/core/versionAnalyzer.ts';
import { execSync } from 'node:child_process';
import { applyVersionBump } from '../src/cli/bump_version.ts';

describe('Version Analyzer & SemVer Heuristics', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-version-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok: cleanup
    }
  });

  describe('parseBaseSemver', () => {
    it('parses standard semver versions', () => {
      expect(parseBaseSemver('1.2.3')).toEqual([1, 2, 3]);
      expect(parseBaseSemver('0.0.1')).toEqual([0, 0, 1]);
      expect(parseBaseSemver('10.20.30')).toEqual([10, 20, 30]);
    });

    it('parses semver versions with prerelease build timestamps', () => {
      expect(parseBaseSemver('1.4.0-build.20261002-140000')).toEqual([1, 4, 0]);
      expect(parseBaseSemver('2.0.0-alpha.1')).toEqual([2, 0, 0]);
    });

    it('falls back to [1, 0, 0] for invalid strings', () => {
      expect(parseBaseSemver('invalid')).toEqual([1, 0, 0]);
      expect(parseBaseSemver('')).toEqual([1, 0, 0]);
    });
  });

  describe('calculateNextBaseVersion', () => {
    it('bumps major version and resets minor and patch', () => {
      expect(calculateNextBaseVersion('1.4.3', 'major')).toBe('2.0.0');
      expect(calculateNextBaseVersion('0.1.9', 'major')).toBe('1.0.0');
    });

    it('bumps minor version and resets patch', () => {
      expect(calculateNextBaseVersion('1.4.3', 'minor')).toBe('1.5.0');
      expect(calculateNextBaseVersion('2.0.0', 'minor')).toBe('2.1.0');
    });

    it('bumps patch version', () => {
      expect(calculateNextBaseVersion('1.4.3', 'patch')).toBe('1.4.4');
      expect(calculateNextBaseVersion('2.1.0', 'patch')).toBe('2.1.1');
    });
  });

  describe('generateBuildId', () => {
    it('generates deterministic buildId from custom Temporal date', () => {
      const fixedDate = Temporal.ZonedDateTime.from('2026-10-02T15:30:45-03:00[America/Buenos_Aires]');
      const { buildId, buildDate } = generateBuildId(fixedDate);

      expect(buildId).toBe('20261002-153045');
      expect(buildDate).toContain('2026-10-02T15:30:45');
    });
  });

  describe('analyzeVersionBump heuristics', () => {
    it('recommends major when conventional commit indicates breaking change', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ version: '1.2.0' }), 'utf-8');

      const analysis = analyzeVersionBump({
        cwd: tempDir,
        commitMessage: 'feat!: completely redesigned plugin protocol architecture'
      });

      expect(analysis.recommendedBump).toBe('major');
      expect(analysis.baseVersion).toBe('1.2.0');
      expect(analysis.recommendedVersion).toContain('2.0.0-build.');
      expect(analysis.rationale).toContain('breaking change');
    });

    it('recommends minor when conventional commit has feat prefix', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ version: '1.2.0' }), 'utf-8');

      const analysis = analyzeVersionBump({
        cwd: tempDir,
        commitMessage: 'feat(cli): add auditor-version inspection tool'
      });

      expect(analysis.recommendedBump).toBe('minor');
      expect(analysis.recommendedVersion).toContain('1.3.0-build.');
    });

    it('recommends patch for maintenance or fix commits with small diffs', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ version: '1.2.0' }), 'utf-8');

      const analysis = analyzeVersionBump({
        cwd: tempDir,
        commitMessage: 'fix: correct typo in documentation'
      });

      expect(analysis.recommendedBump).toBe('patch');
      expect(analysis.recommendedVersion).toContain('1.2.1-build.');
    });
  });

  describe('applyVersionBump hermetic sandboxing', () => {
    it('applies version bump and writes package.json and version.ts for @francogp/auditor', () => {
      const pkgPath = path.join(tempDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ name: '@francogp/auditor', version: '1.0.0' }, null, 2), 'utf-8');

      const fixedDate = Temporal.ZonedDateTime.from('2026-10-02T18:00:00-03:00[America/Buenos_Aires]');
      const result = applyVersionBump({
        cwd: tempDir,
        bumpType: 'minor',
        customNow: fixedDate
      });

      expect(result.previousVersion).toBe('1.0.0');
      expect(result.newVersion).toBe('1.1.0-build.20261002-180000');
      expect(result.bumpType).toBe('minor');
      expect(result.buildId).toBe('20261002-180000');

      // Verify package.json updated on disk
      const updatedPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      expect(updatedPkg.version).toBe('1.1.0-build.20261002-180000');

      // Verify version.ts created on disk
      expect(fs.existsSync(result.versionTsPath)).toBe(true);
      const versionTsContent = fs.readFileSync(result.versionTsPath, 'utf-8');
      expect(versionTsContent).toContain("export const AUDITOR_VERSION = '1.1.0-build.20261002-180000';");
      expect(versionTsContent).toContain("export const AUDITOR_BUILD_ID = '20261002-180000';");
    });

    it('does not create version.ts for consumer host projects when unconfigured', () => {
      const pkgPath = path.join(tempDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ name: 'consumer-app', version: '1.0.0' }, null, 2), 'utf-8');

      const fixedDate = Temporal.ZonedDateTime.from('2026-10-02T18:00:00-03:00[America/Buenos_Aires]');
      const result = applyVersionBump({
        cwd: tempDir,
        bumpType: 'minor',
        customNow: fixedDate
      });

      expect(result.versionTsPath).toBe('');
      expect(fs.existsSync(path.join(tempDir, 'src/version.ts'))).toBe(false);
    });

    it('honors major bump override', () => {
      const pkgPath = path.join(tempDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ name: 'my-project', version: '1.4.2' }, null, 2), 'utf-8');

      const fixedDate = Temporal.ZonedDateTime.from('2026-10-02T18:00:00-03:00[America/Buenos_Aires]');
      const result = applyVersionBump({
        cwd: tempDir,
        bumpType: 'major',
        customNow: fixedDate
      });

      expect(result.newVersion).toBe('2.0.0-build.20261002-180000');
      expect(result.bumpType).toBe('major');
    });

    it('honors patch bump override', () => {
      const pkgPath = path.join(tempDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ name: 'my-project', version: '2.0.0' }, null, 2), 'utf-8');

      const fixedDate = Temporal.ZonedDateTime.from('2026-10-02T18:00:00-03:00[America/Buenos_Aires]');
      const result = applyVersionBump({
        cwd: tempDir,
        bumpType: 'patch',
        customNow: fixedDate
      });

      expect(result.newVersion).toBe('2.0.1-build.20261002-180000');
      expect(result.bumpType).toBe('patch');
    });

    it('automatically synchronizes public/version.json preserving v prefix when it exists', () => {
      const pkgPath = path.join(tempDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ name: 'pokeborrador-host', version: '0.6.0' }, null, 2), 'utf-8');

      const publicDir = path.join(tempDir, 'public');
      fs.mkdirSync(publicDir, { recursive: true });
      const versionJsonPath = path.join(publicDir, 'version.json');
      fs.writeFileSync(versionJsonPath, JSON.stringify({ version: 'v0.6.0-build.20261002-172710' }, null, 2), 'utf-8');

      const fixedDate = Temporal.ZonedDateTime.from('2026-10-04T02:30:00-03:00[America/Buenos_Aires]');
      const result = applyVersionBump({
        cwd: tempDir,
        bumpType: 'patch',
        customNow: fixedDate
      });

      expect(result.newVersion).toBe('0.6.1-build.20261004-023000');
      expect(result.syncedFiles).toContain(versionJsonPath);

      const updatedVersionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));
      expect(updatedVersionJson.version).toBe('v0.6.1-build.20261004-023000');
    });

    it('synchronizes custom JSON and TS targets specified in syncTargets', () => {
      const pkgPath = path.join(tempDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ name: 'custom-app', version: '1.0.0' }, null, 2), 'utf-8');

      const fixedDate = Temporal.ZonedDateTime.from('2026-10-04T02:30:00-03:00[America/Buenos_Aires]');
      const result = applyVersionBump({
        cwd: tempDir,
        bumpType: 'minor',
        customNow: fixedDate,
        syncTargets: [
          'metadata/version.json',
          { path: 'src/config/appVersion.ts', tsExportName: 'CURRENT_APP_VERSION' }
        ]
      });

      expect(result.newVersion).toBe('1.1.0-build.20261004-023000');

      // Check metadata/version.json
      const metaPath = path.join(tempDir, 'metadata/version.json');
      expect(fs.existsSync(metaPath)).toBe(true);
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      expect(meta.version).toBe('1.1.0-build.20261004-023000');

      // Check src/config/appVersion.ts
      const tsPath = path.join(tempDir, 'src/config/appVersion.ts');
      expect(fs.existsSync(tsPath)).toBe(true);
      const tsContent = fs.readFileSync(tsPath, 'utf-8');
      expect(tsContent).toContain("export const CURRENT_APP_VERSION = '1.1.0-build.20261004-023000';");
    });

    it('respects autoSyncPublicVersionJson: false', () => {
      const pkgPath = path.join(tempDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ name: 'no-sync-app', version: '1.0.0' }, null, 2), 'utf-8');

      const publicDir = path.join(tempDir, 'public');
      fs.mkdirSync(publicDir, { recursive: true });
      const versionJsonPath = path.join(publicDir, 'version.json');
      fs.writeFileSync(versionJsonPath, JSON.stringify({ version: 'v1.0.0' }, null, 2), 'utf-8');

      const fixedDate = Temporal.ZonedDateTime.from('2026-10-04T02:30:00-03:00[America/Buenos_Aires]');
      const result = applyVersionBump({
        cwd: tempDir,
        bumpType: 'patch',
        customNow: fixedDate,
        autoSyncPublicVersionJson: false
      });

      expect(result.syncedFiles).not.toContain(versionJsonPath);
      const unchanged = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));
      expect(unchanged.version).toBe('v1.0.0');
    });
  });

  describe('collectGitDiffMetrics', () => {
    it('returns empty metrics gracefully in non-git directory', () => {
      const metrics = collectGitDiffMetrics(tempDir);
      expect(metrics.filesChanged).toBe(0);
      expect(metrics.insertions).toBe(0);
      expect(metrics.deletions).toBe(0);
      expect(metrics.changedFiles).toHaveLength(0);
    });

    it('collects insertions, deletions, and additions in a git repository', () => {
      execSync('git init -b main', { cwd: tempDir, stdio: 'ignore' });
      execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'ignore' });
      execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'ignore' });

      // Initial commit
      const initialFile = path.join(tempDir, 'initial.txt');
      fs.writeFileSync(initialFile, 'line1\nline2\nline3\n', 'utf-8');
      execSync('git add initial.txt && git commit -m "initial"', { cwd: tempDir, stdio: 'ignore' });

      // Modify file and add new untracked file
      fs.writeFileSync(initialFile, 'line1\nmodified line 2\nline3\nline4\n', 'utf-8');
      const newFile = path.join(tempDir, 'new.txt');
      fs.writeFileSync(newFile, 'new line\n', 'utf-8');

      const metrics = collectGitDiffMetrics(tempDir);
      expect(metrics.filesChanged).toBeGreaterThanOrEqual(1);
      expect(metrics.changedFiles.some(f => f.path === 'initial.txt')).toBe(true);
      expect(metrics.changedFiles.some(f => f.path === 'new.txt')).toBe(true);
    });
  });
});


