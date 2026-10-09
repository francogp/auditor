/**
 * tests/node/auditors/validate_z_index.test.ts
 *
 * Exhaustive unit tests for ZIndexAuditor (conforming to BaseAuditor 5-point contract).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ZIndexAuditor, fixZIndexLiteralMatch } from '../src/suites/architecture/validate_z_index.ts';
import { Z_LAYERS } from '../src/suites/architecture/audit_rules.ts';
import { setAuditConfig, defineAuditConfig, resetAuditConfig } from '../src/core/auditConfig.ts';

describe('ZIndexAuditor', () => {
  let tempDir: string;
  let scssFile: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zindex-test-'));
    scssFile = path.join(tempDir, '_base.scss');
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Rule Declarations & Metadata', () => {
    it('initializes with correct metadata and rules', () => {
      const auditor = new ZIndexAuditor();
      expect(auditor.id).toBe('validate_z_index');
      expect(auditor.packageName).toBe('Z-Index');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toEqual([
        'z-index-missing-var',
        'z-index-mismatch',
        'z-index-read-error',
        'z-index-hardcoded-literal',
        'z-index-isolated-constant'
      ]);
      expect(auditor.ruleDescriptions).toBeDefined();
      expect(Object.keys(auditor.ruleDescriptions!)).toHaveLength(5);
    });
  });

  it('passes cleanly when scss matches TS and code uses variables (Clean Path)', async () => {
    const scssEntries = Object.entries(Z_LAYERS)
      .map(([key, val]) => `  --z-${key.toLowerCase().replace(/_/g, '-')}: ${val};`)
      .join('\n');
    const validScss = `:root {\n${scssEntries}\n}\n`;
    await fs.writeFile(scssFile, validScss, 'utf-8');

    // Archivo de código limpio consumiendo variables CSS
    const cleanVue = `<template><div class="box">Clean</div></template>\n<style>\n.box { z-index: var(--z-modal); }\n</style>`;
    await fs.writeFile(path.join(tempDir, 'Clean.vue'), cleanVue, 'utf-8');

    const cleanTs = `export const modalLayer = Z_LAYERS.MODAL;\n`;
    await fs.writeFile(path.join(tempDir, 'clean.ts'), cleanTs, 'utf-8');

    const auditor = new ZIndexAuditor(scssFile, [tempDir], tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('detects missing variable in scss file (z-index-missing-var)', async () => {
    await fs.writeFile(scssFile, ':root { --z-base: 0; }', 'utf-8');

    const auditor = new ZIndexAuditor(scssFile, [tempDir], tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBeGreaterThan(0);
    const missing = result.findings.find(e => e.ruleId === 'z-index-missing-var');
    expect(missing).toBeDefined();
    expect(missing?.severity).toBe('error');
  });

  it('detects mismatch in value between TS and scss (z-index-mismatch)', async () => {
    await fs.writeFile(scssFile, ':root { --z-base: 999; }', 'utf-8');

    const auditor = new ZIndexAuditor(scssFile, [tempDir], tempDir);
    const result = await auditor.execute();

    const mismatch = result.findings.find(e => e.ruleId === 'z-index-mismatch');
    expect(mismatch).toBeDefined();
    expect(mismatch?.severity).toBe('error');
  });

  it('detects unreadable or non-existent file with z-index-read-error', async () => {
    const nonExistentPath = path.join(tempDir, 'does_not_exist.scss');
    const auditor = new ZIndexAuditor(nonExistentPath, [tempDir], tempDir);
    const result = await auditor.execute();

    const readError = result.findings.find(e => e.ruleId === 'z-index-read-error');
    expect(readError).toBeDefined();
    expect(readError?.severity).toBe('error');
  });

  it('detects hardcoded numeric z-index literals in components (z-index-hardcoded-literal)', async () => {
    const scssEntries = Object.entries(Z_LAYERS)
      .map(([key, val]) => `  --z-${key.toLowerCase().replace(/_/g, '-')}: ${val};`)
      .join('\n');
    await fs.writeFile(scssFile, `:root {\n${scssEntries}\n}\n`, 'utf-8');

    const violatingVue = `<template><div class="bad">Bad</div></template>\n<style>\n.bad { z-index: 11000; }\n</style>`;
    await fs.writeFile(path.join(tempDir, 'Violating.vue'), violatingVue, 'utf-8');

    const auditor = new ZIndexAuditor(scssFile, [tempDir], tempDir);
    const result = await auditor.execute();

    const hardcoded = result.findings.find(e => e.ruleId === 'z-index-hardcoded-literal');
    expect(hardcoded).toBeDefined();
    expect(hardcoded?.message).toContain('Z_LAYERS.MODAL');
    expect(hardcoded?.message).toContain('var(--z-modal)');
  });

  it('detects isolated Z_INDEX constant declarations outside Z_LAYERS (z-index-isolated-constant)', async () => {
    const scssEntries = Object.entries(Z_LAYERS)
      .map(([key, val]) => `  --z-${key.toLowerCase().replace(/_/g, '-')}: ${val};`)
      .join('\n');
    await fs.writeFile(scssFile, `:root {\n${scssEntries}\n}\n`, 'utf-8');

    const violatingTs = `export const BAD_Z_INDEX_PANEL = 1050;\n`;
    await fs.writeFile(path.join(tempDir, 'violating.ts'), violatingTs, 'utf-8');

    const auditor = new ZIndexAuditor(scssFile, [tempDir], tempDir);
    const result = await auditor.execute();

    const isolated = result.findings.find(e => e.ruleId === 'z-index-isolated-constant');
    expect(isolated).toBeDefined();
    expect(isolated?.message).toContain('PROHIBIDO declarar constantes de Z-Index fuera de Z_LAYERS');
  });

  it('fixes CSS z-index and JS zIndex literals with fixZIndexLiteralMatch', () => {
    expect(fixZIndexLiteralMatch('z-index: 11000')).toBe('z-index: var(--z-modal)');
    expect(fixZIndexLiteralMatch('zIndex: 11000')).toBe("zIndex: 'var(--z-modal)'");
    expect(fixZIndexLiteralMatch('z-index: 11005')).toBe('z-index: calc(var(--z-modal) + 5)');
    expect(fixZIndexLiteralMatch('invalid')).toBe('invalid');
  });

  it('skips gracefully when explicitly disabled with styles.zLayersEnabled: false', async () => {
    setAuditConfig(defineAuditConfig({
      name: 'test-app',
      styles: { zLayersEnabled: false }
    }));

    const auditor = new ZIndexAuditor();
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('skipped');
  });
});
