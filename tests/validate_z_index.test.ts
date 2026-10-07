/**
 * tests/node/auditors/validate_z_index.test.ts
 *
 * Unit tests for ZIndexAuditor.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ZIndexAuditor } from '../src/suites/architecture/validate_z_index.ts';
import { Z_LAYERS } from '../src/suites/architecture/audit_rules.ts';

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
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('passes when all z-layers match the scss file', async () => {
    const scssEntries = Object.entries(Z_LAYERS)
      .map(([key, val]) => `  --z-${key.toLowerCase().replace(/_/g, '-')}: ${val};`)
      .join('\n');
    const validScss = `:root {\n${scssEntries}\n}\n`;
    await fs.writeFile(scssFile, validScss, 'utf-8');

    const auditor = new ZIndexAuditor(scssFile);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('detects missing variable in scss file', async () => {
    await fs.writeFile(scssFile, ':root { --z-base: 0; }', 'utf-8');

    const auditor = new ZIndexAuditor(scssFile);
    const result = await auditor.execute();

    expect(result.summary.errors).toBeGreaterThan(0);
    const missing = result.findings.find(e => e.ruleId === 'z-index-missing-var');
    expect(missing).toBeDefined();
  });

  it('detects mismatch in value between TS and scss', async () => {
    await fs.writeFile(scssFile, ':root { --z-base: 999; }', 'utf-8');

    const auditor = new ZIndexAuditor(scssFile);
    const result = await auditor.execute();

    const mismatch = result.findings.find(e => e.ruleId === 'z-index-mismatch');
    expect(mismatch).toBeDefined();
  });

  it('detects unreadable or non-existent file with z-index-read-error', async () => {
    const nonExistentPath = path.join(tempDir, 'does_not_exist.scss');
    const auditor = new ZIndexAuditor(nonExistentPath);
    const result = await auditor.execute();

    const readError = result.findings.find(e => e.ruleId === 'z-index-read-error');
    expect(readError).toBeDefined();
    expect(readError?.severity).toBe('error');
  });

  it('skips gracefully when explicitly disabled with styles.zLayersEnabled: false', async () => {
    const auditor = new ZIndexAuditor();
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('skipped');
  });
});

