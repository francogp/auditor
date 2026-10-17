import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { defineAuditConfig } from '../src/core/auditConfigDefaults.ts';
import { evaluateSuiteStatus } from '../src/core/suiteGating.ts';
import { OxfmtAuditor, OXFMT_RULES } from '../src/suites/architecture/validate_oxfmt.ts';

describe('validate_oxfmt (4 Canary Matrix)', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oxfmt-test-'));
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'oxfmt-test', type: 'module' }, null, 2),
      'utf-8'
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('C-FMT-01: declares all expected canonical rules, 7-field capabilities, and remediations', () => {
    const auditor = new OxfmtAuditor(tempDir);
    expect(auditor.id).toBe('validate_oxfmt');
    expect(auditor.ruleIds).toEqual(OXFMT_RULES);
    expect(auditor.capabilities.speed).toBe('light');
    expect(auditor.capabilities.fix).toBe('normal');
    expect(auditor.capabilities.critical).toBe(true);
    expect(auditor.capabilities.md).toBe(false);
    expect(auditor.capabilities.ast).toBe(false);
    expect(auditor.capabilities.changedOnly).toBe(false);
    expect(auditor.capabilities.phase).toBe('normal');
    expect(auditor.ruleRemediations['oxfmt-violation']).toBeDefined();
    expect(auditor.ruleRemediations['oxfmt-violation'].length).toBeGreaterThan(20);
  });

  it('C-FMT-02: suite is properly gated when oxfmt or fmt is disabled in config', () => {
    const configDisabled = defineAuditConfig({
      name: 'test-app',
      oxfmt: { enabled: false }
    });
    const status = evaluateSuiteStatus('validate_oxfmt', configDisabled);
    expect(status.enabled).toBe(false);

    const configViteFmtDisabled = defineAuditConfig({
      name: 'test-app',
      vitePlusConfig: {
        enabled: true,
        fmt: { enabled: false }
      }
    });
    const status2 = evaluateSuiteStatus('validate_oxfmt', configViteFmtDisabled);
    expect(status2.enabled).toBe(false);
  });

  it('C-FMT-03: flags oxfmt-violation when files with formatting issues exist', async () => {
    // Unformatted code (extra spaces, double quotes instead of single quotes)
    const unformattedCode = 'const   hello =   "world"  ;\n';
    const filePath = path.join(tempDir, 'test.ts');
    fs.writeFileSync(filePath, unformattedCode, 'utf-8');

    // Create a local vite.config.ts with standard formatting rules
    fs.writeFileSync(
      path.join(tempDir, 'vite.config.ts'),
      `export default { fmt: { singleQuote: true, semi: true } };\n`,
      'utf-8'
    );

    const auditor = new OxfmtAuditor(tempDir);
    await auditor.runAudit();
    const result = await auditor.finishAudit();

    expect(result.findings.some((f) => f.ruleId === 'oxfmt-violation')).toBe(true);
    expect(result.summary.errors).toBeGreaterThan(0);
    expect(result.status).toBe('failed');
  });

  it('C-FMT-04: auto-fix reformats files and subsequent check passes cleanly with 0 errors', async () => {
    const unformattedCode = 'const   foo =   "bar"  ;\n';
    const filePath = path.join(tempDir, 'foo.ts');
    fs.writeFileSync(filePath, unformattedCode, 'utf-8');

    fs.writeFileSync(
      path.join(tempDir, 'vite.config.ts'),
      `export default { fmt: { singleQuote: true, semi: true } };\n`,
      'utf-8'
    );

    // 1. Run in fix mode
    const fixAuditor = new OxfmtAuditor({ projectRoot: tempDir, fix: true });
    await fixAuditor.runAudit();
    await fixAuditor.finishAudit();

    // 2. Run in check mode to verify clean path
    const checkAuditor = new OxfmtAuditor(tempDir);
    await checkAuditor.runAudit();
    const checkResult = await checkAuditor.finishAudit();

    expect(checkResult.summary.errors).toBe(0);
    expect(checkResult.summary.warnings).toBe(0);
    expect(checkResult.status).toBe('passed');
  });
});
