/**
 * tests/stamp_version.test.ts
 *
 * Unit tests for stamp_version CLI utility.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { stampVersion } from '../src/cli/stamp_version.ts';

describe('stamp_version CLI Utility', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-stamp-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok
    }
  });

  it('stamps package.json and generates src/core/version.ts with build metadata', () => {
    const pkgPath = path.join(tempDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'test-app', version: '2.5.0' }, null, 2), 'utf-8');

    const result = stampVersion(tempDir);

    expect(result.version).toMatch(/^2\.5\.0-build\.\d{8}-\d{6}$/);
    expect(result.buildId).toMatch(/^\d{8}-\d{6}$/);
    expect(result.packageJsonPath).toBe(pkgPath);

    // Verify package.json updated on disk
    const updatedPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(updatedPkg.version).toBe(result.version);

    // Verify src/core/version.ts created
    const versionTsPath = path.join(tempDir, 'src/core/version.ts');
    expect(fs.existsSync(versionTsPath)).toBe(true);
    const versionTsContent = fs.readFileSync(versionTsPath, 'utf-8');
    expect(versionTsContent).toContain(`export const AUDITOR_VERSION = '${result.version}';`);
    expect(versionTsContent).toContain(`export const AUDITOR_BUILD_ID = '${result.buildId}';`);
  });

  it('throws an error if package.json does not exist in target root', () => {
    expect(() => stampVersion(tempDir)).toThrow(/package\.json not found/);
  });

  it('preserves existing base semver when version already had a prerelease tag', () => {
    const pkgPath = path.join(tempDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'test-app', version: '1.4.2-build.20261001-120000' }, null, 2), 'utf-8');

    const result = stampVersion(tempDir);
    expect(result.version.startsWith('1.4.2-build.')).toBe(true);
  });
});
