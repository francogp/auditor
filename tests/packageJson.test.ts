/**
 * tests/packageJson.test.ts
 *
 * Dedicated unit test suite for getPackageJson, clearPackageJsonCache, and writePackageJson.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getPackageJson, clearPackageJsonCache, writePackageJson, type PackageJsonDTO } from '../src/core/packageJson.ts';

describe('packageJson core helper', () => {
  const scratchDir = path.resolve(process.cwd(), 'scratch/test_package_json_' + crypto.randomUUID());

  beforeEach(() => {
    clearPackageJsonCache();
    fs.mkdirSync(scratchDir, { recursive: true });
  });

  afterEach(() => {
    clearPackageJsonCache();
    if (fs.existsSync(scratchDir)) {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it('reads and parses valid package.json', () => {
    const pkgData: PackageJsonDTO = {
      name: 'test-app',
      version: '1.0.0',
      type: 'module',
      scripts: { build: 'vite build' }
    };
    fs.writeFileSync(path.join(scratchDir, 'package.json'), JSON.stringify(pkgData), 'utf-8');

    const result = getPackageJson(scratchDir);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('test-app');
    expect(result?.version).toBe('1.0.0');
    expect(result?.scripts?.build).toBe('vite build');
  });

  it('returns cached object on repeated calls without re-reading disk', () => {
    const pkgPath = path.join(scratchDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'cached-app', version: '1.0.0' }), 'utf-8');

    const first = getPackageJson(scratchDir);
    expect(first?.version).toBe('1.0.0');

    // Mutate file on disk directly
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'cached-app', version: '2.0.0' }), 'utf-8');

    const second = getPackageJson(scratchDir);
    expect(second?.version).toBe('1.0.0'); // Cached value preserved

    clearPackageJsonCache();
    const third = getPackageJson(scratchDir);
    expect(third?.version).toBe('2.0.0'); // Refreshed after cache clear
  });

  it('returns null when package.json does not exist', () => {
    const nonExistentDir = path.join(scratchDir, 'missing');
    const result = getPackageJson(nonExistentDir);
    expect(result).toBeNull();
  });

  it('returns null gracefully on corrupt JSON syntax', () => {
    fs.writeFileSync(path.join(scratchDir, 'package.json'), '{ invalid json, }', 'utf-8');
    const result = getPackageJson(scratchDir);
    expect(result).toBeNull();
  });

  it('writePackageJson writes to disk and updates cache immediately', () => {
    const data: PackageJsonDTO = {
      name: 'written-app',
      version: '3.0.0'
    };
    writePackageJson(scratchDir, data);

    const onDisk = JSON.parse(fs.readFileSync(path.join(scratchDir, 'package.json'), 'utf-8'));
    expect(onDisk.name).toBe('written-app');
    expect(onDisk.version).toBe('3.0.0');

    const cached = getPackageJson(scratchDir);
    expect(cached?.name).toBe('written-app');
    expect(cached?.version).toBe('3.0.0');
  });
});
